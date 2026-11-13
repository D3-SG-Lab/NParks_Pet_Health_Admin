/**
 * Medication on the real API: `GET /medication/animals?date`, `GET /animals/{id}/medication?date`
 * and `POST /medication/administrations`. Schedules (create/edit/stop) and the
 * administration history have no endpoint and stay on the mock data.
 */
import { fromUtc, nowISO, parseLocal, todayISO, toISODateTime } from "@/lib/clock"
import type { Animal, MedicationAdministration } from "@/types/domain"

import { medicationApi } from "../api/api-client"
import type { DoseSlotDto, MedicationAnimalDto } from "../api/types"
import type { MedicationCardItem } from "../animals"
import type { TimelineEntry } from "../derive"
import type { DoseStatus, DueFilter, DueRow } from "../medication"
import { numericId, scheduleFromSlot, sexOf, speciesIdOf } from "./mappers"

/** The medication endpoints return a shorter animal record (`kennel` is the code). */
export function toAnimalFromMedication(a: MedicationAnimalDto): Animal {
  return {
    id: String(a.id),
    name: a.name,
    speciesId: speciesIdOf(a.species),
    breed: "",
    sex: sexOf(a.sex),
    dateOfBirth: a.dateOfBirth ?? "",
    origin: a.countryCode,
    microchip: a.microchip,
    kennelCode: a.kennel,
    arrivalDate: a.arrivalDate,
    releaseDate: a.releaseDate ?? "",
    stayStatus: a.status === "released" || a.status === "deceased" ? "released" : a.today?.arrivalExam === "done" ? "active" : "arriving",
    releasedAt: null,
    releaseNote: null,
    monitoringFlag: false,
    monitoringNote: null,
    monitoringAssigneeId: null,
    monitoringAction: null,
    monitoringDueAt: null,
    createdAt: "",
    createdBy: "",
  }
}

const adminAt = (ms: number) => toISODateTime(new Date(ms))

function groupBySchedule(slots: DoseSlotDto[]): DoseSlotDto[][] {
  const map = new Map<number, DoseSlotDto[]>()
  for (const s of slots) map.set(s.scheduleId, [...(map.get(s.scheduleId) ?? []), s])
  return [...map.values()].map((list) => list.sort((a, b) => a.time.localeCompare(b.time)))
}

export function slotsToCards(stayId: number, slots: DoseSlotDto[]): MedicationCardItem[] {
  return groupBySchedule(slots)
    .map((list) => {
      const first = list[0]
      const next = list.find((s) => s.status === "overdue") ?? list.find((s) => s.status === "due" || s.status === "upcoming")
      return {
        schedule: scheduleFromSlot(
          stayId,
          first,
          list.map((s) => s.time)
        ),
        frequency: first.frequency,
        nextDose: next
          ? { time: next.time, state: next.status === "overdue" ? ("overdue" as const) : ("due" as const) }
          : { time: list.at(-1)?.time ?? "", state: "done" as const },
      }
    })
    .sort((a, b) => (a.nextDose?.state === "overdue" ? -1 : 0) - (b.nextDose?.state === "overdue" ? -1 : 0))
}

export function medicationTimeline(slots: DoseSlotDto[]): TimelineEntry[] {
  return slots
    .filter((s) => s.administration)
    .map((s) => {
      const adm = s.administration!
      return {
        id: `t-adm-${adm.id}`,
        refId: `adm-${adm.id}`,
        type: "medication" as const,
        at: adminAt(adm.administeredAt),
        title: `${s.item} ${s.dose} given`,
        titleRef: null,
        detail: [adm.remarks, adm.by ? `by ${adm.by}` : null].filter(Boolean).join(" · "),
        tone: "success" as const,
        media: [],
        href: null,
      }
    })
}

function dueRowsFor(stayId: number, animal: Animal, slots: DoseSlotDto[]): DueRow[] {
  const nowMs = parseLocal(nowISO()).getTime()
  return groupBySchedule(slots).map((list) => {
    const first = list[0]
    const given = list.filter((s) => s.status === "administered")
    const pending = list.filter((s) => s.status !== "administered")
    const overdue = pending.find((s) => s.status === "overdue")
    const next = overdue ?? pending[0] ?? null
    const last = [...given].sort((a, b) => (b.administration?.administeredAt ?? 0) - (a.administration?.administeredAt ?? 0))[0]
    const status: DoseStatus = overdue ? "overdue" : !next ? "recorded" : given.length > 0 ? "partial" : "due"
    return {
      schedule: scheduleFromSlot(
        stayId,
        first,
        list.map((s) => s.time)
      ),
      animal,
      frequency: first.frequency,
      dueTime: next?.time ?? last?.time ?? first.time,
      pendingTime: next?.time ?? null,
      pendingTimes: pending.map((s) => s.time),
      status,
      overdueMinutes: overdue ? Math.max(0, Math.round((nowMs - parseLocal(overdue.slot).getTime()) / 60000)) : 0,
      givenCount: given.length,
      recordedAt: status === "recorded" && last?.administration ? adminAt(last.administration.administeredAt) : null,
      recordedBy: status === "recorded" ? (last?.administration?.by ?? null) : null,
      caseId: null,
    }
  })
}

export async function listDueToday(filter: DueFilter = "all"): Promise<{ rows: DueRow[]; counts: Record<DueFilter, number> }> {
  const today = todayISO()
  const animals = await medicationApi.animals(today)
  const days = await Promise.all(animals.map((a) => medicationApi.day(a.animal.id, today)))
  const all = days
    .flatMap((d) => dueRowsFor(d.animal.id, toAnimalFromMedication(d.animal), d.slots))
    .sort((a, b) => a.dueTime.localeCompare(b.dueTime))
  const nowMs = parseLocal(nowISO()).getTime()
  const within2h = (r: DueRow) => {
    if (!r.pendingTime || r.status === "overdue") return false
    const t = parseLocal(`${today}T${r.pendingTime}`).getTime()
    return t >= nowMs && t <= nowMs + 2 * 3_600_000
  }
  const counts = { all: all.length, overdue: all.filter((r) => r.status === "overdue").length, next_2h: all.filter(within2h).length }
  const rows = filter === "overdue" ? all.filter((r) => r.status === "overdue") : filter === "next_2h" ? all.filter(within2h) : all
  return { rows, counts }
}

/** `slot` is "YYYY-MM-DDTHH:mm" for today's dose time; time and officer come from the server. */
export async function recordDose(scheduleId: string, doseTime: string, remarks: string): Promise<MedicationAdministration> {
  const dto = await medicationApi.recordAdministration({
    scheduleId: numericId(scheduleId, "medication schedule"),
    slot: `${todayISO()}T${doseTime}`,
    remarks: remarks.trim() || null,
  })
  return {
    id: String(dto.id),
    scheduleId: String(dto.scheduleId),
    animalId: String(dto.animalId),
    date: dto.slot.slice(0, 10),
    doseTime: dto.slot.slice(11, 16),
    at: adminAt(dto.administeredAt) ?? fromUtc(String(dto.administeredAt)) ?? nowISO(),
    byUserId: dto.by,
    remarks: dto.remarks ?? "",
  }
}
