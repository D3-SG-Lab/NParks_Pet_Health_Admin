/**
 * Health cases and the review queue on the real API.
 *
 * The NParksPetHealth API has no case, review-queue or triage endpoint, so both
 * are derived from data it does serve, per animal in quarantine:
 *   GET /animals?status=active-monitoring
 *   GET /animals/{id}/inspections        (all dates)
 *   GET /animals/{id}/observations
 *
 * - A **case** is one animal with abnormal inspection findings or staff
 *   observations in the last {@link WINDOW_DAYS} days. Its id is `STAY-<stayId>`.
 *   It is "Needs review" while it has observations without an AI routing (the API
 *   never returns one), otherwise "Open". Closed cases don't exist.
 * - The **review queue** is every observation from the last {@link WINDOW_DAYS}
 *   days (none has an AI match or routing). Observations without an animal can't
 *   be listed: there is no list endpoint for them.
 *
 * Everything is read-only: assigning, follow-ups, notes, closing and triage have
 * no endpoint.
 */
import { addDays, nowISO, stayProgress, todayISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import { fmtShortDateTime } from "@/lib/format"
import type { AiSummary, Animal, HealthCase, Inspection, Observation } from "@/types/domain"

import { animalsApi, inspectionsApi, observationsApi } from "../api/api-client"
import type { AnimalStayDto } from "../api/types"
import type { CaseDetail, CaseFilter, CaseListItem, LinkedEvent } from "../cases"
import type { QueueItem, QueueSort } from "../observations"
import { STAYING_STATUS, staffLabel, toAnimal, toInspection } from "./mappers"
import { toObservation } from "./observations"

/** "Staff #3" for the app's "staff-3" user refs (the API has no staff names). */
const staffName = (ref: string) => staffLabel(Number(ref.replace("staff-", "")) || null)

/** How far back abnormal findings and observations count towards a case / the queue. */
export const WINDOW_DAYS = 14

export interface AnimalHealth {
  stay: AnimalStayDto
  animal: Animal
  /** All inspections, newest first; null when they couldn't be loaded. */
  inspections: Inspection[] | null
  /** All observations, newest first; null when they couldn't be loaded. */
  observations: Observation[] | null
}

export interface LiveHealth {
  animals: AnimalHealth[]
  notices: string[]
}

const CACHE_MS = 5_000
let cache: { at: number; promise: Promise<LiveHealth> } | null = null

/**
 * Loads every active-monitoring animal with its inspections and observations.
 * Shared by the dashboard, cases, review queue and nav badges, so the result is
 * reused for a few seconds instead of refetching for each screen part.
 */
export function loadLiveHealth(): Promise<LiveHealth> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.promise
  const promise = fetchLiveHealth()
  cache = { at: Date.now(), promise }
  promise.catch(() => {
    if (cache?.promise === promise) cache = null
  })
  return promise
}

/** Drops the cached load (after recording an inspection or observation). */
export function invalidateLiveHealth() {
  cache = null
}

async function fetchLiveHealth(): Promise<LiveHealth> {
  const stays = await animalsApi.list({ status: STAYING_STATUS })
  const [insps, obs] = await Promise.all([
    Promise.allSettled(stays.map((s) => inspectionsApi.list(s.id))),
    Promise.allSettled(stays.map((s) => observationsApi.listForStay(s.id))),
  ])
  let inspFailed = 0
  let obsFailed = 0
  const animals = stays.map((stay, i): AnimalHealth => {
    const ir = insps[i]
    const or = obs[i]
    if (ir.status !== "fulfilled") inspFailed++
    if (or.status !== "fulfilled") obsFailed++
    return {
      stay,
      animal: toAnimal(stay),
      inspections:
        ir.status === "fulfilled" ? ir.value.map((d) => toInspection(d, stay.kennelCode)).sort((a, b) => b.at.localeCompare(a.at)) : null,
      observations:
        or.status === "fulfilled"
          ? or.value
              .map((d) => ({ ...toObservation(d), aiStatus: d.status === "ready" ? ("needs_review" as const) : ("processing" as const) }))
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          : null,
    }
  })
  const plural = (n: number) => `${n} animal${n === 1 ? "" : "s"}`
  const notices = [
    inspFailed ? `Inspections couldn’t be loaded for ${plural(inspFailed)}; they are left out.` : "",
    obsFailed ? `Observations couldn’t be loaded for ${plural(obsFailed)}; they are left out.` : "",
  ].filter(Boolean)
  return { animals, notices }
}

// ---------------------------------------------------------------------------
// Derived health cases
// ---------------------------------------------------------------------------

const CASE_PREFIX = "STAY-"
export const caseIdFor = (stayId: string | number) => `${CASE_PREFIX}${stayId}`

/** "Hydration, cardio-respiratory abnormal · food little, stool soft" */
export function findingsText(insp: Inspection): string {
  const abn = insp.results.filter((r) => r.abnormal)
  if (abn.length === 0) return "all normal"
  const systems = abn.filter((r) => r.value === "Abnormal").map((r) => r.label.toLowerCase())
  const intake = abn.filter((r) => r.value !== "Abnormal").map((r) => `${r.label.toLowerCase()} ${r.value.toLowerCase()}`)
  return [systems.length ? `${systems.join(", ")} abnormal` : "", intake.join(", ")].filter(Boolean).join(" · ")
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface DerivedCase {
  item: CaseListItem
  linked: LinkedEvent[]
  summary: AiSummary
  stay: { day: number; total: number }
}

function deriveCase(h: AnimalHealth, since: string): DerivedCase | null {
  const abnormal = (h.inspections ?? []).filter((i) => i.abnormalCount > 0 && i.date >= since)
  const obs = (h.observations ?? []).filter((o) => o.createdAt.slice(0, 10) >= since)
  if (abnormal.length === 0 && obs.length === 0) return null

  const linked: LinkedEvent[] = [
    ...abnormal.map((i): LinkedEvent => ({
      id: `I${i.id}`,
      at: i.at,
      meta: `${i.session} inspection · ${staffName(i.byUserId)}`,
      text: capitalise(findingsText(i)) + (i.otherFindings ? ` — ${i.otherFindings}` : ""),
      kind: "inspection",
      aiRouted: false,
      media: [],
    })),
    ...obs.map((o): LinkedEvent => ({
      id: o.id,
      at: o.createdAt,
      meta: `${staffName(o.createdBy)} · observation`,
      text: o.text,
      kind: "observation",
      aiRouted: false,
      media: o.media,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))
  const oldest = linked.at(-1)!
  const latest = linked[0]
  const latestAbnormal = abnormal[0]
  const status: HealthCase["status"] = obs.length ? "needs_review" : "open"
  const title = latestAbnormal ? capitalise(findingsText(latestAbnormal)) : capitalise(obs[0].text)

  const c: HealthCase = {
    id: caseIdFor(h.stay.id),
    animalId: h.animal.id,
    title,
    status,
    signCodes: [],
    openedAt: oldest.at,
    openedBy: oldest.kind === "inspection" ? (abnormal.at(-1)?.byUserId ?? "") : (obs.at(-1)?.createdBy ?? ""),
    assigneeId: null,
    observationIds: obs.map((o) => o.id),
    inspectionIds: abnormal.map((i) => i.id),
    followUps: [],
    notes: [],
    evidence: obs.flatMap((o) => o.media),
    aiSummary: null,
    closedAt: null,
    closedBy: null,
    closeReason: null,
    closeNote: null,
    reopenedAt: null,
    updatedAt: latest.at,
  }
  const summary: AiSummary = {
    bullets: linked.slice(0, 4).map((l) => ({ text: `${fmtShortDateTime(l.at)} · ${l.text}`, citations: [l.id] })),
    updatedAt: latest.at,
  }
  return {
    item: {
      case: c,
      animal: h.animal,
      speciesName: h.stay.species,
      assigneeName: "",
      observationCount: obs.length + abnormal.length,
      nextAction:
        status === "needs_review"
          ? { label: `Review ${obs.length} observation${obs.length === 1 ? "" : "s"}`, tone: "default", dueAt: null }
          : { label: "Recheck at next inspection", tone: "default", dueAt: null },
      live: true,
    },
    linked,
    summary,
    stay: stayProgress(h.stay.arrivalDate, h.stay.releaseDate ?? ""),
  }
}

function deriveCases(health: LiveHealth): DerivedCase[] {
  const since = addDays(todayISO(), -WINDOW_DAYS)
  return health.animals
    .map((h) => deriveCase(h, since))
    .filter((c): c is DerivedCase => Boolean(c))
    .sort((a, b) => b.item.case.updatedAt.localeCompare(a.item.case.updatedAt))
}

export async function listCases(params: {
  filter?: CaseFilter
  search?: string
}): Promise<{ items: CaseListItem[]; counts: Record<CaseFilter, number>; notices: string[] }> {
  const health = await loadLiveHealth()
  const all = deriveCases(health).map((d) => d.item)
  const sevenAgo = addDays(todayISO(), -7)
  const predicates: Record<CaseFilter, (i: CaseListItem) => boolean> = {
    all: () => true,
    open: () => true,
    needs_review: (i) => i.case.status === "needs_review",
    last_7_days: (i) => i.case.updatedAt.slice(0, 10) >= sevenAgo,
    assigned_to_me: () => false,
    closed: () => false,
  }
  const counts = Object.fromEntries(Object.entries(predicates).map(([k, p]) => [k, all.filter(p).length])) as Record<CaseFilter, number>
  const q = (params.search ?? "").trim().toLowerCase()
  const items = all
    .filter(predicates[params.filter ?? "all"])
    .filter(
      (i) =>
        !q ||
        i.case.id.toLowerCase().includes(q) ||
        i.case.title.toLowerCase().includes(q) ||
        i.animal.name.toLowerCase().includes(q) ||
        i.animal.kennelCode.toLowerCase().includes(q)
    )
  return { items, counts, notices: health.notices }
}

export async function getCase(id: string): Promise<CaseDetail> {
  const m = new RegExp(`^${CASE_PREFIX}(\\d+)$`).exec(id)
  if (!m) throw new ApiError("NOT_FOUND", `Case ${id} was not found.`)
  const health = await loadLiveHealth()
  const h = health.animals.find((a) => a.stay.id === Number(m[1]))
  const d = h ? deriveCase(h, addDays(todayISO(), -WINDOW_DAYS)) : null
  if (!d)
    throw new ApiError(
      "NOT_FOUND",
      `Case ${id} was not found. The animal has no abnormal findings or observations in the last ${WINDOW_DAYS} days.`
    )
  return {
    ...d.item,
    summary: d.summary,
    stay: d.stay,
    linked: d.linked,
    openedByName: staffName(d.item.case.openedBy),
    closedByName: null,
    followUps: [],
    notes: [],
  }
}

// ---------------------------------------------------------------------------
// Derived review queue
// ---------------------------------------------------------------------------

export async function listReviewQueue(sort: QueueSort): Promise<{ items: QueueItem[]; triagedToday: number; notices: string[] }> {
  const health = await loadLiveHealth()
  const since = addDays(todayISO(), -WINDOW_DAYS)
  const nowMs = new Date(nowISO()).getTime()
  const items = health.animals.flatMap((h) =>
    (h.observations ?? [])
      .filter((o) => o.createdAt.slice(0, 10) >= since)
      .map((o): QueueItem => ({
        observation: o,
        reporterName: staffName(o.createdBy),
        reporterRole: "",
        reporterScope: "",
        waitingMinutes: Math.max(0, Math.round((nowMs - new Date(o.createdAt).getTime()) / 60000)),
        candidates: [{ animal: h.animal, speciesName: h.stay.species, confidence: 0, status: "Active" }],
        suggestedAnimal: h.animal,
        live: true,
        caseId: caseIdFor(h.stay.id),
      }))
  )
  items.sort((a, b) =>
    sort === "newest"
      ? b.observation.createdAt.localeCompare(a.observation.createdAt)
      : a.observation.createdAt.localeCompare(b.observation.createdAt)
  )
  return { items, triagedToday: 0, notices: health.notices }
}

/** Counts for the dashboard KPIs and the sidebar badges. */
export async function liveCaseCounts(): Promise<{ openCases: number; casesUpdatedToday: number; needsReview: number }> {
  const health = await loadLiveHealth()
  const cases = deriveCases(health)
  const since = addDays(todayISO(), -WINDOW_DAYS)
  const today = todayISO()
  return {
    openCases: cases.length,
    casesUpdatedToday: cases.filter((c) => c.item.case.updatedAt.startsWith(today)).length,
    needsReview: health.animals.reduce((n, h) => n + (h.observations ?? []).filter((o) => o.createdAt.slice(0, 10) >= since).length, 0),
  }
}
