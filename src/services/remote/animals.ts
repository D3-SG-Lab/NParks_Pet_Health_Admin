/**
 * Animals, arrival and arrival exam on the real API (Animal Stay, Reference
 * Data and Arrival Exam folders). Results use the same view models as the mock
 * services in ../animals.ts so the screens are unchanged.
 */
import { PAGE_SIZE } from "@/config/app"
import { addDays, fromUtc, nowISO, stayProgress, todayISO } from "@/lib/clock"
import { ApiError, isApiError } from "@/lib/errors"
import type { Animal, AnimalHealthStatus, Kennel } from "@/types/domain"

import { animalsApi, examApi, inspectionsApi, medicationApi, observationsApi, referenceApi } from "../api/api-client"
import type { AnimalStayDto, ArrivalExamDto, ExamDraft, MentationDto, StayStatusDto } from "../api/types"
import type {
  AnimalDetail,
  AnimalListParams,
  AnimalRow,
  AnimalTab,
  ArrivalExamInput,
  ArrivalInput,
  MedicationCardItem,
  SearchResult,
  TimelinePeriod,
} from "../animals"
import { inspectionSummary, type TimelineEntry, type TimelineType } from "../derive"
import {
  EXAM_SYSTEM,
  STAY_SPECIES,
  checkFromInspections,
  numericId,
  sexEnum,
  speciesEnum,
  staffLabel,
  toAnimal,
  toExam,
  toInspection,
  toKennel,
  unknownCheck,
  STAYING_STATUS,
  isStaying,
} from "./mappers"
import { medicationTimeline, slotsToCards } from "./medication"

const speciesName = (speciesId: string) => STAY_SPECIES.find((s) => s.id === speciesId)?.name ?? "Other"

const healthStatus = (a: Animal): AnimalHealthStatus =>
  a.stayStatus === "released" ? "released" : a.stayStatus === "arriving" ? "awaiting_exam" : "active"

/** Today's AM/PM inspections for each active animal (the API has no cross-animal inspection list). */
async function todaysChecks(animals: Animal[]) {
  const today = todayISO()
  const active = animals.filter((a) => a.stayStatus === "active")
  const results = await Promise.allSettled(active.map((a) => inspectionsApi.list(Number(a.id), today)))
  const byAnimal = new Map<string, Awaited<ReturnType<typeof inspectionsApi.list>>>()
  let failed = 0
  results.forEach((r, i) => {
    if (r.status === "fulfilled") byAnimal.set(active[i].id, r.value)
    else failed++
  })
  return { byAnimal, failed }
}

function toRow(a: Animal, checks: Awaited<ReturnType<typeof todaysChecks>>): AnimalRow {
  const today = todayISO()
  const dtos = checks.byAnimal.get(a.id)
  const insps = dtos ? dtos.map((d) => toInspection(d, a.kennelCode)) : null
  return {
    animal: a,
    speciesName: speciesName(a.speciesId),
    status: healthStatus(a),
    stay: stayProgress(a.arrivalDate, a.releaseDate),
    am: insps ? checkFromInspections(a, insps, today, "AM") : unknownCheck("AM"),
    pm: insps ? checkFromInspections(a, insps, today, "PM") : unknownCheck("PM"),
    openCaseId: null,
    releasingSoon: Boolean(a.releaseDate) && a.releaseDate <= addDays(today, 7),
  }
}

function inTab(a: Animal, tab: AnimalTab, today: string): boolean {
  switch (tab) {
    case "active":
      return a.stayStatus !== "released"
    case "arriving":
      return a.stayStatus !== "released" && a.arrivalDate === today
    case "releasing":
      // Stays have no planned release date in the API.
      return a.stayStatus !== "released" && Boolean(a.releaseDate) && a.releaseDate >= today && a.releaseDate <= addDays(today, 7)
    case "released":
      return a.stayStatus === "released"
  }
}

const checkNotice = (failed: number) =>
  failed > 0 ? [`Today’s inspections couldn’t be loaded for ${failed} animal${failed === 1 ? "" : "s"}; their AM/PM status shows “—”.`] : []

export async function listAnimals(params: AnimalListParams) {
  const today = todayISO()
  const filters = {
    species: params.species && params.species !== "all" ? speciesEnum(params.species) : undefined,
    search: params.search?.trim() || undefined,
  }
  const tabStatus: StayStatusDto | undefined = params.tab === "released" ? undefined : STAYING_STATUS
  // Rows use the API's status/species/search filters; the second call gives the tab counts.
  const [rowsDto, allDto] = await Promise.all([animalsApi.list({ ...filters, status: tabStatus }), animalsApi.list(filters)])
  const all = allDto.map((d) => toAnimal(d))
  const tabCounts: Record<AnimalTab, number> = {
    active: all.filter((a) => inTab(a, "active", today)).length,
    arriving: all.filter((a) => inTab(a, "arriving", today)).length,
    releasing: all.filter((a) => inTab(a, "releasing", today)).length,
    released: all.filter((a) => inTab(a, "released", today)).length,
  }
  const animals = rowsDto
    .map((d) => toAnimal(d))
    .filter((a) => inTab(a, params.tab, today))
    .filter((a) => !params.block || params.block === "all" || a.kennelCode.startsWith(`${params.block}-`))
  const checks = await todaysChecks(animals)
  let rows = animals.map((a) => toRow(a, checks))

  const isDue = (r: AnimalRow) => [r.am.state, r.pm.state].some((s) => s === "due" || s === "overdue")
  const chipCounts = { all: rows.length, unwell: 0, check_due: rows.filter(isDue).length }
  if (params.chip === "unwell") rows = []
  if (params.chip === "check_due") rows = rows.filter(isDue)

  const sort = params.sort ?? { key: "kennel", dir: "asc" }
  const dir = sort.dir === "asc" ? 1 : -1
  rows.sort((x, y) => {
    switch (sort.key) {
      case "name":
        return dir * x.animal.name.localeCompare(y.animal.name)
      case "stay":
        return dir * (x.stay.day - y.stay.day)
      case "release":
        return dir * x.animal.releaseDate.localeCompare(y.animal.releaseDate)
      default:
        return dir * x.animal.kennelCode.localeCompare(y.animal.kennelCode, undefined, { numeric: true })
    }
  })
  const pageSize = params.pageSize ?? PAGE_SIZE
  const total = rows.length
  const page = Math.min(Math.max(1, params.page ?? 1), Math.max(1, Math.ceil(total / pageSize)))
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    allRows: rows,
    total,
    page,
    pageSize,
    tabCounts,
    chipCounts,
    notices: checkNotice(checks.failed),
  }
}

/** `GET /animals/{id}/exam`: 404 means the exam hasn't been done. */
async function loadExam(stayId: number): Promise<{ exam: ArrivalExamDto | null; failed: boolean }> {
  try {
    return { exam: await examApi.get(stayId), failed: false }
  } catch (e) {
    if (isApiError(e) && e.status === 404) return { exam: null, failed: false }
    return { exam: null, failed: true }
  }
}

function kennelOf(dto: AnimalStayDto): Kennel {
  return toKennel({ id: dto.kennelId, code: dto.kennelCode, block: dto.kennelBlock, isActive: true })
}

export async function getAnimal(id: string): Promise<AnimalDetail> {
  const stayId = numericId(id, "animal")
  const stay = await animalsApi.get(stayId)
  const today = todayISO()
  const [examRes, inspRes, medRes] = await Promise.allSettled([
    loadExam(stayId),
    inspectionsApi.list(stayId),
    isStaying(stay.status) ? medicationApi.day(stayId, today) : Promise.resolve(null),
  ])
  const notices: string[] = []
  const examOut = examRes.status === "fulfilled" ? examRes.value : { exam: null, failed: true }
  if (examOut.failed) notices.push("The arrival exam couldn’t be loaded from the API.")
  // Unknown exam state (load failed) → treat as active and let the API enforce the rule.
  const animal = toAnimal(stay, examOut.failed ? undefined : Boolean(examOut.exam))
  const inspections = inspRes.status === "fulfilled" ? inspRes.value.map((d) => toInspection(d, animal.kennelCode)) : null
  if (!inspections) notices.push("Daily inspections couldn’t be loaded from the API.")
  let medications: MedicationCardItem[] = []
  if (medRes.status === "fulfilled" && medRes.value) medications = slotsToCards(stayId, medRes.value.slots)
  else if (medRes.status === "rejected") notices.push(`Medication: ${(medRes.reason as Error).message}`)

  const row: AnimalRow = {
    animal,
    speciesName: speciesName(animal.speciesId),
    status: healthStatus(animal),
    stay: stayProgress(animal.arrivalDate, animal.releaseDate),
    am: inspections ? checkFromInspections(animal, inspections, today, "AM") : unknownCheck("AM"),
    pm: inspections ? checkFromInspections(animal, inspections, today, "PM") : unknownCheck("PM"),
    openCaseId: null,
    releasingSoon: false,
  }
  const exam = examOut.exam ? { ...toExam(examOut.exam), vetName: staffLabel(examOut.exam.vetStaffId) } : null
  return {
    row,
    exam,
    cases: [],
    medications,
    summary: {
      bullets: [{ text: "AI summaries are not available from the API yet.", citations: [] }],
      updatedAt: nowISO(),
    },
    kennel: kennelOf(stay),
    timelineTotal: (inspections?.length ?? 0) + (exam ? 1 : 0),
    closeReasonLabel: {
      resolved: "Resolved — signs cleared",
      released: "Animal released",
      duplicate: "Duplicate case",
      other: "Other",
    },
    notices,
  }
}

export async function getTimeline(id: string, params: { type?: TimelineType | "all"; period?: TimelinePeriod; limit?: number } = {}) {
  const stayId = numericId(id, "animal")
  const today = todayISO()
  const stay = await animalsApi.get(stayId)
  const [examRes, inspRes, obsRes, medRes] = await Promise.allSettled([
    loadExam(stayId),
    inspectionsApi.list(stayId),
    observationsApi.listForStay(stayId),
    isStaying(stay.status) ? medicationApi.day(stayId, today) : Promise.resolve(null),
  ])
  const entries: TimelineEntry[] = []
  const failed: string[] = []
  if (examRes.status === "fulfilled" && examRes.value.exam) {
    const ex = toExam(examRes.value.exam)
    const abn = ex.findings.filter((f) => !f.normal)
    entries.push({
      id: `t-exam-${ex.id}`,
      refId: ex.id,
      type: "exam",
      at: ex.at,
      title: "Arrival exam",
      titleRef: null,
      detail: [
        examRes.value.exam.vetStaffId ? `Vet ${staffLabel(examRes.value.exam.vetStaffId)}` : null,
        `${ex.weightKg.toFixed(1)} kg`,
        ex.mentation,
        ...abn.map((f) => `${f.system} abnormal: ${f.note}`),
      ]
        .filter(Boolean)
        .join(" · "),
      tone: abn.length ? "abnormal" : "neutral",
      media: [],
      href: null,
    })
  } else if (examRes.status === "rejected" || examRes.value.failed) failed.push("arrival exam")
  if (inspRes.status === "fulfilled") {
    for (const d of inspRes.value) {
      const i = toInspection(d, stay.kennelCode)
      entries.push({
        id: `t-insp-${i.id}`,
        refId: i.id,
        type: "inspection",
        at: i.at,
        title: `${i.session} inspection`,
        titleRef: null,
        detail: `${inspectionSummary(i)} · by ${staffLabel(d.recordedBy)}`,
        tone: i.abnormalCount > 0 ? "abnormal" : "success",
        media: [],
        href: null,
      })
    }
  } else failed.push("inspections")
  if (obsRes.status === "fulfilled") {
    for (const o of obsRes.value) {
      const at = fromUtc(o.submittedAt) ?? o.submittedAt
      entries.push({
        id: `t-obs-${o.id}`,
        refId: `obs-${o.id}`,
        type: "observation",
        at,
        title: "Observation",
        titleRef: `#${o.id}`,
        detail: o.text,
        tone: "abnormal",
        media: o.media.map((m) => ({ id: `m-${m.id}`, kind: m.mediaKind, caption: m.mediaKey, at, byUserId: `staff-${o.submittedBy}` })),
        href: null,
      })
    }
  } else failed.push("observations")
  if (medRes.status === "fulfilled" && medRes.value) entries.push(...medicationTimeline(medRes.value.slots))
  else if (medRes.status === "rejected") failed.push("medication")

  const from =
    params.period === "today"
      ? today
      : params.period === "7d"
        ? addDays(today, -6)
        : params.period === "30d"
          ? addDays(today, -29)
          : stay.arrivalDate
  let list = entries.filter((e) => e.at.slice(0, 10) >= from).sort((a, b) => b.at.localeCompare(a.at))
  if (params.type && params.type !== "all") list = list.filter((e) => e.type === params.type)
  return {
    entries: list.slice(0, params.limit ?? 7),
    total: list.length,
    notices: failed.length ? [`Couldn’t load ${failed.join(", ")} from the API.`] : [],
  }
}

// ---------------------------------------------------------------------------
// Arrival (POST /animals) & reference data
// ---------------------------------------------------------------------------

/** Active kennels without a staying animal (`GET /kennels?isActive=true` + `GET /animals?status=active-monitoring`). */
export async function availableKennels(): Promise<(Kennel & { apiId: number })[]> {
  const [kennels, staying] = await Promise.all([referenceApi.kennels(true), animalsApi.list({ status: STAYING_STATUS })])
  const occupied = new Set(staying.map((s) => s.kennelId))
  return kennels
    .filter((k) => !occupied.has(k.id))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((k) => ({ ...toKennel(k), apiId: k.id }))
}

export async function createArrival(input: ArrivalInput): Promise<Animal> {
  const microchip = input.microchip.replace(/\s/g, "")
  if (!/^\d{15}$/.test(microchip)) throw new ApiError("VALIDATION", "Microchip must be 15 digits.", "microchip")
  const kennels = await referenceApi.kennels(true)
  const kennel = kennels.find((k) => k.code === input.kennelCode)
  if (!kennel) throw new ApiError("VALIDATION", "Pick a kennel.", "kennelCode")
  try {
    const dto = await animalsApi.create({
      name: input.name.trim(),
      kennelId: kennel.id,
      species: speciesEnum(input.speciesId),
      sex: sexEnum(input.sex),
      countryCode: input.origin,
      microchip,
      dateOfBirth: input.dateOfBirth || null,
      arrivalDate: input.arrivalDate || todayISO(),
    })
    return toAnimal(dto, false)
  } catch (e) {
    // 409 "An active stay already exists for this microchip."
    if (isApiError(e) && e.status === 409) throw new ApiError("CONFLICT", e.message, "microchip", 409)
    if (isApiError(e) && e.field === "countryCode") throw new ApiError("VALIDATION", e.message, "origin", e.status)
    if (isApiError(e) && e.field === "kennelId") throw new ApiError("VALIDATION", e.message, "kennelCode", e.status)
    throw e
  }
}

export async function completeArrivalExam(animalId: string, input: ArrivalExamInput) {
  const stayId = numericId(animalId, "animal")
  const findings = input.findings.map((f) => {
    const system = EXAM_SYSTEM[f.system]
    if (!system) throw new ApiError("VALIDATION", `Unknown exam system “${f.system}”.`, "findings")
    return { system, abnormal: !f.normal, note: f.normal ? null : f.note.trim(), photoKeys: [] as string[] }
  })
  await examApi.submit(stayId, {
    vetStaffId: input.vetId ? Number(input.vetId.replace(/^staff-/, "")) || null : null,
    weightKg: input.weightKg,
    mentation: input.mentation as MentationDto,
    findings,
  })
  // The draft is only useful until the exam is submitted.
  await examApi.deleteDraft().catch(() => undefined)
  const stay = await animalsApi.get(stayId)
  // The API routes abnormal findings to AI itself; it returns no observation ids.
  return { animal: toAnimal(stay, true), observationIds: [] as string[] }
}

/** Exam portion of the officer's arrival draft (`GET /arrival-draft`, `PUT /arrival-draft/exam`). */
export async function loadExamDraft(): Promise<ExamDraft | null> {
  try {
    return (await examApi.getDraft()).examJson ?? null
  } catch (e) {
    if (isApiError(e) && e.status === 404) return null
    throw e
  }
}

export async function saveExamDraft(input: Partial<ArrivalExamInput>): Promise<void> {
  await examApi.saveDraft({
    vetStaffId: null,
    weightKg: input.weightKg && Number.isFinite(input.weightKg) ? input.weightKg : null,
    mentation: (input.mentation as MentationDto | undefined) ?? null,
    findings: input.findings
      ? input.findings
          .filter((f) => EXAM_SYSTEM[f.system])
          .map((f) => ({ system: EXAM_SYSTEM[f.system], abnormal: !f.normal, note: f.note || null, photoKeys: [] }))
      : null,
  })
}

export async function releaseAnimal(id: string): Promise<void> {
  await animalsApi.updateStatus(numericId(id, "animal"), { status: "released", releaseDate: todayISO() })
}

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const rows = await animalsApi.list({ search: q.replace(/\s/g, "").match(/^\d+$/) ? q.replace(/\s/g, "") : q })
  return rows.slice(0, 8).map((d) => {
    const a = toAnimal(d)
    return {
      kind: "animal" as const,
      id: a.id,
      title: `${a.kennelCode} · ${a.name}`,
      subtitle: `${speciesName(a.speciesId)} · ${isStaying(d.status) ? "Staying" : d.status === "released" ? "Released" : "Deceased"} · MC …${a.microchip.slice(-4)}`,
      href: `/animals/${a.id}`,
    }
  })
}

export async function countStaying(): Promise<number> {
  return (await animalsApi.list({ status: STAYING_STATUS })).length
}
