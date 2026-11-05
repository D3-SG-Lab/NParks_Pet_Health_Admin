/** Animals & stays (BE-009, BE-010, BE-020, BE-024, FE-006, FE-007, FE-008, FE-014). */
import { PAGE_SIZE } from "@/config/app"
import { addDays, currentSession, nowISO, parseLocal, stayProgress, todayISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import type { Db } from "@/lib/mock/db"
import type {
  AiSummary,
  Animal,
  AnimalHealthStatus,
  ArrivalExam,
  ExamFinding,
  HealthCase,
  Kennel,
  Mentation,
  MedicationSchedule,
  Sex,
} from "@/types/domain"

import {
  appendAudit,
  canSeeAnimal,
  clone,
  currentUser,
  delay,
  getDb,
  requireAnimalAccess,
  requirePermission,
  userName,
  write,
} from "./core"
import {
  CLOSE_REASON_LABEL,
  activeCases,
  animalAiSummary,
  animalHealthStatus,
  buildTimeline,
  checkInfo,
  freqLabel,
  scheduleActiveOn,
  speciesName,
  type CheckInfo,
  type TimelineEntry,
  type TimelineType,
} from "./derive"
import { createObservationRecord, processObservation } from "./observations"

export const ANIMAL_STATUS_LABEL: Record<AnimalHealthStatus, string> = {
  awaiting_exam: "Awaiting exam",
  active: "Active",
  monitoring: "Monitoring",
  unwell: "Unwell",
  released: "Released",
}

export type AnimalTab = "active" | "arriving" | "releasing" | "released"
export type AnimalChip = "all" | "unwell" | "check_due"
export type AnimalSortKey = "kennel" | "name" | "stay" | "release" | "status"

export interface AnimalListParams {
  tab: AnimalTab
  search?: string
  block?: string // "all" | "KC1"…
  species?: string // "all" | species id
  chip?: AnimalChip
  sort?: { key: AnimalSortKey; dir: "asc" | "desc" }
  page?: number
  pageSize?: number
}

export interface AnimalRow {
  animal: Animal
  speciesName: string
  status: AnimalHealthStatus
  stay: { day: number; total: number; ratio: number }
  am: CheckInfo
  pm: CheckInfo
  openCaseId: string | null
  releasingSoon: boolean
}

function row(db: Db, a: Animal): AnimalRow {
  const today = todayISO()
  return {
    animal: clone(a),
    speciesName: speciesName(db, a.speciesId),
    status: animalHealthStatus(db, a),
    stay: stayProgress(a.arrivalDate, a.releaseDate),
    am: checkInfo(db, a, today, "AM"),
    pm: checkInfo(db, a, today, "PM"),
    openCaseId: activeCases(db, a.id)[0]?.id ?? null,
    releasingSoon: a.releaseDate <= addDays(today, 7),
  }
}

function inTab(a: Animal, tab: AnimalTab, today: string): boolean {
  switch (tab) {
    case "active":
      return a.stayStatus !== "released"
    case "arriving":
      return a.stayStatus !== "released" && a.arrivalDate === today
    case "releasing":
      return a.stayStatus !== "released" && a.releaseDate >= today && a.releaseDate <= addDays(today, 7)
    case "released":
      return a.stayStatus === "released"
  }
}

function checkDue(r: AnimalRow): boolean {
  const session = currentSession()
  const c = session === "AM" ? r.am : r.pm
  return c.state === "due" || c.state === "overdue" || (session === "PM" && r.am.state === "overdue")
}

export async function listAnimals(params: AnimalListParams) {
  await delay()
  const db = getDb()
  const user = currentUser(db)
  const today = todayISO()
  const visible = db.animals.filter((a) => canSeeAnimal(user, a))
  const tabCounts: Record<AnimalTab, number> = {
    active: visible.filter((a) => inTab(a, "active", today)).length,
    arriving: visible.filter((a) => inTab(a, "arriving", today)).length,
    releasing: visible.filter((a) => inTab(a, "releasing", today)).length,
    released: visible.filter((a) => inTab(a, "released", today)).length,
  }
  const q = (params.search ?? "").trim().toLowerCase()
  const qDigits = q.replace(/\s/g, "")
  let rows = visible
    .filter((a) => inTab(a, params.tab, today))
    .filter((a) => !params.block || params.block === "all" || a.kennelCode.startsWith(`${params.block}-`))
    .filter((a) => !params.species || params.species === "all" || a.speciesId === params.species)
    .filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.kennelCode.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && a.microchip.includes(qDigits))
    )
    .map((a) => row(db, a))
  const chipCounts = {
    all: rows.length,
    unwell: rows.filter((r) => r.status === "unwell").length,
    check_due: rows.filter(checkDue).length,
  }
  if (params.chip === "unwell") rows = rows.filter((r) => r.status === "unwell")
  if (params.chip === "check_due") rows = rows.filter(checkDue)

  const sort = params.sort ?? { key: "kennel", dir: "asc" }
  const dir = sort.dir === "asc" ? 1 : -1
  const statusRank: Record<AnimalHealthStatus, number> = { unwell: 0, monitoring: 1, awaiting_exam: 2, active: 3, released: 4 }
  rows.sort((x, y) => {
    switch (sort.key) {
      case "name":
        return dir * x.animal.name.localeCompare(y.animal.name)
      case "stay":
        return dir * (x.stay.day - y.stay.day)
      case "release":
        return dir * x.animal.releaseDate.localeCompare(y.animal.releaseDate)
      case "status":
        return dir * (statusRank[x.status] - statusRank[y.status])
      default:
        return dir * x.animal.kennelCode.localeCompare(y.animal.kennelCode, undefined, { numeric: true })
    }
  })
  const pageSize = params.pageSize ?? PAGE_SIZE
  const total = rows.length
  const page = Math.min(Math.max(1, params.page ?? 1), Math.max(1, Math.ceil(total / pageSize)))
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), allRows: rows, total, page, pageSize, tabCounts, chipCounts }
}

// ---------------------------------------------------------------------------
// Detail, timeline, summary
// ---------------------------------------------------------------------------

export interface MedicationCardItem {
  schedule: MedicationSchedule
  frequency: string
  nextDose: { time: string; state: "due" | "overdue" | "done" } | null
}

export interface AnimalDetail {
  row: AnimalRow
  exam: (ArrivalExam & { vetName: string }) | null
  cases: (HealthCase & { assigneeName: string })[]
  medications: MedicationCardItem[]
  summary: AiSummary
  kennel: Kennel | null
  timelineTotal: number
  closeReasonLabel: typeof CLOSE_REASON_LABEL
}

function medicationCard(db: Db, animalId: string): MedicationCardItem[] {
  const today = todayISO()
  const nowMs = parseLocal(nowISO()).getTime()
  return db.medicationSchedules
    .filter((s) => s.animalId === animalId && scheduleActiveOn(s, today))
    .map((s) => {
      const given = new Set(db.medicationAdministrations.filter((m) => m.scheduleId === s.id && m.date === today).map((m) => m.doseTime))
      const pending = s.doseTimes.filter((t) => !given.has(t))
      const overdue = pending.find((t) => parseLocal(`${today}T${t}`).getTime() < nowMs)
      const next = overdue ?? pending[0]
      return {
        schedule: clone(s),
        frequency: freqLabel(s),
        nextDose: next
          ? { time: next, state: overdue ? ("overdue" as const) : ("due" as const) }
          : { time: s.doseTimes.at(-1) ?? "", state: "done" as const },
      }
    })
    .sort((a, b) => (a.nextDose?.state === "overdue" ? -1 : 0) - (b.nextDose?.state === "overdue" ? -1 : 0))
}

export async function getAnimal(id: string): Promise<AnimalDetail> {
  await delay()
  const db = getDb()
  const a = db.animals.find((x) => x.id === id)
  if (!a) throw new ApiError("NOT_FOUND", "This animal record doesn't exist.")
  requireAnimalAccess(a)
  const exam = db.arrivalExams.find((e) => e.animalId === id)
  return {
    row: row(db, a),
    exam: exam ? { ...clone(exam), vetName: userName(db, exam.vetId) } : null,
    cases: db.cases
      .filter((c) => c.animalId === id)
      .sort((x, y) => Number(x.status === "closed") - Number(y.status === "closed") || y.updatedAt.localeCompare(x.updatedAt))
      .map((c) => ({ ...clone(c), assigneeName: userName(db, c.assigneeId) })),
    medications: medicationCard(db, id),
    summary: animalAiSummary(db, id),
    kennel: clone(db.kennels.find((k) => k.code === a.kennelCode) ?? null),
    timelineTotal: buildTimeline(db, id).length,
    closeReasonLabel: CLOSE_REASON_LABEL,
  }
}

export type TimelinePeriod = "stay" | "today" | "7d" | "30d"

export async function getTimeline(id: string, params: { type?: TimelineType | "all"; period?: TimelinePeriod; limit?: number } = {}) {
  await delay()
  const db = getDb()
  const a = db.animals.find((x) => x.id === id)
  if (!a) throw new ApiError("NOT_FOUND", "This animal record doesn't exist.")
  requireAnimalAccess(a)
  const today = todayISO()
  const from =
    params.period === "today"
      ? today
      : params.period === "7d"
        ? addDays(today, -6)
        : params.period === "30d"
          ? addDays(today, -29)
          : a.arrivalDate
  let entries: TimelineEntry[] = buildTimeline(db, id).filter((e) => e.at.slice(0, 10) >= from)
  if (params.type && params.type !== "all") entries = entries.filter((e) => e.type === params.type)
  const total = entries.length
  return { entries: entries.slice(0, params.limit ?? 7), total }
}

// ---------------------------------------------------------------------------
// Arrival (FE-007 step 1) & arrival exam (FE-008 step 2)
// ---------------------------------------------------------------------------

export interface ArrivalInput {
  name: string
  speciesId: string
  breed: string
  sex: Sex
  dateOfBirth: string
  origin: string
  microchip: string
  kennelCode: string
  releaseDate: string
}

export function occupiedKennels(db: Db, exceptAnimalId?: string): Set<string> {
  return new Set(db.animals.filter((a) => a.stayStatus !== "released" && a.id !== exceptAnimalId).map((a) => a.kennelCode))
}

/** Kennels offered by the New Arrival picker (out-of-service and cleaning kennels are hidden). */
export async function availableKennels(speciesId: string | null, exceptAnimalId?: string): Promise<Kennel[]> {
  await delay(80)
  const db = getDb()
  const today = todayISO()
  const occupied = occupiedKennels(db, exceptAnimalId)
  return clone(
    db.kennels.filter(
      (k) =>
        (k.status === "in_service" || (k.status === "cleaning" && k.availableFrom !== null && k.availableFrom <= today)) &&
        !occupied.has(k.code) &&
        (!speciesId || k.speciesAllowed.includes(speciesId))
    )
  )
}

function validateArrival(db: Db, input: ArrivalInput, exceptAnimalId?: string) {
  const mc = input.microchip.replace(/\s/g, "")
  if (!/^\d{15}$/.test(mc)) throw new ApiError("VALIDATION", "Microchip must be 15 digits.", "microchip")
  const dup = db.animals.find((a) => a.stayStatus !== "released" && a.microchip === mc && a.id !== exceptAnimalId)
  if (dup) throw new ApiError("CONFLICT", `Microchip already in use by ${dup.kennelCode} · ${dup.name}.`, "microchip")
  const kennel = db.kennels.find((k) => k.code === input.kennelCode)
  if (!kennel) throw new ApiError("VALIDATION", "Pick a kennel.", "kennelCode")
  if (!kennel.speciesAllowed.includes(input.speciesId))
    throw new ApiError("VALIDATION", `${kennel.code} doesn't take this species.`, "kennelCode")
  if (occupiedKennels(db, exceptAnimalId).has(kennel.code)) throw new ApiError("CONFLICT", `${kennel.code} is occupied.`, "kennelCode")
  const species = db.species.find((s) => s.id === input.speciesId)
  if (!species) throw new ApiError("VALIDATION", "Pick a species.", "speciesId")
  return { mc, kennel, species }
}

export async function createArrival(input: ArrivalInput): Promise<Animal> {
  await delay()
  const actor = requirePermission("arrival", { what: "New arrival" })
  return write((db) => {
    const { mc, kennel, species } = validateArrival(db, input)
    if (kennel.status === "out_of_service") throw new ApiError("CONFLICT", `${kennel.code} is out of service.`, "kennelCode")
    if (!species.enabled) throw new ApiError("VALIDATION", `${species.name} is disabled for new arrivals.`, "speciesId")
    const today = todayISO()
    if (input.releaseDate <= today) throw new ApiError("VALIDATION", "Release date must be after the arrival date.", "releaseDate")
    if (input.dateOfBirth >= today) throw new ApiError("VALIDATION", "Date of birth must be in the past.", "dateOfBirth")
    const animal: Animal = {
      id: `a-${Date.now().toString(36)}`,
      name: input.name.trim(),
      speciesId: input.speciesId,
      breed: input.breed.trim(),
      sex: input.sex,
      dateOfBirth: input.dateOfBirth,
      origin: input.origin,
      microchip: mc,
      kennelCode: kennel.code,
      arrivalDate: today,
      releaseDate: input.releaseDate,
      stayStatus: "arriving",
      releasedAt: null,
      releaseNote: null,
      monitoringFlag: false,
      monitoringNote: null,
      monitoringAssigneeId: null,
      monitoringAction: null,
      monitoringDueAt: null,
      createdAt: nowISO(),
      createdBy: actor.id,
    }
    if (kennel.status === "cleaning") {
      kennel.status = "in_service"
      kennel.availableFrom = null
    }
    db.animals.push(animal)
    appendAudit(db, actor, {
      action: "Arrival created",
      entityType: "Animal",
      entityId: animal.id,
      entityLabel: `${animal.kennelCode} · ${animal.name}`,
      animalId: animal.id,
      after: {
        name: animal.name,
        species: species.name,
        kennel: animal.kennelCode,
        microchip: mc,
        origin: animal.origin,
        releaseDate: animal.releaseDate,
      },
    })
    return clone(animal)
  })
}

export interface ArrivalExamInput {
  vetId: string
  weightKg: number
  mentation: Mentation
  findings: ExamFinding[]
  notes: string
}

export async function completeArrivalExam(
  animalId: string,
  input: ArrivalExamInput
): Promise<{ animal: Animal; observationIds: string[] }> {
  await delay()
  const actor = requirePermission("arrival", { what: "Arrival exam" })
  const result = write((db) => {
    const a = db.animals.find((x) => x.id === animalId)
    if (!a) throw new ApiError("NOT_FOUND", "Animal not found.")
    if (a.stayStatus !== "arriving") throw new ApiError("CONFLICT", "The arrival exam has already been completed.")
    const missingNote = input.findings.find((f) => !f.normal && !f.note.trim())
    if (missingNote) throw new ApiError("VALIDATION", `Add a note for the abnormal finding (${missingNote.system}).`, "findings")
    if (!(input.weightKg > 0 && input.weightKg < 150))
      throw new ApiError("VALIDATION", "Enter a weight between 0.1 and 150 kg.", "weightKg")
    const exam: ArrivalExam = {
      id: `ex-${a.id}`,
      animalId: a.id,
      at: nowISO(),
      vetId: input.vetId,
      weightKg: input.weightKg,
      mentation: input.mentation,
      findings: input.findings,
      notes: input.notes.trim(),
    }
    db.arrivalExams.push(exam)
    a.stayStatus = "active"
    appendAudit(db, actor, {
      action: "Arrival exam completed",
      entityType: "ArrivalExam",
      entityId: exam.id,
      entityLabel: `${a.kennelCode} · ${a.name}`,
      animalId: a.id,
      before: { status: "Arriving" },
      after: {
        status: "Active monitoring",
        weightKg: exam.weightKg,
        mentation: exam.mentation,
        abnormal: input.findings.filter((f) => !f.normal).map((f) => f.system),
      },
    })
    // Abnormal findings create observations for AI routing (BE-010).
    const observationIds: string[] = []
    for (const f of input.findings.filter((x) => !x.normal)) {
      const obs = createObservationRecord(db, actor, { text: `Arrival exam: ${f.system} abnormal — ${f.note}`, animalId: a.id, media: [] })
      processObservation(db, obs)
      observationIds.push(obs.id)
    }
    return { animal: clone(a), observationIds }
  })
  return result
}

// ---------------------------------------------------------------------------
// Edit, release, monitoring
// ---------------------------------------------------------------------------

export type AnimalUpdate = Partial<
  Pick<Animal, "name" | "breed" | "sex" | "dateOfBirth" | "origin" | "microchip" | "kennelCode" | "releaseDate">
>

export async function updateAnimal(id: string, patch: AnimalUpdate): Promise<Animal> {
  await delay()
  const actor = requirePermission("arrival", { what: "Edit animal profile" })
  return write((db) => {
    const a = db.animals.find((x) => x.id === id)
    if (!a) throw new ApiError("NOT_FOUND", "Animal not found.")
    if (a.stayStatus === "released") throw new ApiError("CONFLICT", "Released animals can't be edited.")
    const next = { ...a, ...patch, microchip: (patch.microchip ?? a.microchip).replace(/\s/g, "") }
    validateArrival(
      db,
      {
        name: next.name,
        speciesId: next.speciesId,
        breed: next.breed,
        sex: next.sex,
        dateOfBirth: next.dateOfBirth,
        origin: next.origin,
        microchip: next.microchip,
        kennelCode: next.kennelCode,
        releaseDate: next.releaseDate,
      },
      a.id
    )
    if (next.releaseDate <= a.arrivalDate) throw new ApiError("VALIDATION", "Release date must be after the arrival date.", "releaseDate")
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const key of Object.keys(patch) as (keyof AnimalUpdate)[]) {
      if (a[key] !== next[key]) {
        before[key] = a[key]
        after[key] = next[key]
      }
    }
    Object.assign(a, next)
    if (Object.keys(after).length) {
      appendAudit(db, actor, {
        action: "Animal profile updated",
        entityType: "Animal",
        entityId: a.id,
        entityLabel: `${a.kennelCode} · ${a.name}`,
        animalId: a.id,
        before,
        after,
      })
    }
    return clone(a)
  })
}

export async function releaseAnimal(id: string, note: string): Promise<void> {
  await delay()
  const actor = requirePermission("arrival", { what: "Release animal" })
  write((db) => {
    const a = db.animals.find((x) => x.id === id)
    if (!a) throw new ApiError("NOT_FOUND", "Animal not found.")
    if (a.stayStatus === "released") throw new ApiError("CONFLICT", `${a.name} has already been released.`)
    const at = nowISO()
    const closed: string[] = []
    for (const c of activeCases(db, a.id)) {
      c.status = "closed"
      c.closedAt = at
      c.closedBy = actor.id
      c.closeReason = "released"
      c.closeNote = "Closed automatically on release."
      c.updatedAt = at
      closed.push(c.id)
      appendAudit(db, actor, {
        action: "Case closed",
        entityType: "Case",
        entityId: c.id,
        entityLabel: c.id,
        animalId: a.id,
        caseId: c.id,
        before: { status: "Open" },
        after: { status: "Closed", reason: "Animal released" },
      })
    }
    for (const s of db.medicationSchedules.filter((x) => x.animalId === a.id && !x.stoppedAt && x.endDate >= todayISO())) {
      s.stoppedAt = at
    }
    a.stayStatus = "released"
    a.releasedAt = at
    a.releaseNote = note.trim() || null
    a.monitoringFlag = false
    appendAudit(db, actor, {
      action: "Animal released",
      entityType: "Animal",
      entityId: a.id,
      entityLabel: `${a.kennelCode} · ${a.name}`,
      animalId: a.id,
      before: { status: "Active monitoring" },
      after: { status: "Released", note: a.releaseNote, casesClosed: closed },
    })
  })
}

export async function recordAnimalExport(animalId: string | null, label: string, rows?: number): Promise<void> {
  await delay(80)
  const db = getDb()
  const actor = currentUser(db)
  write((d) =>
    appendAudit(d, actor, {
      action: animalId ? "Health record exported" : "Animal list exported",
      entityType: "Animal",
      entityId: animalId ?? "list",
      entityLabel: label,
      animalId,
      after: { format: animalId ? "PDF" : "CSV", rows: rows ?? null },
    })
  )
}

// ---------------------------------------------------------------------------
// Global search (top bar) — kennel code, name, microchip or case no.
// ---------------------------------------------------------------------------

export interface SearchResult {
  kind: "animal" | "case"
  id: string
  title: string
  subtitle: string
  href: string
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  await delay(120)
  const db = getDb()
  const user = currentUser(db)
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const digits = q.replace(/\s/g, "")
  const animals = db.animals
    .filter((a) => canSeeAnimal(user, a))
    .filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.kennelCode.toLowerCase().includes(q) ||
        (digits.length >= 3 && /^\d+$/.test(digits) && a.microchip.includes(digits))
    )
    .slice(0, 6)
    .map((a) => ({
      kind: "animal" as const,
      id: a.id,
      title: `${a.kennelCode} · ${a.name}`,
      subtitle: `${speciesName(db, a.speciesId)} · ${ANIMAL_STATUS_LABEL[animalHealthStatus(db, a)]}${a.stayStatus === "released" ? "" : ` · MC …${a.microchip.slice(-4)}`}`,
      href: `/animals/${a.id}`,
    }))
  const cases = db.cases
    .filter((c) => {
      const a = db.animals.find((x) => x.id === c.animalId)
      return a && canSeeAnimal(user, a) && (c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
    })
    .slice(0, 4)
    .map((c) => {
      const a = db.animals.find((x) => x.id === c.animalId) as Animal
      return {
        kind: "case" as const,
        id: c.id,
        title: `${c.id} · ${c.title}`,
        subtitle: `${a.kennelCode} ${a.name}`,
        href: `/cases?id=${c.id}`,
      }
    })
  return [...animals, ...cases]
}
