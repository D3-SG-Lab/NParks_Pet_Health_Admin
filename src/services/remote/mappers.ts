/**
 * Maps NParksPetHealth API records onto the app's domain model so the existing
 * screens render them unchanged. Fields the API does not provide get neutral
 * values ("" / null) — never invented data.
 */
import { SESSIONS } from "@/config/app"
import { fromUtc, now, sessionDue } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import { dailyItems } from "@/lib/mock/seed-reference"
import type {
  Animal,
  ArrivalExam,
  ChecklistItem,
  Inspection,
  InspectionResult,
  Kennel,
  KennelBlock,
  MedicationRoute,
  MedicationSchedule,
  Mentation,
  Session,
  Sex,
  Species,
} from "@/types/domain"

import type { CheckInfo } from "../derive"
import type {
  AnimalStayDto,
  ArrivalExamDto,
  DailyInspectionDto,
  ExamSystem,
  Food,
  InspectionSystem,
  KennelDto,
  MentationDto,
  StaySex,
  StaySpecies,
  Stool,
  SubmitInspectionRequest,
  Urine,
} from "../api/types"

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/** API ids are numbers; the app's routes and keys use strings. */
export function numericId(id: string, what = "record"): number {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) throw new ApiError("NOT_FOUND", `This ${what} doesn’t exist in the API.`)
  return n
}

export const staffRef = (id: number | null | undefined) => (id ? `staff-${id}` : "")
export const staffLabel = (id: number | null | undefined) => (id ? `Staff #${id}` : "—")

// ---------------------------------------------------------------------------
// Species & sex (stay endpoints use fixed enums)
// ---------------------------------------------------------------------------

const SPECIES_ID: Record<StaySpecies, string> = { Dog: "dog", Cat: "cat", Other: "other" }

/** Species accepted by `POST /animals` (`species: 'Dog' | 'Cat' | 'Other'`). */
export const STAY_SPECIES: Species[] = (["Dog", "Cat", "Other"] as const).map((name) => ({
  id: SPECIES_ID[name],
  name,
  description: "",
  checklistTemplateId: "",
  defaultStayDays: 0,
  kennelTypes: [],
  enabled: true,
}))

export function speciesEnum(speciesId: string): StaySpecies {
  const found = (Object.keys(SPECIES_ID) as StaySpecies[]).find((k) => SPECIES_ID[k] === speciesId)
  if (!found) throw new ApiError("VALIDATION", "Pick a species.", "speciesId")
  return found
}

export const speciesIdOf = (s: string) => SPECIES_ID[s as StaySpecies] ?? "other"

const SEX: Record<StaySex, Sex> = { Male: "M", Female: "F", Unknown: "U" }
export const sexOf = (s: string): Sex => SEX[s as StaySex] ?? "U"
export const sexEnum = (s: Sex): StaySex => (s === "M" ? "Male" : s === "F" ? "Female" : "Unknown")

// ---------------------------------------------------------------------------
// Animal stays & kennels
// ---------------------------------------------------------------------------

/**
 * `hasExam` decides "arriving" (exam pending) vs "active" for a staying animal;
 * when unknown (lists), staying animals are treated as active and the API
 * enforces the real rule when an inspection is submitted.
 */
export function toAnimal(dto: AnimalStayDto, hasExam?: boolean): Animal {
  const released = dto.status !== "staying"
  return {
    id: String(dto.id),
    name: dto.name,
    speciesId: speciesIdOf(dto.species),
    breed: "",
    sex: sexOf(dto.sex),
    dateOfBirth: dto.dateOfBirth ?? "",
    origin: dto.countryName || dto.countryCode,
    microchip: dto.microchip,
    kennelCode: dto.kennelCode,
    arrivalDate: dto.arrivalDate,
    releaseDate: dto.releaseDate ?? "",
    stayStatus: released ? "released" : hasExam === false ? "arriving" : "active",
    releasedAt: released ? (dto.releaseDate ? `${dto.releaseDate}T00:00:00` : fromUtc(dto.updatedAt)) : null,
    releaseNote: dto.status === "deceased" ? "Deceased" : null,
    monitoringFlag: false,
    monitoringNote: null,
    monitoringAssigneeId: null,
    monitoringAction: null,
    monitoringDueAt: null,
    createdAt: fromUtc(dto.createdAt) ?? dto.createdAt,
    createdBy: staffRef(dto.createdBy),
  }
}

/** Kennel records only carry code, block and active flag. */
export function toKennel(dto: KennelDto): Kennel {
  return {
    code: dto.code,
    blockCode: dto.block,
    type: "Dog run · medium",
    speciesAllowed: STAY_SPECIES.map((s) => s.id),
    status: dto.isActive ? "in_service" : "out_of_service",
    availableFrom: null,
  }
}

export const kennelTypeLabel = () => "—"

export function blocksOf(kennels: KennelDto[]): KennelBlock[] {
  const codes = [...new Set(kennels.map((k) => k.block))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return codes.map((code) => ({ code, name: code, kind: "kennel" as const }))
}

// ---------------------------------------------------------------------------
// Arrival exam
// ---------------------------------------------------------------------------

/** UI exam rows → `system` values of `POST /animals/{id}/exam`. */
export const EXAM_SYSTEM: Record<string, ExamSystem> = {
  "Skin / coat": "skin",
  Eyes: "eyes",
  Nose: "nose",
  Ears: "ears",
  Mouth: "mouth",
  Hydration: "hydration",
  Respiratory: "respiratory",
}
const EXAM_LABEL = Object.fromEntries(Object.entries(EXAM_SYSTEM).map(([k, v]) => [v, k])) as Record<ExamSystem, string>

export function toExam(dto: ArrivalExamDto): ArrivalExam {
  return {
    id: String(dto.id),
    animalId: String(dto.stayId),
    at: fromUtc(dto.examinedAt) ?? dto.examinedAt,
    vetId: staffRef(dto.vetStaffId),
    weightKg: dto.weightKg,
    mentation: dto.mentation as Mentation,
    findings: dto.findings.map((f) => ({ system: EXAM_LABEL[f.system] ?? f.system, normal: !f.abnormal, note: f.note ?? "" })),
    notes: "",
  }
}

// ---------------------------------------------------------------------------
// Daily inspection
// ---------------------------------------------------------------------------

export const API_TEMPLATE_NAME = "API daily checklist"
export const API_TEMPLATE_VERSION = 1

/**
 * The inspection payload has fixed fields (mentation, food, stool, urine and
 * seven systems). These checklist items carry exactly the API's enum values.
 */
export function apiChecklistItems(): ChecklistItem[] {
  return dailyItems({ watery: true }).map((i) => ({ ...i, changeNote: null }))
}

const INSPECTION_SYSTEM: Record<string, InspectionSystem> = {
  "Skin / coat": "skin",
  Eyes: "eyes",
  Nose: "nose",
  Ears: "ears",
  Mouth: "mouth",
  Hydration: "hydration",
  Cardiorespiratory: "cardiorespiratory",
}
const INSPECTION_LABEL = Object.fromEntries(Object.entries(INSPECTION_SYSTEM).map(([k, v]) => [v, k])) as Record<InspectionSystem, string>

/**
 * Checklist answers → `POST /animals/{id}/inspections` body. The API has no
 * per-system note, so notes on abnormal rows are added to `otherFindings`.
 */
export function toInspectionRequest(input: {
  date: string
  session: Session
  results: InspectionResult[]
  otherFindings: string
}): SubmitInspectionRequest {
  const value = (label: string) => input.results.find((r) => r.label === label)?.value
  const notes = input.results.filter((r) => r.abnormal && r.note.trim()).map((r) => `${r.label}: ${r.note.trim()}`)
  const other = [...notes, input.otherFindings.trim()].filter(Boolean).join("\n")
  return {
    session: input.session,
    inspectionDate: input.date,
    mentation: (value("Mentation") ?? "Responsive") as MentationDto,
    food: (value("Food") ?? "Full") as Food,
    stool: (value("Stool") ?? "Firm") as Stool,
    urine: (value("Urine") ?? "Yes") as Urine,
    otherFindings: other || null,
    systemFindings: input.results
      .filter((r) => INSPECTION_SYSTEM[r.label])
      .map((r) => ({ system: INSPECTION_SYSTEM[r.label], finding: r.abnormal ? ("abnormal" as const) : ("normal" as const) })),
  }
}

const ABNORMAL_VALUE: Record<string, string[]> = {
  Food: ["Half", "Little", "None"],
  Stool: ["Soft", "Loose", "Watery", "None"],
  Urine: ["No"],
}

export function toInspection(dto: DailyInspectionDto, kennelCode: string): Inspection {
  const results: InspectionResult[] = [
    { itemId: "mentation", label: "Mentation", value: dto.mentation, abnormal: false, note: "" },
    ...dto.systemFindings.map((f) => ({
      itemId: f.system === "cardiorespiratory" ? "cardio" : "body",
      label: INSPECTION_LABEL[f.system] ?? f.system,
      value: f.finding === "abnormal" ? "Abnormal" : "Normal",
      abnormal: f.finding === "abnormal",
      note: "",
    })),
    ...(["Food", "Stool", "Urine"] as const).map((label) => {
      const v = label === "Food" ? dto.food : label === "Stool" ? dto.stool : dto.urine
      return { itemId: label.toLowerCase(), label, value: v, abnormal: ABNORMAL_VALUE[label].includes(v), note: "" }
    }),
  ]
  const otherFindings = dto.otherFindings ?? ""
  return {
    id: String(dto.id),
    animalId: String(dto.stayId),
    kennelCode,
    date: dto.inspectionDate,
    session: dto.session,
    at: fromUtc(dto.recordedAt) ?? dto.recordedAt,
    byUserId: staffRef(dto.recordedBy),
    templateId: "api",
    templateVersion: API_TEMPLATE_VERSION,
    results,
    otherFindings,
    abnormalCount: results.filter((r) => r.abnormal).length + (otherFindings.trim() ? 1 : 0),
    editedAt: null,
  }
}

/** AM/PM state for an active animal from that day's inspections. */
export function checkFromInspections(animal: Animal, inspections: Inspection[], date: string, session: Session): CheckInfo {
  const dueTime = SESSIONS[session].due
  if (animal.stayStatus !== "active" || date < animal.arrivalDate) {
    return { session, state: "not_applicable", inspectionId: null, at: null, abnormalCount: 0, dueTime }
  }
  const insp = inspections.find((i) => i.date === date && i.session === session)
  if (insp) {
    return {
      session,
      state: insp.abnormalCount > 0 ? "abnormal" : "done",
      inspectionId: insp.id,
      at: insp.at,
      abnormalCount: insp.abnormalCount,
      dueTime,
    }
  }
  const overdue = now().getTime() > sessionDue(date, session).getTime()
  return { session, state: overdue ? "overdue" : "due", inspectionId: null, at: null, abnormalCount: 0, dueTime }
}

/** Check state when the inspections could not be loaded. */
export function unknownCheck(session: Session): CheckInfo {
  return { session, state: "not_applicable", inspectionId: null, at: null, abnormalCount: 0, dueTime: SESSIONS[session].due }
}

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

/** Pseudo schedule for the medication card (the API returns schedules only inside dose slots). */
export function scheduleFromSlot(
  stayId: number,
  s: { scheduleId: number; item: string; dose: string; startDate: string; endDate: string },
  times: string[]
): MedicationSchedule {
  return {
    id: String(s.scheduleId),
    animalId: String(stayId),
    item: s.item,
    dose: s.dose,
    // Route and site are not part of the API's dose slot.
    route: "" as MedicationRoute,
    site: "",
    frequency: times.length === 1 ? "1x" : times.length === 2 ? "2x" : times.length === 3 ? "3x" : "custom",
    doseTimes: times,
    startDate: s.startDate,
    endDate: s.endDate,
    caseId: null,
    createdAt: "",
    createdBy: "",
    stoppedAt: null,
  }
}

/** For actions the API has no endpoint for (the UI hides them in API mode). */
export function notInApi(what: string): never {
  throw new ApiError("CONFLICT", `${what} isn’t available yet — the API has no endpoint for it.`)
}
