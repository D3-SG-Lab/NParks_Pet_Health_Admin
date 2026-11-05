/** Daily AM/PM inspections (BE-011, FE-009, Inspections board p.6). */
import { SESSIONS } from "@/config/app"
import { nowISO, sessionCloses, todayISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import { fmtTime } from "@/lib/format"
import type { Animal, ChecklistItem, Inspection, InspectionResult, Kennel, KennelBlock, Session } from "@/types/domain"

import {
  appendAudit,
  canSeeAnimal,
  canSeeKennel,
  clone,
  currentUser,
  delay,
  getDb,
  nextId,
  notify,
  requirePermission,
  userName,
  write,
} from "./core"
import { checkInfo, inspectionFor, inspectionSummary, type CheckInfo } from "./derive"
import { createObservationRecord, processObservation } from "./observations"

export interface BoardTile {
  kennel: Kennel
  animal: Animal | null
  check: CheckInfo | null
  /** "08:02 · normal", "Overdue · due 08:00", "Cleaning until 22/10"… */
  label: string
  inspectorName: string | null
}

export interface BoardBlock {
  block: KennelBlock
  tiles: BoardTile[]
  done: number
  expected: number
  vacant: number
  assignedTo: string[]
}

export interface SessionBoard {
  date: string
  session: Session
  closes: string
  blocks: BoardBlock[]
  totals: { completed: number; expected: number; stillDue: number; overdue: number; overdueList: string[]; abnormal: number }
}

export async function getSessionBoard(date: string, session: Session): Promise<SessionBoard> {
  await delay()
  const db = getDb()
  const user = currentUser(db)
  const animalsByKennel = new Map(db.animals.filter((a) => a.stayStatus !== "released").map((a) => [a.kennelCode, a]))
  const blocks: BoardBlock[] = []
  let completed = 0
  let expected = 0
  let stillDue = 0
  let abnormal = 0
  const overdueList: string[] = []

  for (const block of db.kennelBlocks) {
    const kennels = db.kennels
      .filter((k) => k.blockCode === block.code && canSeeKennel(user, k.code))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    if (kennels.length === 0) continue
    // Isolation ward appears only when occupied.
    if (block.kind === "isolation" && !kennels.some((k) => animalsByKennel.has(k.code))) continue
    const tiles: BoardTile[] = kennels.map((k) => {
      const a = animalsByKennel.get(k.code) ?? null
      if (!a || a.arrivalDate > date) {
        const label =
          k.status === "cleaning"
            ? `Cleaning until ${k.availableFrom ? `${k.availableFrom.slice(8, 10)}/${k.availableFrom.slice(5, 7)}` : "further notice"}`
            : k.status === "out_of_service"
              ? "Out of service"
              : "Vacant"
        return { kennel: clone(k), animal: null, check: null, label, inspectorName: null }
      }
      const check = checkInfo(db, a, date, session)
      const insp = check.inspectionId ? db.inspections.find((i) => i.id === check.inspectionId) : undefined
      let label = "Due"
      if (check.state === "done") label = `${fmtTime(check.at!)} · normal`
      else if (check.state === "abnormal") {
        const abn = insp?.results.filter((r) => r.abnormal) ?? []
        label =
          abn.length === 1 && ["Stool", "Food"].includes(abn[0].label)
            ? `${fmtTime(check.at!)} · ${abn[0].label.toLowerCase()} ${abn[0].value.toLowerCase()}`
            : `${fmtTime(check.at!)} · ${check.abnormalCount} abnormal`
      } else if (check.state === "overdue") label = `Overdue · due ${SESSIONS[session].due}`
      else if (check.state === "not_applicable") label = a.stayStatus === "arriving" ? "Arrival exam pending" : "—"
      return { kennel: clone(k), animal: clone(a), check, label, inspectorName: insp ? userName(db, insp.byUserId) : null }
    })
    const relevant = tiles.filter((t) => t.check && t.check.state !== "not_applicable")
    const done = relevant.filter((t) => t.check!.state === "done" || t.check!.state === "abnormal").length
    completed += done
    expected += relevant.length
    stillDue += relevant.filter((t) => t.check!.state === "due" || t.check!.state === "overdue").length
    abnormal += relevant.filter((t) => t.check!.state === "abnormal").length
    for (const t of relevant.filter((x) => x.check!.state === "overdue")) overdueList.push(`${t.kennel.code} ${t.animal!.name}`)
    const assignedTo = db.users
      .filter((u) => u.role === "contractor" && u.status === "active" && u.kennelScope.includes(block.code))
      // Most specific scope first: S. Ong (KC3 only) before K. Lee (KC1–KC3).
      .sort((a, b) => a.kennelScope.length - b.kennelScope.length || a.name.localeCompare(b.name))
      .map((u) => u.name)
    blocks.push({
      block,
      tiles,
      done,
      expected: relevant.length,
      vacant: tiles.filter((t) => !t.animal).length,
      assignedTo: assignedTo.slice(0, 2),
    })
  }
  return {
    date,
    session,
    closes: SESSIONS[session].closes,
    blocks,
    totals: { completed, expected, stillDue, overdue: overdueList.length, overdueList, abnormal },
  }
}

export interface InspectionForm {
  animal: Animal
  templateName: string
  templateVersion: number
  items: ChecklistItem[]
  existing: Inspection | null
}

function liveTemplate(speciesTemplateId: string) {
  const db = getDb()
  const tpl = db.templates.find((t) => t.id === speciesTemplateId)
  const live = tpl?.versions.find((v) => v.status === "live")
  if (!tpl || !live) throw new ApiError("CONFLICT", "No live checklist template for this species. Publish one in Master data.")
  return { tpl, live }
}

export async function getInspectionForm(animalId: string, date: string, session: Session): Promise<InspectionForm> {
  await delay(150)
  const db = getDb()
  const a = db.animals.find((x) => x.id === animalId)
  if (!a) throw new ApiError("NOT_FOUND", "Animal not found.")
  const species = db.species.find((s) => s.id === a.speciesId)
  const existing = inspectionFor(db, animalId, date, session) ?? null
  // Recorded inspections keep the template version they were made with.
  if (existing) {
    const tpl = db.templates.find((t) => t.id === existing.templateId)
    const v = tpl?.versions.find((x) => x.version === existing.templateVersion)
    if (tpl && v)
      return { animal: clone(a), templateName: tpl.name, templateVersion: v.version, items: clone(v.items), existing: clone(existing) }
  }
  const { tpl, live } = liveTemplate(species?.checklistTemplateId ?? "tpl-general")
  return { animal: clone(a), templateName: tpl.name, templateVersion: live.version, items: clone(live.items), existing: null }
}

const PHRASES: Record<string, Record<string, string>> = {
  Food: { Half: "ate half, reduced appetite", Little: "ate little, reduced appetite", None: "not eating" },
  Stool: { Soft: "soft stool", Loose: "loose stool", Watery: "watery stool", None: "no stool, straining" },
  Urine: { No: "no urine passed" },
}

/** Plain-language findings for the AI worker's sign extraction (AI-003). */
export function abnormalPhrases(i: Inspection): string[] {
  const out = i.results
    .filter((r) => r.abnormal)
    .map(
      (r) =>
        PHRASES[r.label]?.[r.value] ??
        `${r.label.toLowerCase()} ${r.value === "Abnormal" ? "abnormal" : r.value.toLowerCase()}${r.note ? ` — ${r.note}` : ""}`
    )
  if (i.otherFindings) out.push(i.otherFindings)
  return out
}

export interface RecordInspectionInput {
  animalId: string
  date: string
  session: Session
  results: InspectionResult[]
  otherFindings: string
}

export async function recordInspection(
  input: RecordInspectionInput
): Promise<{ inspection: Inspection; observationId: string | null; edited: boolean }> {
  await delay()
  const db = getDb()
  const a = db.animals.find((x) => x.id === input.animalId)
  if (!a) throw new ApiError("NOT_FOUND", "Animal not found.")
  const actor = requirePermission("record", { kennelCode: a.kennelCode, what: "Record inspection" })
  if (a.stayStatus !== "active")
    throw new ApiError(
      "CONFLICT",
      a.stayStatus === "arriving" ? "Complete the arrival exam before daily inspections." : "Released animals are not inspected."
    )
  if (input.date > todayISO()) throw new ApiError("VALIDATION", "Inspections can't be recorded for a future date.", "date")
  const missingNote = input.results.find((r) => r.abnormal && r.note.trim() === "" && ["Normal", "Abnormal"].includes(r.value))
  if (missingNote) throw new ApiError("VALIDATION", `Add a note for the abnormal finding (${missingNote.label}).`, "results")

  return write((d) => {
    const existing = d.inspections.find((i) => i.animalId === a.id && i.date === input.date && i.session === input.session)
    const abnormalCount = input.results.filter((r) => r.abnormal).length + (input.otherFindings.trim() ? 1 : 0)
    let inspection: Inspection
    if (existing) {
      const before = { summary: inspectionSummary(existing), abnormal: existing.abnormalCount }
      existing.results = input.results
      existing.otherFindings = input.otherFindings.trim()
      existing.abnormalCount = abnormalCount
      existing.editedAt = nowISO()
      inspection = existing
      appendAudit(d, actor, {
        action: "Inspection edited",
        entityType: "Inspection",
        entityId: existing.id,
        entityLabel: `${a.kennelCode} · ${input.session}`,
        animalId: a.id,
        before,
        after: { summary: inspectionSummary(existing), abnormal: abnormalCount },
      })
    } else {
      const species = d.species.find((s) => s.id === a.speciesId)
      const { tpl, live } = liveTemplate(species?.checklistTemplateId ?? "tpl-general")
      inspection = {
        id: `in-${a.id}-${input.date}-${input.session}-${nextId(d, "id")}`,
        animalId: a.id,
        kennelCode: a.kennelCode,
        date: input.date,
        session: input.session,
        at: input.date === todayISO() ? nowISO() : `${input.date}T${SESSIONS[input.session].closes}:00`,
        byUserId: actor.id,
        templateId: tpl.id,
        templateVersion: live.version,
        results: input.results,
        otherFindings: input.otherFindings.trim(),
        abnormalCount,
        editedAt: null,
      }
      d.inspections.push(inspection)
      appendAudit(d, actor, {
        action: "Inspection created",
        entityType: "Inspection",
        entityId: inspection.id,
        entityLabel: `${a.kennelCode} · ${input.session}`,
        animalId: a.id,
        after: { summary: inspectionSummary(inspection), abnormal: abnormalCount },
      })
    }
    // Any abnormal item or free text publishes an event for AI routing (BE-011).
    let observationId: string | null = null
    if (abnormalCount > 0) {
      const text = `${a.kennelCode} ${a.name} · ${input.session} inspection: ${abnormalPhrases(inspection).join("; ")}`
      const obs = createObservationRecord(d, actor, { text, animalId: a.id, media: [] })
      processObservation(d, obs)
      observationId = obs.id
    }
    return { inspection: clone(inspection), observationId, edited: Boolean(existing) }
  })
}

/** "Remind assignees" — notifies contractors/officers in scope for animals still due. */
export async function remindAssignees(date: string, session: Session): Promise<{ notified: number; kennels: number }> {
  await delay()
  const actor = requirePermission("record", { what: "Remind assignees" })
  return write((db) => {
    const due = db.animals
      .filter((a) => a.stayStatus === "active" && canSeeAnimal(actor, a))
      .filter((a) => {
        const c = checkInfo(db, a, date, session)
        return c.state === "due" || c.state === "overdue"
      })
    const recipients = new Set<string>()
    for (const a of due) {
      const block = a.kennelCode.split("-")[0]
      for (const u of db.users.filter((x) => x.status === "active" && x.role === "contractor" && x.kennelScope.includes(block))) {
        recipients.add(u.id)
      }
    }
    const closes = fmtTime(`${date}T${SESSIONS[session].closes}:00`)
    for (const id of recipients) {
      const mine = due.filter((a) => db.users.find((u) => u.id === id)?.kennelScope.includes(a.kennelCode.split("-")[0]))
      notify(
        db,
        "checks_due",
        [id],
        `${session} checks due · ${mine.length} animal${mine.length === 1 ? "" : "s"}`,
        `${mine.map((a) => `${a.kennelCode} ${a.name}`).join(", ")} — session closes ${closes}.`,
        "/inspections"
      )
    }
    appendAudit(db, actor, {
      action: "Inspection reminder sent",
      entityType: "Inspection",
      entityId: `${date}-${session}`,
      entityLabel: `${session} session · ${date}`,
      after: { kennels: due.map((a) => a.kennelCode), recipients: recipients.size },
    })
    return { notified: recipients.size, kennels: due.length }
  })
}

export function sessionClosesAt(date: string, session: Session): Date {
  return sessionCloses(date, session)
}

export async function recordSessionExport(date: string, session: Session, rows: number): Promise<void> {
  await delay(60)
  const db = getDb()
  const actor = currentUser(db)
  write((d) =>
    appendAudit(d, actor, {
      action: "Inspection session exported",
      entityType: "Inspection",
      entityId: `${date}-${session}`,
      entityLabel: `CSV · ${rows} rows`,
      after: { format: "CSV", rows },
    })
  )
}
