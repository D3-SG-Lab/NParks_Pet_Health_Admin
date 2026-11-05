/** Health case management (BE-017, BE-018, FE-015, FE-016). */
import { addDays, nowISO, parseLocal, todayISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import { fmtDateTime } from "@/lib/format"
import type { Db } from "@/lib/mock/db"
import type { AiSummary, Animal, CaseStatus, CloseReason, FollowUp, HealthCase, Inspection, Observation } from "@/types/domain"

import {
  appendAudit,
  canSeeAnimal,
  clone,
  currentUser,
  delay,
  getDb,
  nextId,
  notify,
  requireAnimalAccess,
  requirePermission,
  userName,
  write,
} from "./core"
import { CLOSE_REASON_LABEL, caseAiSummary, caseNextAction, speciesName, type NextAction } from "./derive"
import { stayProgress } from "@/lib/clock"

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  open: "Open",
  needs_review: "Needs review",
  closed: "Closed",
}

export { CLOSE_REASON_LABEL }

export type CaseFilter = "all" | "open" | "needs_review" | "last_7_days" | "assigned_to_me" | "closed"

export interface CaseListItem {
  case: HealthCase
  animal: Animal
  speciesName: string
  assigneeName: string
  observationCount: number
  nextAction: NextAction
}

function listItem(db: Db, c: HealthCase): CaseListItem {
  const animal = db.animals.find((a) => a.id === c.animalId) as Animal
  return {
    case: clone(c),
    animal: clone(animal),
    speciesName: speciesName(db, animal.speciesId),
    assigneeName: userName(db, c.assigneeId),
    observationCount: c.observationIds.length + c.inspectionIds.length,
    nextAction: caseNextAction(c),
  }
}

export async function listCases(
  params: { filter?: CaseFilter; search?: string } = {}
): Promise<{ items: CaseListItem[]; counts: Record<CaseFilter, number> }> {
  await delay()
  const db = getDb()
  const user = currentUser(db)
  const visible = db.cases.filter((c) => {
    const a = db.animals.find((x) => x.id === c.animalId)
    return a && canSeeAnimal(user, a)
  })
  const sevenAgo = addDays(todayISO(), -7)
  const predicates: Record<CaseFilter, (c: HealthCase) => boolean> = {
    all: () => true,
    open: (c) => c.status !== "closed",
    needs_review: (c) => c.status === "needs_review",
    last_7_days: (c) => c.openedAt.slice(0, 10) >= sevenAgo || c.updatedAt.slice(0, 10) >= sevenAgo,
    assigned_to_me: (c) => c.assigneeId === user.id,
    closed: (c) => c.status === "closed",
  }
  const counts = Object.fromEntries(Object.entries(predicates).map(([k, p]) => [k, visible.filter(p).length])) as Record<CaseFilter, number>
  const q = (params.search ?? "").trim().toLowerCase()
  const items = visible
    .filter(predicates[params.filter ?? "all"])
    .filter((c) => {
      if (!q) return true
      const a = db.animals.find((x) => x.id === c.animalId)
      return (
        c.id.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        a?.name.toLowerCase().includes(q) ||
        a?.kennelCode.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      // Open first, then needs review, then closed; most recently updated first.
      const rank = (c: HealthCase) => (c.status === "closed" ? 2 : 0)
      return rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt)
    })
    .map((c) => listItem(db, c))
  return { items, counts }
}

export interface LinkedEvent {
  id: string
  at: string
  meta: string
  text: string
  kind: "observation" | "inspection" | "created"
  aiRouted: boolean
  media: Observation["media"]
}

export interface CaseDetail extends CaseListItem {
  summary: AiSummary
  stay: { day: number; total: number }
  linked: LinkedEvent[]
  openedByName: string
  closedByName: string | null
  followUps: (FollowUp & { assigneeName: string; overdue: boolean })[]
  notes: (HealthCase["notes"][number] & { authorName: string })[]
}

export async function getCase(id: string): Promise<CaseDetail> {
  await delay()
  const db = getDb()
  const c = db.cases.find((x) => x.id === id)
  if (!c) throw new ApiError("NOT_FOUND", `Case ${id} was not found.`)
  const animal = db.animals.find((a) => a.id === c.animalId) as Animal
  requireAnimalAccess(animal)
  const linked: LinkedEvent[] = []
  for (const oid of c.observationIds) {
    const o = db.observations.find((x) => x.id === oid)
    if (!o) continue
    const created = o.routedAction === "new_case" && o.caseId === c.id
    linked.push({
      id: o.id,
      at: o.createdAt,
      meta: [userName(db, o.createdBy), created ? "case created" : o.triagedAt ? "routed by AI" : null].filter(Boolean).join(" · "),
      text: o.text,
      kind: created ? "created" : "observation",
      aiRouted: Boolean(o.ai) && !created,
      media: o.media,
    })
  }
  for (const iid of c.inspectionIds) {
    const i = db.inspections.find((x) => x.id === iid) as Inspection | undefined
    if (!i) continue
    linked.push({
      id: i.id,
      at: i.at,
      meta: `${i.session} inspection`,
      text:
        i.results
          .filter((r) => r.abnormal)
          .map((r) => `${r.label}: ${r.value}`)
          .join(" · ") || "All normal",
      kind: "inspection",
      aiRouted: false,
      media: [],
    })
  }
  linked.sort((a, b) => b.at.localeCompare(a.at))
  const nowMs = parseLocal(nowISO()).getTime()
  return {
    ...listItem(db, c),
    summary: caseAiSummary(db, c),
    stay: stayProgress(animal.arrivalDate, animal.releaseDate),
    linked,
    openedByName: userName(db, c.openedBy),
    closedByName: c.closedBy ? userName(db, c.closedBy) : null,
    followUps: c.followUps
      .slice()
      .sort((a, b) => Number(a.done) - Number(b.done) || a.dueAt.localeCompare(b.dueAt))
      .map((f) => ({ ...f, assigneeName: userName(db, f.assigneeId), overdue: !f.done && parseLocal(f.dueAt).getTime() < nowMs })),
    notes: c.notes.map((n) => ({ ...n, authorName: userName(db, n.byUserId) })).sort((a, b) => b.at.localeCompare(a.at)),
  }
}

function mutateCase<T>(id: string, fn: (db: Db, c: HealthCase, animal: Animal) => T): T {
  return write((db) => {
    const c = db.cases.find((x) => x.id === id)
    if (!c) throw new ApiError("NOT_FOUND", `Case ${id} was not found.`)
    const animal = db.animals.find((a) => a.id === c.animalId) as Animal
    return fn(db, c, animal)
  })
}

export async function assignCase(id: string, assigneeId: string): Promise<void> {
  await delay()
  const actor = requirePermission("cases", { what: "Assign case" })
  mutateCase(id, (db, c, animal) => {
    if (c.status === "closed") throw new ApiError("CONFLICT", "Closed cases can't be reassigned. Reopen the case first.")
    const assignee = db.users.find((u) => u.id === assigneeId && u.status !== "disabled")
    if (!assignee) throw new ApiError("VALIDATION", "Pick an active user.", "assigneeId")
    const before = userName(db, c.assigneeId)
    c.assigneeId = assigneeId
    c.updatedAt = nowISO()
    appendAudit(db, actor, {
      action: "Case assigned",
      entityType: "Case",
      entityId: c.id,
      entityLabel: c.id,
      animalId: animal.id,
      caseId: c.id,
      before: { assignee: before },
      after: { assignee: assignee.name },
    })
    notify(
      db,
      "case_assigned",
      [assigneeId],
      `Case assigned to you · ${animal.kennelCode} ${animal.name}`,
      `${c.title}. Tap to open case ${c.id}.`,
      `/cases?id=${c.id}`
    )
  })
}

export interface FollowUpInput {
  action: string
  dueAt: string
  assigneeId: string
}

export function addFollowUpRecord(db: Db, actorId: string, c: HealthCase, input: FollowUpInput): FollowUp {
  const f: FollowUp = {
    id: `fu-${nextId(db, "id")}`,
    action: input.action.trim(),
    dueAt: input.dueAt,
    assigneeId: input.assigneeId,
    done: false,
    doneAt: null,
    createdAt: nowISO(),
    createdBy: actorId,
  }
  c.followUps.push(f)
  if (!c.assigneeId) c.assigneeId = input.assigneeId
  c.updatedAt = nowISO()
  return f
}

export async function addFollowUp(id: string, input: FollowUpInput): Promise<void> {
  await delay()
  const actor = requirePermission("cases", { what: "Add follow-up action" })
  if (!input.action.trim()) throw new ApiError("VALIDATION", "Enter the follow-up action.", "action")
  mutateCase(id, (db, c, animal) => {
    if (c.status === "closed") throw new ApiError("CONFLICT", "Closed cases can't take new follow-up actions.")
    const assignee = db.users.find((u) => u.id === input.assigneeId)
    if (!assignee) throw new ApiError("VALIDATION", "Pick an assignee.", "assigneeId")
    const f = addFollowUpRecord(db, actor.id, c, input)
    appendAudit(db, actor, {
      action: "Follow-up assigned",
      entityType: "Case",
      entityId: c.id,
      entityLabel: `${c.id} · ${f.action}`,
      animalId: animal.id,
      caseId: c.id,
      after: { action: f.action, due: f.dueAt, assignee: assignee.name },
    })
    notify(
      db,
      "case_assigned",
      [input.assigneeId],
      `Follow-up assigned · ${animal.kennelCode} ${animal.name}`,
      `${f.action}, due ${fmtDateTime(f.dueAt)}. Tap to open case ${c.id}.`,
      `/cases?id=${c.id}`
    )
  })
}

export async function setFollowUpDone(caseId: string, followUpId: string, done: boolean): Promise<void> {
  await delay(160)
  const actor = requirePermission("cases", { what: "Update follow-up" })
  mutateCase(caseId, (db, c, animal) => {
    const f = c.followUps.find((x) => x.id === followUpId)
    if (!f) throw new ApiError("NOT_FOUND", "Follow-up not found.")
    f.done = done
    f.doneAt = done ? nowISO() : null
    c.updatedAt = nowISO()
    appendAudit(db, actor, {
      action: done ? "Follow-up completed" : "Follow-up reopened",
      entityType: "Case",
      entityId: c.id,
      entityLabel: `${c.id} · ${f.action}`,
      animalId: animal.id,
      caseId: c.id,
      before: { done: !done },
      after: { done },
    })
  })
}

export async function addCaseNote(caseId: string, text: string): Promise<void> {
  await delay()
  const db = getDb()
  const actor = currentUser(db)
  if (actor.role === "auditor" || actor.role === "admin") requirePermission("cases", { what: "Add case note" })
  if (text.trim().length < 2) throw new ApiError("VALIDATION", "Write a note before posting.", "text")
  mutateCase(caseId, (d, c, animal) => {
    requireAnimalAccess(animal)
    const note = { id: `n-${nextId(d, "id")}`, text: text.trim(), at: nowISO(), byUserId: actor.id }
    c.notes.push(note)
    c.updatedAt = note.at
    appendAudit(d, actor, {
      action: "Case note added",
      entityType: "Case",
      entityId: c.id,
      entityLabel: c.id,
      animalId: animal.id,
      caseId: c.id,
      after: { note: note.text },
    })
  })
}

/** Allowed status transitions — anything else returns 409 (BE-017). */
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ["needs_review", "closed"],
  needs_review: ["open", "closed"],
  closed: ["open"],
}

export async function setCaseStatus(caseId: string, status: Exclude<CaseStatus, "closed">): Promise<void> {
  await delay()
  const actor = requirePermission("cases", { what: "Change case status" })
  mutateCase(caseId, (db, c, animal) => {
    if (!TRANSITIONS[c.status].includes(status))
      throw new ApiError(
        "CONFLICT",
        `A ${CASE_STATUS_LABEL[c.status].toLowerCase()} case can't move to ${CASE_STATUS_LABEL[status].toLowerCase()}.`
      )
    const before = c.status
    c.status = status
    if (before === "closed") c.reopenedAt = nowISO()
    c.updatedAt = nowISO()
    appendAudit(db, actor, {
      action: before === "closed" ? "Case reopened" : "Case status changed",
      entityType: "Case",
      entityId: c.id,
      entityLabel: c.id,
      animalId: animal.id,
      caseId: c.id,
      before: { status: CASE_STATUS_LABEL[before] },
      after: { status: CASE_STATUS_LABEL[status] },
    })
    if (before === "closed") {
      notify(
        db,
        "case_reopened",
        [c.assigneeId],
        `Case reopened · ${animal.kennelCode} ${animal.name}`,
        `${c.id} was reopened manually.`,
        `/cases?id=${c.id}`
      )
    }
  })
}

export async function closeCase(caseId: string, reason: CloseReason, note: string): Promise<void> {
  await delay()
  const actor = requirePermission("cases", { what: "Close case" })
  if (!note.trim()) throw new ApiError("VALIDATION", "Add a closing note.", "note")
  mutateCase(caseId, (db, c, animal) => {
    if (!TRANSITIONS[c.status].includes("closed")) throw new ApiError("CONFLICT", "This case is already closed.")
    const before = c.status
    c.status = "closed"
    c.closedAt = nowISO()
    c.closedBy = actor.id
    c.closeReason = reason
    c.closeNote = note.trim()
    c.updatedAt = c.closedAt
    appendAudit(db, actor, {
      action: "Case closed",
      entityType: "Case",
      entityId: c.id,
      entityLabel: c.id,
      animalId: animal.id,
      caseId: c.id,
      before: { status: CASE_STATUS_LABEL[before] },
      after: { status: "Closed", reason: CLOSE_REASON_LABEL[reason], note: c.closeNote },
    })
  })
}

export async function reopenCase(caseId: string, note: string): Promise<void> {
  await setCaseStatus(caseId, "open")
  if (note.trim()) await addCaseNote(caseId, `Reopened: ${note.trim()}`)
}

/** Export audit for case PDFs / CSV (BE-024: "Exports respect user scope"). */
export async function recordCaseExport(caseIds: string[], format: "PDF" | "CSV"): Promise<void> {
  await delay(100)
  const db = getDb()
  const actor = currentUser(db)
  write((d) =>
    appendAudit(d, actor, {
      action: format === "PDF" ? "Case report exported" : "Case list exported",
      entityType: "Case",
      entityId: caseIds.length === 1 ? caseIds[0] : "list",
      entityLabel: format === "PDF" ? `${caseIds[0]} · PDF` : `CSV · ${caseIds.length} rows`,
      caseId: caseIds.length === 1 ? caseIds[0] : null,
      after: { format, rows: caseIds.length },
    })
  )
}
