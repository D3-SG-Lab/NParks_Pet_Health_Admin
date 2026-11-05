/**
 * Demo data set (BE-003 "Seed and reference data"). Operational records are
 * anchored to the design reference day so screens match Admin_Design.pdf:
 * Wed 21 Oct 2026, AM session, 08:42.
 */
import { APP_CONFIG } from "@/config/app"
import { ROLE_LABEL } from "@/config/rbac"
import { addDays, toISODate } from "@/lib/clock"
import type {
  AiResult,
  Animal,
  AppNotification,
  ArrivalExam,
  AuditEvent,
  AuditSource,
  HealthCase,
  Inspection,
  InspectionResult,
  MedicationAdministration,
  MedicationSchedule,
  Observation,
  User,
} from "@/types/domain"

import { chainEvent, type AuditInput } from "./audit-chain"
import type { Db } from "./db"
import {
  BODY_SYSTEMS,
  seedGlossary,
  seedKennels,
  seedNotificationRules,
  seedSigns,
  seedSpecies,
  seedTemplates,
  seedUsers,
} from "./seed-reference"

const ANCHOR = APP_CONFIG.demoNow === "real" ? toISODate(new Date()) : APP_CONFIG.demoNow.split("T")[0]

const D = (offset: number) => addDays(ANCHOR, offset)
const T = (offset: number, hm: string) => `${D(offset)}T${hm.length === 5 ? `${hm}:00` : hm}`

const mc = (suffix: string) => `90012345678${suffix}`

interface AnimalSeed {
  id: string
  name: string
  speciesId: string
  breed: string
  sex: "M" | "F"
  ageYears: number
  origin: string
  mcSuffix: string
  kennel: string
  /** Day N of the 30-day stay today (arrival = today − (N − 1)). */
  day: number
  exam: boolean
}

const ANIMALS: AnimalSeed[] = [
  {
    id: "a-rex",
    name: "Rex",
    speciesId: "dog",
    breed: "Labrador Retriever",
    sex: "M",
    ageYears: 4,
    origin: "Malaysia",
    mcSuffix: "0907",
    kennel: "KC1-1",
    day: 14,
    exam: true,
  },
  {
    id: "a-oreo",
    name: "Oreo",
    speciesId: "cat",
    breed: "Domestic Shorthair",
    sex: "M",
    ageYears: 3,
    origin: "Malaysia",
    mcSuffix: "0911",
    kennel: "KC1-2",
    day: 8,
    exam: true,
  },
  {
    id: "a-biscuit",
    name: "Biscuit",
    speciesId: "dog",
    breed: "Beagle",
    sex: "F",
    ageYears: 2,
    origin: "Thailand",
    mcSuffix: "0913",
    kennel: "KC1-3",
    day: 10,
    exam: true,
  },
  {
    id: "a-milo",
    name: "Milo",
    speciesId: "dog",
    breed: "Cocker Spaniel",
    sex: "M",
    ageYears: 5,
    origin: "United Kingdom",
    mcSuffix: "0912",
    kennel: "KC1-4",
    day: 20,
    exam: true,
  },
  {
    id: "a-pepper",
    name: "Pepper",
    speciesId: "cat",
    breed: "British Shorthair",
    sex: "F",
    ageYears: 6,
    origin: "Indonesia",
    mcSuffix: "0914",
    kennel: "KC1-5",
    day: 5,
    exam: true,
  },
  {
    id: "a-kiko",
    name: "Kiko",
    speciesId: "cat",
    breed: "Ragdoll",
    sex: "F",
    ageYears: 1,
    origin: "Japan",
    mcSuffix: "0915",
    kennel: "KC1-6",
    day: 1,
    exam: false,
  },
  {
    id: "a-mochi",
    name: "Mochi",
    speciesId: "cat",
    breed: "Scottish Fold",
    sex: "F",
    ageYears: 2,
    origin: "Japan",
    mcSuffix: "0903",
    kennel: "KC2-1",
    day: 27,
    exam: true,
  },
  {
    id: "a-yangyang",
    name: "Yang Yang",
    speciesId: "dog",
    breed: "Shih Tzu",
    sex: "F",
    ageYears: 5,
    origin: "Australia",
    mcSuffix: "0901",
    kennel: "KC2-2",
    day: 12,
    exam: true,
  },
  {
    id: "a-lucky",
    name: "Lucky",
    speciesId: "dog",
    breed: "Border Collie",
    sex: "M",
    ageYears: 1,
    origin: "New Zealand",
    mcSuffix: "0902",
    kennel: "KC2-3",
    day: 4,
    exam: true,
  },
  {
    id: "a-coco",
    name: "Coco",
    speciesId: "dog",
    breed: "Poodle (miniature)",
    sex: "F",
    ageYears: 7,
    origin: "United States",
    mcSuffix: "0904",
    kennel: "KC2-4",
    day: 15,
    exam: true,
  },
  {
    id: "a-luna",
    name: "Luna",
    speciesId: "cat",
    breed: "Bengal",
    sex: "F",
    ageYears: 4,
    origin: "Australia",
    mcSuffix: "0905",
    kennel: "KC2-5",
    day: 9,
    exam: true,
  },
  {
    id: "a-max",
    name: "Max",
    speciesId: "dog",
    breed: "German Shepherd",
    sex: "M",
    ageYears: 6,
    origin: "Malaysia",
    mcSuffix: "0906",
    kennel: "KC2-6",
    day: 22,
    exam: true,
  },
  {
    id: "a-bella",
    name: "Bella",
    speciesId: "cat",
    breed: "Persian",
    sex: "F",
    ageYears: 8,
    origin: "United Kingdom",
    mcSuffix: "0921",
    kennel: "KC3-1",
    day: 17,
    exam: true,
  },
  {
    id: "a-teddy",
    name: "Teddy",
    speciesId: "dog",
    breed: "Golden Retriever",
    sex: "M",
    ageYears: 3,
    origin: "Japan",
    mcSuffix: "0922",
    kennel: "KC3-2",
    day: 25,
    exam: true,
  },
  {
    id: "a-simba",
    name: "Simba",
    speciesId: "cat",
    breed: "Maine Coon",
    sex: "M",
    ageYears: 5,
    origin: "South Africa",
    mcSuffix: "0923",
    kennel: "KC3-3",
    day: 13,
    exam: true,
  },
  {
    id: "a-nala",
    name: "Nala",
    speciesId: "dog",
    breed: "Corgi",
    sex: "F",
    ageYears: 2,
    origin: "Australia",
    mcSuffix: "0925",
    kennel: "KC3-5",
    day: 6,
    exam: true,
  },
  {
    id: "a-hachi",
    name: "Hachi",
    speciesId: "dog",
    breed: "Shiba Inu",
    sex: "M",
    ageYears: 3,
    origin: "Japan",
    mcSuffix: "0926",
    kennel: "KC3-6",
    day: 1,
    exam: false,
  },
]

const RELEASED: {
  id: string
  name: string
  speciesId: string
  breed: string
  sex: "M" | "F"
  ageYears: number
  origin: string
  mcSuffix: string
  kennel: string
  releasedDaysAgo: number
}[] = [
  {
    id: "a-bruno",
    name: "Bruno",
    speciesId: "dog",
    breed: "Boxer",
    sex: "M",
    ageYears: 6,
    origin: "Australia",
    mcSuffix: "0811",
    kennel: "KC3-4",
    releasedDaysAgo: 2,
  },
  {
    id: "a-kopi",
    name: "Kopi",
    speciesId: "cat",
    breed: "Domestic Shorthair",
    sex: "M",
    ageYears: 2,
    origin: "Malaysia",
    mcSuffix: "0812",
    kennel: "KC1-6",
    releasedDaysAgo: 3,
  },
  {
    id: "a-snowy",
    name: "Snowy",
    speciesId: "dog",
    breed: "Samoyed",
    sex: "F",
    ageYears: 4,
    origin: "Japan",
    mcSuffix: "0813",
    kennel: "KC3-6",
    releasedDaysAgo: 4,
  },
  {
    id: "a-charlie",
    name: "Charlie",
    speciesId: "dog",
    breed: "Jack Russell Terrier",
    sex: "M",
    ageYears: 9,
    origin: "United Kingdom",
    mcSuffix: "0814",
    kennel: "KC2-3",
    releasedDaysAgo: 6,
  },
  {
    id: "a-ginger",
    name: "Ginger",
    speciesId: "cat",
    breed: "Abyssinian",
    sex: "F",
    ageYears: 5,
    origin: "New Zealand",
    mcSuffix: "0815",
    kennel: "KC1-5",
    releasedDaysAgo: 8,
  },
  {
    id: "a-thumper",
    name: "Thumper",
    speciesId: "other",
    breed: "Holland Lop rabbit",
    sex: "M",
    ageYears: 2,
    origin: "Australia",
    mcSuffix: "0816",
    kennel: "KC1-3",
    releasedDaysAgo: 12,
  },
]

const VET = "u-lim-w"
const OFFICER = "u-tan-j"
const KLEE = "u-lee-k"
const SONG = "u-ong-s"

function dob(ageYears: number, salt: number): string {
  const month = String(((salt * 5) % 12) + 1).padStart(2, "0")
  const day = String(((salt * 7) % 27) + 1).padStart(2, "0")
  return `${Number(ANCHOR.slice(0, 4)) - ageYears - (Number(month) > Number(ANCHOR.slice(5, 7)) ? 1 : 0)}-${month}-${day}`
}

/** Normal daily results with optional per-row overrides ("Stool" → "Soft"). */
function dailyResults(overrides: Record<string, { value: string; note?: string }> = {}): InspectionResult[] {
  const rows: [string, string, string][] = [
    ["mentation", "Mentation", "Responsive"],
    ["body", "Skin / coat", "Normal"],
    ["body", "Eyes", "Normal"],
    ["body", "Nose", "Normal"],
    ["body", "Ears", "Normal"],
    ["body", "Mouth", "Normal"],
    ["body", "Hydration", "Normal"],
    ["cardio", "Cardiorespiratory", "Normal"],
    ["food", "Food", "Full"],
    ["stool", "Stool", "Firm"],
    ["urine", "Urine", "Yes"],
  ]
  const abnormalValues = new Set(["Abnormal", "Half", "Little", "None", "Soft", "Loose", "Watery", "No"])
  return rows.map(([itemId, label, def]) => {
    const o = overrides[label]
    const value = o?.value ?? def
    return { itemId, label, value, abnormal: abnormalValues.has(value), note: o?.note ?? "" }
  })
}

export function buildSeed(): Db {
  const users = seedUsers(T)
  const userById = new Map(users.map((u) => [u.id, u]))
  const { blocks, kennels } = seedKennels()
  const species = seedSpecies()
  const templates = seedTemplates(T)
  const signs = seedSigns()

  // Kennel KC3-4 is being cleaned until tomorrow (Inspections board p.6).
  const kc34 = kennels.find((k) => k.code === "KC3-4")
  if (kc34) kc34.availableFrom = D(1)

  const audit: AuditInput[] = []
  const actor = (userId: string | null, source: AuditSource = "Web workbench") => {
    if (!userId) return { userId: null, userName: "AI worker", userRole: "System", idp: "System", source: "AI worker" as AuditSource }
    const u = userById.get(userId) as User
    return {
      userId,
      userName: u.name,
      userRole: ROLE_LABEL[u.role],
      idp: u.idp === "officer" ? "Officer IdP" : "Contractor IdP",
      source,
    }
  }
  const log = (
    at: string,
    userId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    entityLabel: string,
    extra: Partial<AuditInput> = {}
  ) => {
    audit.push({
      at,
      ...actor(userId, extra.source ?? (userId && userById.get(userId)?.idp === "contractor" ? "Mobile app · Android" : "Web workbench")),
      action,
      entityType,
      entityId,
      entityLabel,
      animalId: null,
      caseId: null,
      before: null,
      after: null,
      ...extra,
    })
  }

  // ---------------------------------------------------------------------
  // Animals & arrival exams
  // ---------------------------------------------------------------------
  const animals: Animal[] = []
  const exams: ArrivalExam[] = []
  ANIMALS.forEach((a, i) => {
    const arrivalDate = D(-(a.day - 1))
    const animal: Animal = {
      id: a.id,
      name: a.name,
      speciesId: a.speciesId,
      breed: a.breed,
      sex: a.sex,
      dateOfBirth: a.id === "a-yangyang" ? `${Number(ANCHOR.slice(0, 4)) - 5}-03-12` : dob(a.ageYears, i + 3),
      origin: a.origin,
      microchip: mc(a.mcSuffix),
      kennelCode: a.kennel,
      arrivalDate,
      releaseDate: addDays(arrivalDate, 30),
      stayStatus: a.exam ? "active" : "arriving",
      releasedAt: null,
      releaseNote: null,
      monitoringFlag: false,
      monitoringNote: null,
      monitoringAssigneeId: null,
      monitoringAction: null,
      monitoringDueAt: null,
      createdAt: `${arrivalDate}T${a.exam ? "13:50" : "07:20"}:00`,
      createdBy: OFFICER,
    }
    animals.push(animal)
    log(animal.createdAt, OFFICER, "Arrival created", "Animal", a.id, `${a.kennel} · ${a.name}`, {
      animalId: a.id,
      after: { name: a.name, kennel: a.kennel, microchip: animal.microchip, releaseDate: animal.releaseDate },
    })
    if (a.exam) {
      const isYY = a.id === "a-yangyang"
      const exam: ArrivalExam = {
        id: `ex-${a.id}`,
        animalId: a.id,
        at: `${arrivalDate}T14:30:00`,
        vetId: i % 3 === 0 ? "u-rajan-p" : VET,
        weightKg: isYY ? 6.4 : a.speciesId === "cat" ? 3.2 + (i % 4) * 0.6 : 8 + (i % 5) * 6.5,
        mentation: isYY ? "Calm" : "Responsive",
        findings: ["Skin / coat", "Eyes", "Nose", "Ears", "Mouth", "Hydration", "Respiratory"].map((system) => ({
          system,
          normal: !(isYY && system === "Ears"),
          note: isYY && system === "Ears" ? "mild waxy discharge, left ear" : "",
        })),
        notes: "",
      }
      if (isYY) exam.vetId = VET
      exams.push(exam)
      log(exam.at, exam.vetId, "Arrival exam completed", "ArrivalExam", exam.id, `${a.kennel} · ${a.name}`, {
        animalId: a.id,
        before: { status: "Arriving" },
        after: { status: "Active monitoring", weightKg: Number(exam.weightKg.toFixed(1)), mentation: exam.mentation },
      })
    }
  })
  RELEASED.forEach((r, i) => {
    const releasedOn = D(-r.releasedDaysAgo)
    const arrivalDate = addDays(releasedOn, -30)
    animals.push({
      id: r.id,
      name: r.name,
      speciesId: r.speciesId,
      breed: r.breed,
      sex: r.sex,
      dateOfBirth: dob(r.ageYears, i + 11),
      origin: r.origin,
      microchip: mc(r.mcSuffix),
      kennelCode: r.kennel,
      arrivalDate,
      releaseDate: releasedOn,
      stayStatus: "released",
      releasedAt: `${releasedOn}T10:30:00`,
      releaseNote: "Stay completed — released to owner",
      monitoringFlag: false,
      monitoringNote: null,
      monitoringAssigneeId: null,
      monitoringAction: null,
      monitoringDueAt: null,
      createdAt: `${arrivalDate}T13:50:00`,
      createdBy: OFFICER,
    })
    log(`${releasedOn}T10:30:00`, OFFICER, "Animal released", "Animal", r.id, `${r.kennel} · ${r.name}`, {
      animalId: r.id,
      before: { status: "Active monitoring" },
      after: { status: "Released" },
    })
  })

  const bella = animals.find((a) => a.id === "a-bella")
  if (bella) {
    bella.monitoringFlag = true
    bella.monitoringNote = "AM inspection overdue; no open case"
    bella.monitoringAssigneeId = KLEE
    bella.monitoringAction = "Complete AM inspection"
    bella.monitoringDueAt = T(0, "08:00")
  }

  // ---------------------------------------------------------------------
  // Inspections — last 3 days for every examined animal + today's AM board
  // ---------------------------------------------------------------------
  const inspections: Inspection[] = []
  const animalById = new Map(animals.map((a) => [a.id, a]))
  const tplFor = (speciesId: string) =>
    speciesId === "cat" ? { id: "tpl-cat", v: 2 } : speciesId === "dog" ? { id: "tpl-dog", v: 3 } : { id: "tpl-general", v: 1 }
  const inspectorFor = (kennel: string) => (kennel.startsWith("KC3") ? SONG : KLEE)
  const addInspection = (
    animalId: string,
    day: number,
    session: "AM" | "PM",
    hm: string,
    results: InspectionResult[],
    byUserId?: string,
    otherFindings = ""
  ) => {
    const a = animalById.get(animalId) as Animal
    const tpl = tplFor(a.speciesId)
    const insp: Inspection = {
      id: `in-${animalId}-${D(day)}-${session}`,
      animalId,
      kennelCode: a.kennelCode,
      date: D(day),
      session,
      at: T(day, hm),
      byUserId: byUserId ?? inspectorFor(a.kennelCode),
      templateId: tpl.id,
      templateVersion: tpl.v,
      results,
      otherFindings,
      abnormalCount: results.filter((r) => r.abnormal).length + (otherFindings ? 1 : 0),
      editedAt: null,
    }
    inspections.push(insp)
    log(insp.at, insp.byUserId, "Inspection created", "Inspection", insp.id, `${a.kennelCode} · ${session}`, {
      animalId,
      after: { session, abnormal: insp.abnormalCount },
    })
    return insp
  }

  const yyOverrides: Record<string, Record<string, { value: string; note?: string }>> = {
    "-3:AM": { Stool: { value: "Soft" }, Food: { value: "Half" } },
    "-3:PM": { Stool: { value: "Soft" } },
    "-2:AM": { Stool: { value: "Soft" } },
    "-1:AM": { Food: { value: "Half" }, Stool: { value: "Soft" } },
    "-1:PM": { Food: { value: "Half" }, Stool: { value: "Soft", note: "soft, formed" } },
  }
  ANIMALS.filter((a) => a.exam).forEach((a, i) => {
    for (let day = -3; day <= -1; day++) {
      if (D(day) <= D(-(a.day - 1))) continue // nothing before/at arrival day
      const am = `08:${String(2 + ((i * 4) % 50)).padStart(2, "0")}`
      const pm = `15:${String(5 + ((i * 3) % 50)).padStart(2, "0")}`
      const ov = a.id === "a-yangyang" ? yyOverrides : {}
      addInspection(a.id, day, "AM", a.id === "a-yangyang" && day === -1 ? "08:05" : am, dailyResults(ov[`${day}:AM`]))
      addInspection(a.id, day, "PM", a.id === "a-yangyang" && day === -1 ? "15:40" : pm, dailyResults(ov[`${day}:PM`]))
    }
  })

  // Today's AM session board (Inspections p.6)
  const todayAM: [string, string, Record<string, { value: string; note?: string }>?][] = [
    ["a-rex", "08:02"],
    ["a-oreo", "08:09", { Food: { value: "Little", note: "" } }],
    ["a-biscuit", "08:14"],
    ["a-milo", "08:20", { Ears: { value: "Abnormal", note: "left ear red, scratching" } }],
    ["a-pepper", "08:26"],
    ["a-mochi", "08:31"],
    ["a-yangyang", "08:15", { Stool: { value: "Soft" } }],
    ["a-coco", "08:40"],
    ["a-luna", "08:38"],
    ["a-teddy", "08:12"],
    ["a-simba", "08:18"],
    ["a-nala", "08:24"],
  ]
  const todayInspections = todayAM.map(([id, hm, ov]) => addInspection(id, 0, "AM", hm, dailyResults(ov)))

  // ---------------------------------------------------------------------
  // Observations, AI results & cases
  // ---------------------------------------------------------------------
  const observations: Observation[] = []
  const ai = (partial: Partial<AiResult>): AiResult => ({
    promptVersion: "v1.3",
    model: "gpt-4o (Azure OpenAI)",
    latencySec: 9,
    candidates: [],
    matchedAnimalId: null,
    confidence: 0,
    signs: [],
    onset: null,
    suggestedAction: null,
    suggestedCaseId: null,
    rationale: "",
    reviewReason: null,
    createdAt: "",
    ...partial,
  })
  const media = (id: string, kind: "photo" | "video", caption: string, at: string, byUserId: string) => ({
    id,
    kind,
    caption,
    at,
    byUserId,
  })
  const obs = (o: Partial<Observation> & Pick<Observation, "id" | "text" | "createdAt" | "createdBy">): Observation => ({
    reportedAnimalId: null,
    animalId: null,
    source: "mobile",
    media: [],
    aiStatus: "routed",
    ai: null,
    routedAction: null,
    caseId: null,
    triagedBy: null,
    triagedAt: null,
    triageNote: null,
    skippedCount: 0,
    ...o,
  })

  const routed = (
    o: Observation,
    confirmBy: string,
    confirmAt: string,
    action: Observation["routedAction"],
    caseId: string | null,
    signsList: { code: string; label: string }[],
    confidence = 0.96
  ) => {
    o.aiStatus = "routed"
    o.routedAction = action
    o.caseId = caseId
    o.triagedBy = confirmBy
    o.triagedAt = confirmAt
    o.ai = ai({
      candidates: o.animalId ? [{ animalId: o.animalId, confidence }] : [],
      matchedAnimalId: o.animalId,
      confidence,
      signs: signsList,
      suggestedAction: action,
      suggestedCaseId: caseId,
      rationale: "Matched by kennel code and name; signs consistent with the open case.",
      createdAt: o.createdAt.replace(/:(\d\d)$/, ":40"),
    })
    const a = o.animalId ? animalById.get(o.animalId) : undefined
    log(o.createdAt, o.createdBy, "Observation created", "Observation", o.id, `Observation ${o.id}`, {
      animalId: o.animalId,
      after: { text: o.text, media: o.media.length },
    })
    log(o.ai.createdAt, null, "AI routing result", "Observation", o.id, `Observation ${o.id}`, {
      animalId: o.animalId,
      after: { animal: a ? `${a.kennelCode} · ${a.name}` : null, aiDecision: action, aiConfidence: confidence },
    })
    log(
      confirmAt,
      confirmBy,
      "AI decision confirmed",
      "Case",
      caseId ?? o.id,
      caseId
        ? `${caseId} · ${action === "new_case" ? "new case" : action === "reopen_case" ? "reopen case" : "update case"}`
        : `${o.id} · timeline only`,
      {
        animalId: o.animalId,
        caseId,
        source: "Mobile app · iOS",
        before: caseId ? { status: "Open", aiDecision: null } : null,
        after: { aiDecision: action, aiConfidence: confidence },
      }
    )
  }

  const GI_SOFT = { code: "GI-001", label: "Soft stool" }
  const GI_APP = { code: "GI-004", label: "Reduced appetite" }

  // Yang Yang — GI upset case C-0142
  const o3330 = obs({
    id: "O-3330",
    text: "Soft stool and left some breakfast",
    createdAt: T(-7, "09:30"),
    createdBy: OFFICER,
    reportedAnimalId: "a-yangyang",
    animalId: "a-yangyang",
  })
  routed(o3330, OFFICER, T(-7, "09:31"), "new_case", "C-0142", [GI_SOFT, GI_APP])
  const o3352 = obs({
    id: "O-3352",
    text: "Loose stool in run, photo attached",
    createdAt: T(-5, "15:45"),
    createdBy: KLEE,
    animalId: "a-yangyang",
    media: [media("m-3352-1", "photo", "Loose stool in run", T(-5, "15:45"), KLEE)],
  })
  routed(o3352, OFFICER, T(-5, "15:52"), "update_case", "C-0142", [{ code: "GI-002", label: "Diarrhoea" }])
  const o3381 = obs({
    id: "O-3381",
    text: "Soft stool again, ate about half of lunch. Still bright and responsive.",
    createdAt: T(-1, "16:20"),
    createdBy: OFFICER,
    animalId: "a-yangyang",
    media: [
      media("m-3381-1", "photo", "Soft stool", T(-1, "16:20"), OFFICER),
      media("m-3381-2", "video", "Stool consistency video", T(-1, "16:20"), OFFICER),
    ],
  })
  routed(o3381, OFFICER, T(-1, "16:21"), "update_case", "C-0142", [GI_SOFT, GI_APP])

  // Oreo — vomiting C-0143 (needs review, unassigned)
  const o3395 = obs({
    id: "O-3395",
    text: "Vomited once after PM feed, otherwise eating.",
    createdAt: T(-1, "19:10"),
    createdBy: KLEE,
    animalId: "a-oreo",
  })
  routed(o3395, "u-ng-d", T(0, "05:40"), "new_case", "C-0143", [{ code: "GI-003", label: "Vomiting" }], 0.91)

  // Milo — skin lesion left ear C-0128 (closed then reopened today)
  const o3270 = obs({
    id: "O-3270",
    text: "Small skin lesion on left ear flap, scratching.",
    createdAt: T(-12, "10:05"),
    createdBy: KLEE,
    animalId: "a-milo",
    media: [media("m-3270-1", "photo", "Lesion left ear", T(-12, "10:05"), KLEE)],
  })
  routed(o3270, OFFICER, T(-12, "10:10"), "new_case", "C-0128", [
    { code: "DE-004", label: "Skin lesion" },
    { code: "OT-001", label: "Pruritus · ear" },
  ])
  const o3400 = obs({
    id: "O-3400",
    text: "Milo scratching left ear again, lesion looks red.",
    createdAt: T(0, "08:05"),
    createdBy: KLEE,
    animalId: "a-milo",
    media: [media("m-3400-1", "photo", "Left ear redness", T(0, "08:05"), KLEE)],
  })
  routed(o3400, OFFICER, T(0, "08:07"), "reopen_case", "C-0128", [
    { code: "DE-004", label: "Skin lesion" },
    { code: "OT-003", label: "Erythema · ear" },
  ])

  // Nala — mild cough C-0139
  const o3399 = obs({
    id: "O-3399",
    text: "Mild cough and clear nasal discharge for 2 days",
    createdAt: T(0, "06:35"),
    createdBy: SONG,
    animalId: "a-nala",
  })
  routed(o3399, OFFICER, T(0, "06:40"), "new_case", "C-0139", [
    { code: "RE-001", label: "Cough" },
    { code: "RE-002", label: "Nasal discharge" },
  ])

  // Teddy — limping C-0135
  const o3375 = obs({
    id: "O-3375",
    text: "Limping right hind leg after walk-out",
    createdAt: T(-1, "14:05"),
    createdBy: SONG,
    animalId: "a-teddy",
  })
  routed(o3375, OFFICER, T(-1, "14:10"), "new_case", "C-0135", [{ code: "MS-001", label: "Lameness" }])

  // Max — eye discharge C-0120 (closed)
  const o3310 = obs({
    id: "O-3310",
    text: "Eye discharge both eyes, crusty in the morning",
    createdAt: T(-9, "08:30"),
    createdBy: KLEE,
    animalId: "a-max",
    media: [media("m-3310-1", "photo", "Eye discharge", T(-9, "08:30"), KLEE)],
  })
  routed(o3310, VET, T(-9, "08:40"), "new_case", "C-0120", [{ code: "OC-001", label: "Ocular discharge" }])

  // Today's abnormal AM inspections routed to their cases / timeline
  const oreoInsp = todayInspections.find((x) => x.animalId === "a-oreo") as Inspection
  const o3401 = obs({
    id: "O-3401",
    text: "AM inspection: Food Little",
    createdAt: oreoInsp.at,
    createdBy: oreoInsp.byUserId,
    animalId: "a-oreo",
    source: "mobile",
  })
  routed(o3401, OFFICER, T(0, "08:20"), "update_case", "C-0143", [GI_APP])

  observations.push(o3330, o3352, o3381, o3395, o3270, o3400, o3399, o3375, o3310, o3401)

  // Review queue (p.5): no match, low confidence, AI unavailable
  observations.push(
    obs({
      id: "O-3402",
      text: "Small brown dog in KC2 corner run scratching right ear a lot, some redness.",
      createdAt: T(0, "08:10"),
      createdBy: KLEE,
      aiStatus: "needs_review",
      media: [media("m-3402-1", "photo", "Right ear", T(0, "08:10"), KLEE), media("m-3402-2", "photo", "Corner run", T(0, "08:10"), KLEE)],
      ai: ai({
        latencySec: 11,
        candidates: [
          { animalId: "a-coco", confidence: 0.48 },
          { animalId: "a-max", confidence: 0.31 },
        ],
        confidence: 0.48,
        signs: [
          { code: "OT-001", label: "Pruritus · ear (right)" },
          { code: "OT-003", label: "Erythema · ear" },
        ],
        onset: D(0),
        suggestedAction: "new_case",
        rationale: "No kennel code or name found. Candidates in KC2 matching “small brown dog”:",
        reviewReason: "no_match",
        createdAt: T(0, "08:10:11"),
      }),
    }),
    obs({
      id: "O-3398",
      text: "Luna not keen on breakfast, left most of it.",
      createdAt: T(0, "07:47"),
      createdBy: SONG,
      aiStatus: "needs_review",
      ai: ai({
        latencySec: 8,
        candidates: [{ animalId: "a-luna", confidence: 0.62 }],
        matchedAnimalId: "a-luna",
        confidence: 0.62,
        signs: [GI_APP],
        onset: D(0),
        suggestedAction: "timeline",
        rationale: "Name matched “Luna” but the reporter's kennel scope (KC3) does not include KC2-5.",
        reviewReason: "low_confidence",
        createdAt: T(0, "07:47:08"),
      }),
    }),
    obs({
      id: "O-3390",
      text: "KC1-4 vomited once after PM feed, photo attached.",
      createdAt: T(-1, "17:30"),
      createdBy: KLEE,
      aiStatus: "needs_review",
      media: [media("m-3390-1", "photo", "Vomit in kennel", T(-1, "17:30"), KLEE)],
      ai: ai({
        latencySec: 30,
        rationale: "AI service timed out after 30 s — observation saved for manual routing.",
        reviewReason: "unavailable",
        createdAt: T(-1, "17:30:30"),
      }),
    })
  )
  for (const o of observations.filter((x) => x.aiStatus === "needs_review")) {
    log(o.createdAt, o.createdBy, "Observation created", "Observation", o.id, `Observation ${o.id}`, {
      after: { text: o.text, media: o.media.length },
    })
    log(o.ai?.createdAt ?? o.createdAt, null, "AI routing result", "Observation", o.id, `Observation ${o.id}`, {
      after: { aiDecision: "review_queue", reason: o.ai?.reviewReason, aiConfidence: o.ai?.confidence ?? null },
    })
  }

  const yyInsp18 = inspections.find((x) => x.animalId === "a-yangyang" && x.date === D(-3) && x.session === "AM")

  const kase = (
    c: Partial<HealthCase> & Pick<HealthCase, "id" | "animalId" | "title" | "status" | "openedAt" | "openedBy">
  ): HealthCase => ({
    signCodes: [],
    assigneeId: null,
    observationIds: [],
    inspectionIds: [],
    followUps: [],
    notes: [],
    evidence: [],
    aiSummary: null,
    closedAt: null,
    closedBy: null,
    closeReason: null,
    closeNote: null,
    reopenedAt: null,
    updatedAt: c.openedAt,
    ...c,
  })

  const cases: HealthCase[] = [
    kase({
      id: "C-0142",
      animalId: "a-yangyang",
      title: "GI upset — soft stool, reduced appetite",
      status: "needs_review",
      signCodes: ["GI-001", "GI-002", "GI-004"],
      openedAt: T(-7, "09:31"),
      openedBy: OFFICER,
      assigneeId: VET,
      observationIds: ["O-3330", "O-3352", "O-3381"],
      inspectionIds: yyInsp18 ? [yyInsp18.id] : [],
      followUps: [
        {
          id: "fu-1",
          action: "Recheck stool at PM inspection",
          dueAt: T(0, "16:00"),
          assigneeId: VET,
          done: false,
          doneAt: null,
          createdAt: T(-1, "16:30"),
          createdBy: OFFICER,
        },
        {
          id: "fu-2",
          action: "Start probiotic 5 mL 2× daily",
          dueAt: T(-5, "18:00"),
          assigneeId: OFFICER,
          done: true,
          doneAt: T(-5, "17:10"),
          createdAt: T(-5, "16:00"),
          createdBy: VET,
        },
      ],
      notes: [
        {
          id: "n-1",
          text: "Bland diet started. Monitor stool consistency for 3 more days before review.",
          at: T(-3, "10:05"),
          byUserId: VET,
        },
      ],
      evidence: [...o3352.media, ...o3381.media, media("m-c142-1", "photo", "Stool sample", T(-3, "08:10"), KLEE)],
      updatedAt: T(-1, "16:21"),
    }),
    kase({
      id: "C-0128",
      animalId: "a-milo",
      title: "Skin lesion, left ear (reopened)",
      status: "open",
      signCodes: ["DE-004", "OT-001", "OT-003"],
      openedAt: T(-12, "10:10"),
      openedBy: OFFICER,
      assigneeId: VET,
      observationIds: ["O-3270", "O-3400"],
      followUps: [
        {
          id: "fu-3",
          action: "Vet review",
          dueAt: T(0, "17:00"),
          assigneeId: VET,
          done: false,
          doneAt: null,
          createdAt: T(0, "08:07"),
          createdBy: OFFICER,
        },
      ],
      notes: [{ id: "n-2", text: "Closed after lesion healed; reopened — scratching recurred.", at: T(0, "08:08"), byUserId: OFFICER }],
      evidence: [...o3270.media, ...o3400.media],
      reopenedAt: T(0, "08:07"),
      updatedAt: T(0, "08:07"),
    }),
    kase({
      id: "C-0139",
      animalId: "a-nala",
      title: "Mild cough, clear nasal discharge",
      status: "open",
      signCodes: ["RE-001", "RE-002"],
      openedAt: T(0, "06:40"),
      openedBy: OFFICER,
      assigneeId: OFFICER,
      observationIds: ["O-3399"],
      followUps: [
        {
          id: "fu-4",
          action: "Monitor resp. rate PM",
          dueAt: T(0, "16:00"),
          assigneeId: OFFICER,
          done: false,
          doneAt: null,
          createdAt: T(0, "06:41"),
          createdBy: OFFICER,
        },
      ],
      updatedAt: T(0, "06:40"),
    }),
    kase({
      id: "C-0143",
      animalId: "a-oreo",
      title: "Vomiting after PM feed",
      status: "needs_review",
      signCodes: ["GI-003", "GI-004"],
      openedAt: T(0, "05:40"),
      openedBy: "u-ng-d",
      assigneeId: null,
      observationIds: ["O-3395", "O-3401"],
      updatedAt: T(0, "08:20"),
    }),
    kase({
      id: "C-0135",
      animalId: "a-teddy",
      title: "Limping, right hind leg",
      status: "open",
      signCodes: ["MS-001"],
      openedAt: T(-1, "14:10"),
      openedBy: OFFICER,
      assigneeId: OFFICER,
      observationIds: ["O-3375"],
      followUps: [
        {
          id: "fu-5",
          action: "Recheck right hind leg",
          dueAt: T(-1, "17:00"),
          assigneeId: OFFICER,
          done: false,
          doneAt: null,
          createdAt: T(-1, "14:12"),
          createdBy: OFFICER,
        },
      ],
      notes: [{ id: "n-3", text: "Weight bearing, mild lameness. Rest from walk-outs; improving.", at: T(-1, "15:00"), byUserId: VET }],
      updatedAt: T(-1, "15:00"),
    }),
    kase({
      id: "C-0120",
      animalId: "a-max",
      title: "Eye discharge — resolved",
      status: "closed",
      signCodes: ["OC-001"],
      openedAt: T(-9, "08:40"),
      openedBy: VET,
      assigneeId: VET,
      observationIds: ["O-3310"],
      evidence: [...o3310.media],
      closedAt: T(-3, "11:00"),
      closedBy: VET,
      closeReason: "resolved",
      closeNote: "Eyes clear for 3 consecutive inspections.",
      updatedAt: T(-3, "11:00"),
    }),
  ]
  // Milo's case was closed before being reopened today.
  log(T(-6, "11:20"), VET, "Case closed", "Case", "C-0128", "C-0128", {
    animalId: "a-milo",
    caseId: "C-0128",
    before: { status: "Open" },
    after: { status: "Closed", reason: "Resolved — signs cleared" },
  })
  log(T(0, "08:07"), OFFICER, "Case reopened", "Case", "C-0128", "C-0128", {
    animalId: "a-milo",
    caseId: "C-0128",
    before: { status: "Closed" },
    after: { status: "Open" },
  })
  log(T(-3, "11:00"), VET, "Case closed", "Case", "C-0120", "C-0120", {
    animalId: "a-max",
    caseId: "C-0120",
    before: { status: "Open" },
    after: { status: "Closed", reason: "Resolved — signs cleared" },
  })
  for (const c of cases) {
    if (c.assigneeId) {
      log(c.openedAt.replace(/:00$/, ":30"), c.openedBy === c.assigneeId ? OFFICER : c.openedBy, "Case assigned", "Case", c.id, c.id, {
        animalId: c.animalId,
        caseId: c.id,
        before: { assignee: null },
        after: { assignee: userById.get(c.assigneeId)?.name },
      })
    }
    for (const n of c.notes) {
      log(n.at, n.byUserId, "Case note added", "Case", c.id, c.id, { animalId: c.animalId, caseId: c.id, after: { note: n.text } })
    }
  }
  log(T(-1, "11:30:09"), VET, "Case assigned", "Case", "C-0142", "C-0142", {
    animalId: "a-yangyang",
    caseId: "C-0142",
    before: { assignee: "J. Tan" },
    after: { assignee: "Dr Lim W." },
  })

  // ---------------------------------------------------------------------
  // Medication schedules & administrations (p.7)
  // ---------------------------------------------------------------------
  const sched = (s: Omit<MedicationSchedule, "createdAt" | "createdBy" | "stoppedAt"> & { createdBy?: string }): MedicationSchedule => ({
    createdAt: `${s.startDate}T09:00:00`,
    stoppedAt: null,
    ...s,
    createdBy: s.createdBy ?? VET,
  })
  const schedules: MedicationSchedule[] = [
    sched({
      id: "ms-01",
      animalId: "a-yangyang",
      item: "Ear drops",
      dose: "2 drops",
      route: "Ear",
      site: "left ear",
      frequency: "1x",
      doseTimes: ["07:00"],
      startDate: D(-5),
      endDate: D(4),
      caseId: null,
    }),
    sched({
      id: "ms-02",
      animalId: "a-milo",
      item: "Chlorhexidine wipe",
      dose: "1 wipe",
      route: "Topical",
      site: "left ear",
      frequency: "2x",
      doseTimes: ["12:00", "20:00"],
      startDate: D(0),
      endDate: D(7),
      caseId: "C-0128",
    }),
    sched({
      id: "ms-03",
      animalId: "a-oreo",
      item: "Maropitant",
      dose: "1 mg/kg",
      route: "Oral",
      site: "",
      frequency: "1x",
      doseTimes: ["14:00"],
      startDate: D(0),
      endDate: D(2),
      caseId: "C-0143",
    }),
    sched({
      id: "ms-04",
      animalId: "a-yangyang",
      item: "Probiotic",
      dose: "5 mL",
      route: "Oral",
      site: "",
      frequency: "2x",
      doseTimes: ["08:00", "20:00"],
      startDate: D(-5),
      endDate: D(9),
      caseId: "C-0142",
    }),
    sched({
      id: "ms-05",
      animalId: "a-yangyang",
      item: "Omega-3",
      dose: "1 capsule",
      route: "Oral",
      site: "",
      frequency: "1x",
      doseTimes: ["08:00"],
      startDate: D(-11),
      endDate: D(18),
      caseId: null,
    }),
    sched({
      id: "ms-06",
      animalId: "a-nala",
      item: "Probiotic",
      dose: "5 mL",
      route: "Oral",
      site: "",
      frequency: "2x",
      doseTimes: ["08:00", "20:00"],
      startDate: D(-2),
      endDate: D(5),
      caseId: null,
    }),
    sched({
      id: "ms-07",
      animalId: "a-teddy",
      item: "Meloxicam",
      dose: "0.1 mg/kg",
      route: "Oral",
      site: "",
      frequency: "1x",
      doseTimes: ["18:00"],
      startDate: D(-1),
      endDate: D(4),
      caseId: "C-0135",
    }),
    sched({
      id: "ms-08",
      animalId: "a-bella",
      item: "Lactulose",
      dose: "1 mL",
      route: "Oral",
      site: "",
      frequency: "2x",
      doseTimes: ["09:00", "21:00"],
      startDate: D(-6),
      endDate: D(6),
      caseId: null,
    }),
    sched({
      id: "ms-09",
      animalId: "a-mochi",
      item: "Lysine paste",
      dose: "2 mL",
      route: "Oral",
      site: "",
      frequency: "1x",
      doseTimes: ["10:00"],
      startDate: D(-20),
      endDate: D(3),
      caseId: null,
    }),
    sched({
      id: "ms-10",
      animalId: "a-max",
      item: "Chloramphenicol eye drops",
      dose: "1 drop",
      route: "Eye",
      site: "both eyes",
      frequency: "3x",
      doseTimes: ["08:00", "14:00", "20:00"],
      startDate: D(-9),
      endDate: D(-3),
      caseId: "C-0120",
    }),
    sched({
      id: "ms-11",
      animalId: "a-milo",
      item: "Ear cleaner",
      dose: "1 mL",
      route: "Ear",
      site: "left ear",
      frequency: "1x",
      doseTimes: ["09:00"],
      startDate: D(-11),
      endDate: D(-6),
      caseId: "C-0128",
    }),
    sched({
      id: "ms-12",
      animalId: "a-oreo",
      item: "Milbemycin (deworming)",
      dose: "1 tablet",
      route: "Oral",
      site: "",
      frequency: "1x",
      doseTimes: ["09:00"],
      startDate: D(-6),
      endDate: D(-6),
      caseId: null,
    }),
    sched({
      id: "ms-13",
      animalId: "a-coco",
      item: "Fluralaner (flea/tick)",
      dose: "1 chew",
      route: "Oral",
      site: "",
      frequency: "1x",
      doseTimes: ["09:00"],
      startDate: D(-14),
      endDate: D(-14),
      caseId: null,
    }),
    sched({
      id: "ms-14",
      animalId: "a-lucky",
      item: "Probiotic",
      dose: "5 mL",
      route: "Oral",
      site: "",
      frequency: "2x",
      doseTimes: ["08:00", "20:00"],
      startDate: D(-3),
      endDate: D(-1),
      caseId: null,
    }),
  ]
  const administrations: MedicationAdministration[] = []
  const giver = (animalId: string) => ((animalById.get(animalId)?.kennelCode ?? "").startsWith("KC3") ? SONG : KLEE)
  for (const s of schedules) {
    log(
      s.createdAt,
      s.createdBy,
      "Medication schedule created",
      "MedicationSchedule",
      s.id,
      `${animalById.get(s.animalId)?.kennelCode} · ${s.item}`,
      {
        animalId: s.animalId,
        caseId: s.caseId,
        after: { item: s.item, dose: s.dose, frequency: s.frequency, start: s.startDate, end: s.endDate },
      }
    )
    for (let day = Math.max(-5, -60); day <= -1; day++) {
      const date = D(day)
      if (date < s.startDate || date > s.endDate) continue
      for (const time of s.doseTimes) {
        const [h, m] = time.split(":").map(Number)
        const at = `${date}T${String(h).padStart(2, "0")}:${String(Math.min(59, m + 4)).padStart(2, "0")}:00`
        const adm: MedicationAdministration = {
          id: `ma-${s.id}-${date}-${time}`,
          scheduleId: s.id,
          animalId: s.animalId,
          date,
          doseTime: time,
          at,
          byUserId: giver(s.animalId),
          remarks: "",
        }
        administrations.push(adm)
      }
    }
  }
  const todayAdm: [string, string, string, string][] = [
    ["ms-04", "08:00", "07:52", OFFICER],
    ["ms-05", "08:00", "08:05", KLEE],
    ["ms-06", "08:00", "07:58", SONG],
  ]
  for (const [sid, time, hm, by] of todayAdm) {
    const s = schedules.find((x) => x.id === sid) as MedicationSchedule
    administrations.push({
      id: `ma-${sid}-${D(0)}-${time}`,
      scheduleId: sid,
      animalId: s.animalId,
      date: D(0),
      doseTime: time,
      at: T(0, hm),
      byUserId: by,
      remarks: by === OFFICER ? "Dose 1 of 2" : "",
    })
  }
  // Audit only the most recent administrations to keep the log readable.
  for (const adm of administrations.filter((a) => a.date >= D(-1))) {
    const s = schedules.find((x) => x.id === adm.scheduleId) as MedicationSchedule
    log(
      adm.at,
      adm.byUserId,
      "Medication administered",
      "MedicationAdministration",
      adm.id,
      `${animalById.get(adm.animalId)?.kennelCode} · ${s.item}`,
      {
        animalId: adm.animalId,
        after: { item: s.item, dose: s.dose, doseTime: adm.doseTime },
      }
    )
  }

  // ---------------------------------------------------------------------
  // Logins, admin changes & exports (Audit log p.8)
  // ---------------------------------------------------------------------
  for (const u of users) {
    if (u.lastLoginAt) {
      log(u.lastLoginAt, u.id, "Login", "Session", u.id, `Session · ${u.idp === "officer" ? "Officer IdP" : "Contractor IdP"}`, {
        source: u.idp === "contractor" ? "Mobile app · Android" : "Web workbench",
        after: { idp: u.idp === "officer" ? "Officer IdP" : "Contractor IdP" },
      })
    }
  }
  log(T(-1, "17:02:18"), "u-wong-s", "Role assigned", "User", "u-lee-k", "User K. Lee · scope KC1–KC3", {
    before: { role: "Contractor", kennelScope: ["KC1", "KC2"] },
    after: { role: "Contractor", kennelScope: ["KC1", "KC2", "KC3"] },
  })
  log(T(-19, "17:00"), "u-wong-s", "User disabled", "User", "u-pillai-a", "User A. Pillai", {
    before: { status: "Active" },
    after: { status: "Disabled" },
  })
  log(T(-26, "16:00"), "u-wong-s", "User disabled", "User", "u-soh-e", "User E. Soh", {
    before: { status: "Active" },
    after: { status: "Disabled" },
  })
  log(T(-1, "09:12:44"), "u-lim-r", "Audit export", "AuditLog", "export", "CSV · 214 rows", { after: { format: "CSV", rows: 214 } })
  log(T(0, "08:32"), "u-wong-s", "Checklist template edited", "ChecklistTemplate", "tpl-dog", "Dog · daily v4 draft", {
    before: { stool: ["Firm", "Soft", "Loose", "None"] },
    after: { stool: ["Firm", "Soft", "Loose", "Watery", "None"] },
  })
  log(T(0, "08:10"), "u-wong-s", "Glossary term updated", "GlossaryTerm", "g-01", "corner run", {
    before: { example: null },
    after: { example: "dog in KC2 corner run scratching" },
  })

  // ---------------------------------------------------------------------
  // In-app notifications
  // ---------------------------------------------------------------------
  const notifications: AppNotification[] = [
    {
      id: "nt-1",
      userId: OFFICER,
      title: "Follow-up overdue · KC3-2 Teddy",
      body: "“Recheck right hind leg” was due yesterday 17:00. Tap to open case C-0135.",
      at: T(0, "07:00"),
      read: false,
      href: "/cases?id=C-0135",
    },
    {
      id: "nt-2",
      userId: OFFICER,
      title: "Observation needs review",
      body: "Small brown dog in KC2 corner run scratching right ear…",
      at: T(0, "08:10:11"),
      read: false,
      href: "/review?id=O-3402",
    },
    {
      id: "nt-3",
      userId: OFFICER,
      title: "Case reopened · KC1-4 Milo",
      body: "C-0128 reopened — scratching recurred.",
      at: T(0, "08:07"),
      read: true,
      href: "/cases?id=C-0128",
    },
    {
      id: "nt-4",
      userId: VET,
      title: "Case assigned to you · KC2-2 Yang Yang",
      body: "Recheck stool at PM inspection, due 16:00. Tap to open case C-0142.",
      at: T(-1, "16:30"),
      read: false,
      href: "/cases?id=C-0142",
    },
    {
      id: "nt-5",
      userId: "u-koh-m",
      title: "Follow-up overdue · KC3-2 Teddy",
      body: "Escalated: “Recheck right hind leg” was due yesterday 17:00.",
      at: T(-1, "19:00"),
      read: false,
      href: "/cases?id=C-0135",
    },
  ]

  // ---------------------------------------------------------------------
  // Audit chain (chronological, append-only)
  // ---------------------------------------------------------------------
  audit.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  const chained: AuditEvent[] = []
  let n = 19000
  for (const input of audit) {
    n += 1
    chained.push(chainEvent(input, chained[chained.length - 1], n))
  }

  return {
    version: APP_CONFIG.storageVersion,
    revision: 1,
    users,
    kennelBlocks: blocks,
    kennels,
    species,
    templates,
    bodySystems: BODY_SYSTEMS,
    signs,
    glossary: seedGlossary(T),
    notificationRules: seedNotificationRules(),
    animals,
    arrivalExams: exams,
    inspections,
    observations,
    cases,
    medicationSchedules: schedules,
    medicationAdministrations: administrations,
    notifications,
    audit: chained,
    settings: { aiConfidenceThreshold: 0.8, promptVersion: "v1.3", taxonomyVersion: "v1.2", sessionIdleMinutes: 15 },
    counters: { observation: 3402, case: 143, event: n, id: 1000 },
  }
}
