/** Medication schedules & administration (BE-015, FE-013, Medication p.7). */
import { nowISO, parseLocal, todayISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import type { Animal, MedicationAdministration, MedicationRoute, MedicationSchedule } from "@/types/domain"

import { appendAudit, canSeeAnimal, clone, currentUser, delay, getDb, nextId, requirePermission, userName, write } from "./core"
import { freqLabel, scheduleActiveOn, speciesName } from "./derive"

export type DoseStatus = "overdue" | "due" | "partial" | "recorded"

export interface DueRow {
  schedule: MedicationSchedule
  animal: Animal
  frequency: string
  /** Time shown in the "Due" column. */
  dueTime: string
  /** Pending dose that "Record dose" will record, if any. */
  pendingTime: string | null
  /** All dose times not yet recorded today. */
  pendingTimes: string[]
  status: DoseStatus
  overdueMinutes: number
  givenCount: number
  recordedAt: string | null
  recordedBy: string | null
  caseId: string | null
}

export type DueFilter = "all" | "overdue" | "next_2h"

function dueRows(): DueRow[] {
  const db = getDb()
  const user = currentUser(db)
  const today = todayISO()
  const nowMs = parseLocal(nowISO()).getTime()
  return db.medicationSchedules
    .filter((s) => scheduleActiveOn(s, today))
    .map((s) => ({ s, animal: db.animals.find((a) => a.id === s.animalId) as Animal }))
    .filter(({ animal }) => animal && animal.stayStatus !== "released" && canSeeAnimal(user, animal))
    .map(({ s, animal }) => {
      const given = db.medicationAdministrations.filter((m) => m.scheduleId === s.id && m.date === today)
      const givenTimes = new Set(given.map((g) => g.doseTime))
      const pending = s.doseTimes.filter((t) => !givenTimes.has(t))
      const overdueTime = pending.find((t) => parseLocal(`${today}T${t}`).getTime() < nowMs)
      const next = overdueTime ?? pending[0] ?? null
      const last = given.sort((a, b) => b.at.localeCompare(a.at))[0]
      let status: DoseStatus
      if (overdueTime) status = "overdue"
      else if (!next) status = "recorded"
      else if (given.length > 0) status = "partial"
      else status = "due"
      return {
        schedule: clone(s),
        animal: clone(animal),
        frequency: freqLabel(s),
        dueTime: next ?? last?.doseTime ?? s.doseTimes[0],
        pendingTime: next,
        pendingTimes: pending,
        status,
        overdueMinutes: overdueTime ? Math.round((nowMs - parseLocal(`${today}T${overdueTime}`).getTime()) / 60000) : 0,
        givenCount: given.length,
        recordedAt: status === "recorded" ? (last?.at ?? null) : null,
        recordedBy: status === "recorded" && last ? userName(db, last.byUserId) : null,
        caseId: s.caseId,
      }
    })
    .sort((a, b) => a.dueTime.localeCompare(b.dueTime))
}

export async function listDueToday(filter: DueFilter = "all"): Promise<{ rows: DueRow[]; counts: Record<DueFilter, number> }> {
  await delay()
  const all = dueRows()
  const nowMs = parseLocal(nowISO()).getTime()
  const today = todayISO()
  const within2h = (r: DueRow) => {
    if (!r.pendingTime || r.status === "overdue") return false
    const t = parseLocal(`${today}T${r.pendingTime}`).getTime()
    return t >= nowMs && t <= nowMs + 2 * 3_600_000
  }
  const counts = { all: all.length, overdue: all.filter((r) => r.status === "overdue").length, next_2h: all.filter(within2h).length }
  const rows = filter === "overdue" ? all.filter((r) => r.status === "overdue") : filter === "next_2h" ? all.filter(within2h) : all
  return { rows, counts }
}

export interface ScheduleRow {
  schedule: MedicationSchedule
  animal: Animal
  speciesName: string
  frequency: string
  state: "active" | "upcoming" | "ended" | "stopped"
  createdByName: string
}

export async function listSchedules(params: { search?: string; state?: ScheduleRow["state"] | "all" } = {}): Promise<ScheduleRow[]> {
  await delay()
  const db = getDb()
  const user = currentUser(db)
  const today = todayISO()
  const q = (params.search ?? "").trim().toLowerCase()
  return db.medicationSchedules
    .map((s) => ({ s, animal: db.animals.find((a) => a.id === s.animalId) as Animal }))
    .filter(({ animal }) => animal && canSeeAnimal(user, animal))
    .map(({ s, animal }) => {
      const state: ScheduleRow["state"] = s.stoppedAt
        ? "stopped"
        : s.endDate < today
          ? "ended"
          : s.startDate > today
            ? "upcoming"
            : "active"
      return {
        schedule: clone(s),
        animal: clone(animal),
        speciesName: speciesName(db, animal.speciesId),
        frequency: freqLabel(s),
        state,
        createdByName: userName(db, s.createdBy),
      }
    })
    .filter((r) => !params.state || params.state === "all" || r.state === params.state)
    .filter(
      (r) =>
        !q ||
        r.animal.name.toLowerCase().includes(q) ||
        r.animal.kennelCode.toLowerCase().includes(q) ||
        r.schedule.item.toLowerCase().includes(q)
    )
    .sort((a, b) => {
      const rank = { active: 0, upcoming: 1, ended: 2, stopped: 3 }
      return rank[a.state] - rank[b.state] || a.animal.kennelCode.localeCompare(b.animal.kennelCode, undefined, { numeric: true })
    })
}

export interface ScheduleInput {
  animalId: string
  item: string
  dose: string
  route: MedicationRoute
  site: string
  frequency: MedicationSchedule["frequency"]
  doseTimes: string[]
  startDate: string
  endDate: string
  caseId: string | null
}

function validateSchedule(input: ScheduleInput) {
  if (!input.item.trim()) throw new ApiError("VALIDATION", "Enter the medication or supplement.", "item")
  if (!input.dose.trim()) throw new ApiError("VALIDATION", "Enter the dose.", "dose")
  if (input.endDate < input.startDate) throw new ApiError("VALIDATION", "End date must be on or after the start date.", "endDate")
  const expected = { "1x": 1, "2x": 2, "3x": 3, custom: 0 }[input.frequency]
  if (input.doseTimes.length === 0) throw new ApiError("VALIDATION", "Add at least one dose time.", "doseTimes")
  if (expected && input.doseTimes.length !== expected)
    throw new ApiError(
      "VALIDATION",
      `${input.frequency.replace("x", "×")} daily needs ${expected} dose time${expected > 1 ? "s" : ""}.`,
      "doseTimes"
    )
  if (new Set(input.doseTimes).size !== input.doseTimes.length)
    throw new ApiError("VALIDATION", "Dose times must be different.", "doseTimes")
}

export async function createSchedule(input: ScheduleInput): Promise<MedicationSchedule> {
  await delay()
  const db = getDb()
  const animal = db.animals.find((a) => a.id === input.animalId)
  if (!animal || animal.stayStatus === "released") throw new ApiError("VALIDATION", "Pick an animal with an active stay.", "animalId")
  const actor = requirePermission("record", { kennelCode: animal.kennelCode, what: "Add medication schedule" })
  validateSchedule(input)
  return write((d) => {
    const s: MedicationSchedule = {
      id: `ms-${nextId(d, "id")}`,
      ...input,
      item: input.item.trim(),
      dose: input.dose.trim(),
      site: input.site.trim(),
      doseTimes: [...input.doseTimes].sort(),
      createdAt: nowISO(),
      createdBy: actor.id,
      stoppedAt: null,
    }
    d.medicationSchedules.push(s)
    appendAudit(d, actor, {
      action: "Medication schedule created",
      entityType: "MedicationSchedule",
      entityId: s.id,
      entityLabel: `${animal.kennelCode} · ${s.item}`,
      animalId: animal.id,
      caseId: s.caseId,
      after: {
        item: s.item,
        dose: s.dose,
        route: s.route,
        frequency: freqLabel(s),
        times: s.doseTimes,
        start: s.startDate,
        end: s.endDate,
        case: s.caseId,
      },
    })
    return clone(s)
  })
}

export async function updateSchedule(id: string, input: ScheduleInput): Promise<void> {
  await delay()
  const db = getDb()
  const existing = db.medicationSchedules.find((s) => s.id === id)
  if (!existing) throw new ApiError("NOT_FOUND", "Schedule not found.")
  const animal = db.animals.find((a) => a.id === existing.animalId) as Animal
  const actor = requirePermission("record", { kennelCode: animal.kennelCode, what: "Edit medication schedule" })
  validateSchedule(input)
  write((d) => {
    const s = d.medicationSchedules.find((x) => x.id === id) as MedicationSchedule
    const before = { item: s.item, dose: s.dose, frequency: freqLabel(s), times: s.doseTimes, start: s.startDate, end: s.endDate }
    Object.assign(s, {
      ...input,
      animalId: s.animalId,
      item: input.item.trim(),
      dose: input.dose.trim(),
      site: input.site.trim(),
      doseTimes: [...input.doseTimes].sort(),
    })
    appendAudit(d, actor, {
      action: "Medication schedule updated",
      entityType: "MedicationSchedule",
      entityId: s.id,
      entityLabel: `${animal.kennelCode} · ${s.item}`,
      animalId: animal.id,
      before,
      after: { item: s.item, dose: s.dose, frequency: freqLabel(s), times: s.doseTimes, start: s.startDate, end: s.endDate },
    })
  })
}

export async function stopSchedule(id: string, reason: string): Promise<void> {
  await delay()
  const db = getDb()
  const existing = db.medicationSchedules.find((s) => s.id === id)
  if (!existing) throw new ApiError("NOT_FOUND", "Schedule not found.")
  const animal = db.animals.find((a) => a.id === existing.animalId) as Animal
  const actor = requirePermission("record", { kennelCode: animal.kennelCode, what: "Stop medication schedule" })
  write((d) => {
    const s = d.medicationSchedules.find((x) => x.id === id) as MedicationSchedule
    if (s.stoppedAt) throw new ApiError("CONFLICT", "This schedule is already stopped.")
    s.stoppedAt = nowISO()
    appendAudit(d, actor, {
      action: "Medication schedule stopped",
      entityType: "MedicationSchedule",
      entityId: s.id,
      entityLabel: `${animal.kennelCode} · ${s.item}`,
      animalId: animal.id,
      before: { status: "Active" },
      after: { status: "Stopped", reason: reason.trim() || null },
    })
  })
}

/** Records an administration; time and officer are captured automatically. */
export async function recordDose(scheduleId: string, doseTime: string, remarks: string): Promise<MedicationAdministration> {
  await delay()
  const db = getDb()
  const s = db.medicationSchedules.find((x) => x.id === scheduleId)
  if (!s) throw new ApiError("NOT_FOUND", "Schedule not found.")
  const animal = db.animals.find((a) => a.id === s.animalId) as Animal
  const actor = requirePermission("record", { kennelCode: animal.kennelCode, what: "Record dose" })
  const today = todayISO()
  if (!scheduleActiveOn(s, today)) throw new ApiError("CONFLICT", "This schedule is not active today.")
  if (!s.doseTimes.includes(doseTime)) throw new ApiError("VALIDATION", "Unknown dose time.")
  return write((d) => {
    const dup = d.medicationAdministrations.find((m) => m.scheduleId === s.id && m.date === today && m.doseTime === doseTime)
    if (dup)
      throw new ApiError(
        "CONFLICT",
        `The ${doseTime} dose was already recorded by ${userName(d, dup.byUserId)} at ${dup.at.slice(11, 16)}.`
      )
    const idx = s.doseTimes.indexOf(doseTime) + 1
    const adm: MedicationAdministration = {
      id: `ma-${nextId(d, "id")}`,
      scheduleId: s.id,
      animalId: s.animalId,
      date: today,
      doseTime,
      at: nowISO(),
      byUserId: actor.id,
      remarks: remarks.trim() || (s.doseTimes.length > 1 ? `Dose ${idx} of ${s.doseTimes.length}` : ""),
    }
    d.medicationAdministrations.push(adm)
    appendAudit(d, actor, {
      action: "Medication administered",
      entityType: "MedicationAdministration",
      entityId: adm.id,
      entityLabel: `${animal.kennelCode} · ${s.item}`,
      animalId: animal.id,
      caseId: s.caseId,
      after: { item: s.item, dose: s.dose, doseTime, remarks: adm.remarks },
    })
    return clone(adm)
  })
}

export interface AdministrationRow {
  administration: MedicationAdministration
  schedule: MedicationSchedule
  animal: Animal
  byName: string
}

export async function listAdministrations(params: { search?: string; from?: string; to?: string } = {}): Promise<AdministrationRow[]> {
  await delay()
  const db = getDb()
  const user = currentUser(db)
  const q = (params.search ?? "").trim().toLowerCase()
  return db.medicationAdministrations
    .filter((m) => (!params.from || m.date >= params.from) && (!params.to || m.date <= params.to))
    .map((m) => ({
      m,
      s: db.medicationSchedules.find((x) => x.id === m.scheduleId) as MedicationSchedule,
      a: db.animals.find((x) => x.id === m.animalId) as Animal,
    }))
    .filter(({ s, a }) => s && a && canSeeAnimal(user, a))
    .filter(
      ({ s, a, m }) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.kennelCode.toLowerCase().includes(q) ||
        s.item.toLowerCase().includes(q) ||
        userName(db, m.byUserId).toLowerCase().includes(q)
    )
    .sort((x, y) => y.m.at.localeCompare(x.m.at))
    .map(({ m, s, a }) => ({ administration: clone(m), schedule: clone(s), animal: clone(a), byName: userName(db, m.byUserId) }))
}

export async function recordMedicationExport(rows: number): Promise<void> {
  await delay(60)
  const db = getDb()
  const actor = currentUser(db)
  write((d) =>
    appendAudit(d, actor, {
      action: "Medication log exported",
      entityType: "MedicationAdministration",
      entityId: "export",
      entityLabel: `CSV · ${rows} rows`,
      after: { format: "CSV", rows },
    })
  )
}

/** Cases an animal's schedule may be linked to (open cases only). */
export async function linkableCases(animalId: string): Promise<{ id: string; title: string }[]> {
  await delay(60)
  const db = getDb()
  return db.cases.filter((c) => c.animalId === animalId && c.status !== "closed").map((c) => ({ id: c.id, title: c.title }))
}
