/**
 * Observations, AI confirmation and the review queue
 * (BE-012, BE-018 case rules engine, BE-019, FE-010, FE-012, FE-017).
 */
import { addDays, nowISO, todayISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import type { Db } from "@/lib/mock/db"
import type { AiResult, Animal, ExtractedSign, HealthCase, MediaRef, Observation, RoutingAction, User } from "@/types/domain"

import { analyzeObservation, caseTitleFromSigns } from "./ai-engine"
import {
  appendAudit,
  canSeeAnimal,
  clone,
  currentUser,
  delay,
  getDb,
  hasPermission,
  nextId,
  notify,
  requirePermission,
  userName,
  vets,
  write,
} from "./core"
import { activeCases, speciesName } from "./derive"

export const ROUTING_LABEL: Record<RoutingAction, string> = {
  timeline: "Timeline only",
  new_case: "New case",
  update_case: "Update open case",
  reopen_case: "Reopen closed case",
}

// ---------------------------------------------------------------------------
// Create observation (+ simulated AI processing)
// ---------------------------------------------------------------------------

export interface NewObservationInput {
  text: string
  animalId: string | null
  media: { kind: "photo" | "video"; caption: string }[]
}

export interface ObservationResult {
  observation: Observation
  /** True when the current user may confirm the AI routing straight away. */
  canConfirm: boolean
}

function formatObsId(n: number) {
  return `O-${n}`
}

export function createObservationRecord(
  db: Db,
  actor: User,
  input: { text: string; animalId: string | null; media: { kind: "photo" | "video"; caption: string }[]; source?: "web" | "mobile" }
): Observation {
  const id = formatObsId(nextId(db, "observation"))
  const at = nowISO()
  const media: MediaRef[] = input.media.map((m, i) => ({
    id: `m-${id}-${i + 1}`,
    kind: m.kind,
    caption: m.caption || (m.kind === "photo" ? "Photo" : "Video"),
    at,
    byUserId: actor.id,
  }))
  const obs: Observation = {
    id,
    text: input.text.trim(),
    reportedAnimalId: input.animalId,
    animalId: null,
    createdAt: at,
    createdBy: actor.id,
    source: input.source ?? "web",
    media,
    aiStatus: "processing",
    ai: null,
    routedAction: null,
    caseId: null,
    triagedBy: null,
    triagedAt: null,
    triageNote: null,
    skippedCount: 0,
  }
  db.observations.push(obs)
  appendAudit(db, actor, {
    action: "Observation created",
    entityType: "Observation",
    entityId: id,
    entityLabel: `Observation ${id}`,
    animalId: input.animalId,
    after: { text: obs.text, animal: input.animalId, media: media.length },
  })
  return obs
}

/** Runs the AI pipeline on an observation (AI-006) and stores the result. */
export function processObservation(db: Db, obs: Observation): AiResult {
  const result = analyzeObservation(db, obs.text, obs.reportedAnimalId)
  obs.ai = result
  obs.aiStatus = result.reviewReason ? "needs_review" : "awaiting_confirmation"
  appendAudit(db, null, {
    action: "AI routing result",
    entityType: "Observation",
    entityId: obs.id,
    entityLabel: `Observation ${obs.id}`,
    animalId: result.matchedAnimalId,
    after: {
      matchedAnimal: result.matchedAnimalId,
      aiDecision: result.reviewReason ? "review_queue" : result.suggestedAction,
      aiConfidence: Number(result.confidence.toFixed(2)),
      signs: result.signs.map((s) => s.code),
      promptVersion: result.promptVersion,
    },
  })
  if (obs.aiStatus === "needs_review") {
    const onDuty = db.users.filter((u) => ["officer", "supervisor"].includes(u.role)).map((u) => u.id)
    notify(db, "observation_needs_review", onDuty, "Observation needs review", obs.text.slice(0, 90), `/review?id=${obs.id}`)
  }
  return result
}

export async function createObservation(input: NewObservationInput): Promise<ObservationResult> {
  await delay()
  const db = getDb()
  const actor = requirePermission("record", { what: "Create observation" })
  if (input.text.trim().length < 3) throw new ApiError("VALIDATION", "Describe what you saw (at least 3 characters).", "text")
  if (input.animalId) {
    const a = db.animals.find((x) => x.id === input.animalId)
    if (!a || a.stayStatus === "released") throw new ApiError("VALIDATION", "Pick an animal with an active stay.", "animalId")
    if (!canSeeAnimal(actor, a)) requirePermission("record", { kennelCode: a.kennelCode })
  }
  // Saved first so it survives AI failures (BE-012).
  const obs = write((d) => createObservationRecord(d, actor, input))
  await delay(700) // AI worker latency
  write((d) => {
    const o = d.observations.find((x) => x.id === obs.id) as Observation
    processObservation(d, o)
  })
  const saved = getDb().observations.find((x) => x.id === obs.id) as Observation
  return { observation: clone(saved), canConfirm: hasPermission(actor, "triage") && saved.aiStatus === "awaiting_confirmation" }
}

export async function getObservation(id: string): Promise<Observation> {
  await delay(120)
  const o = getDb().observations.find((x) => x.id === id)
  if (!o) throw new ApiError("NOT_FOUND", `Observation ${id} was not found.`)
  return clone(o)
}

// ---------------------------------------------------------------------------
// Case rules engine (BE-018)
// ---------------------------------------------------------------------------

export interface RoutingDecision {
  animalId: string
  action: RoutingAction
  /** Required for update_case / reopen_case. */
  caseId: string | null
  signs?: ExtractedSign[]
  note?: string
}

function formatCaseId(n: number) {
  return `C-${String(n).padStart(4, "0")}`
}

function applyRouting(db: Db, actor: User, obs: Observation, decision: RoutingDecision, mode: "confirm" | "triage"): HealthCase | null {
  const animal = db.animals.find((a) => a.id === decision.animalId)
  if (!animal || animal.stayStatus === "released") throw new ApiError("CONFLICT", "Released animals can't receive new observations.")
  const signs = decision.signs ?? obs.ai?.signs ?? []
  const at = nowISO()
  let kase: HealthCase | null = null
  let before: Record<string, unknown> | null = null

  switch (decision.action) {
    case "timeline":
      break
    case "update_case": {
      kase = db.cases.find((c) => c.id === decision.caseId) ?? null
      if (!kase || kase.animalId !== animal.id || kase.status === "closed")
        throw new ApiError("CONFLICT", "Pick an open case for this animal to update.")
      before = { status: kase.status === "open" ? "Open" : "Needs review", observations: kase.observationIds.length, aiDecision: null }
      kase.observationIds.push(obs.id)
      kase.signCodes = Array.from(new Set([...kase.signCodes, ...signs.map((s) => s.code)]))
      kase.evidence.push(...obs.media)
      kase.updatedAt = at
      break
    }
    case "reopen_case": {
      kase = db.cases.find((c) => c.id === decision.caseId) ?? null
      if (!kase || kase.animalId !== animal.id || kase.status !== "closed")
        throw new ApiError("CONFLICT", "Pick a closed case for this animal to reopen.")
      before = { status: "Closed", observations: kase.observationIds.length, aiDecision: null }
      kase.status = "open"
      kase.reopenedAt = at
      if (!/\(reopened\)$/.test(kase.title)) kase.title = `${kase.title.replace(/ — resolved$/, "")} (reopened)`
      kase.observationIds.push(obs.id)
      kase.signCodes = Array.from(new Set([...kase.signCodes, ...signs.map((s) => s.code)]))
      kase.evidence.push(...obs.media)
      kase.updatedAt = at
      notify(
        db,
        "case_reopened",
        [kase.assigneeId, ...vets(db).map((v) => v.id)],
        `Case reopened · ${animal.kennelCode} ${animal.name}`,
        `${kase.id} reopened from observation ${obs.id}.`,
        `/cases?id=${kase.id}`
      )
      appendAudit(db, actor, {
        action: "Case reopened",
        entityType: "Case",
        entityId: kase.id,
        entityLabel: kase.id,
        animalId: animal.id,
        caseId: kase.id,
        before: { status: "Closed" },
        after: { status: "Open", from: obs.id },
      })
      break
    }
    case "new_case": {
      const id = formatCaseId(nextId(db, "case"))
      kase = {
        id,
        animalId: animal.id,
        title: caseTitleFromSigns(signs, obs.text),
        status: "open",
        signCodes: signs.map((s) => s.code),
        openedAt: at,
        openedBy: actor.id,
        assigneeId: null,
        observationIds: [obs.id],
        inspectionIds: [],
        followUps: [],
        notes: [],
        evidence: [...obs.media],
        aiSummary: null,
        closedAt: null,
        closedBy: null,
        closeReason: null,
        closeNote: null,
        reopenedAt: null,
        updatedAt: at,
      }
      db.cases.push(kase)
      notify(
        db,
        "case_created",
        vets(db).map((v) => v.id),
        `New case ${id} · ${animal.kennelCode} ${animal.name}`,
        kase.title,
        `/cases?id=${id}`
      )
      appendAudit(db, actor, {
        action: "Case created",
        entityType: "Case",
        entityId: id,
        entityLabel: id,
        animalId: animal.id,
        caseId: id,
        after: { title: kase.title, status: "Open", from: obs.id },
      })
      break
    }
  }

  const prevStatus = obs.aiStatus
  obs.animalId = animal.id
  obs.aiStatus = "routed"
  obs.routedAction = decision.action
  obs.caseId = kase?.id ?? null
  obs.triagedBy = actor.id
  obs.triagedAt = at
  obs.triageNote = decision.note?.trim() || null

  const aiAgreed = obs.ai?.matchedAnimalId === animal.id && obs.ai?.suggestedAction === decision.action
  appendAudit(db, actor, {
    action: mode === "triage" ? "Review queue triaged" : "AI decision confirmed",
    entityType: kase ? "Case" : "Observation",
    entityId: kase?.id ?? obs.id,
    entityLabel: kase ? `${kase.id} · ${ROUTING_LABEL[decision.action].toLowerCase()}` : `${obs.id} · timeline only`,
    animalId: animal.id,
    caseId: kase?.id ?? null,
    before: before ?? { aiStatus: prevStatus, aiDecision: null },
    after: {
      status: kase ? (kase.status === "open" ? "Open" : kase.status === "closed" ? "Closed" : "Needs review") : "Timeline",
      observations: kase?.observationIds.length ?? null,
      aiDecision: decision.action,
      aiConfidence: obs.ai ? Number(obs.ai.confidence.toFixed(2)) : null,
      overrodeAi: !aiAgreed,
      note: obs.triageNote,
    },
  })
  return kase
}

/** FE-012 "Confirm & Route" — also used after "Correct". */
export async function confirmRouting(
  observationId: string,
  decision: RoutingDecision
): Promise<{ observation: Observation; caseId: string | null }> {
  await delay()
  const actor = requirePermission("triage", { what: "Confirm AI routing" })
  return write((db) => {
    const obs = db.observations.find((o) => o.id === observationId)
    if (!obs) throw new ApiError("NOT_FOUND", `Observation ${observationId} was not found.`)
    if (obs.aiStatus === "routed") throw new ApiError("CONFLICT", `${obs.id} was already routed by ${userName(db, obs.triagedBy)}.`)
    const kase = applyRouting(db, actor, obs, decision, obs.aiStatus === "needs_review" ? "triage" : "confirm")
    return { observation: clone(obs), caseId: kase?.id ?? null }
  })
}

// ---------------------------------------------------------------------------
// Review queue (BE-019 / FE-017)
// ---------------------------------------------------------------------------

export type QueueSort = "oldest" | "newest" | "confidence"

export interface QueueCandidate {
  animal: Animal
  speciesName: string
  confidence: number
  status: string
}

export interface QueueCaseOption {
  id: string
  title: string
  status: HealthCase["status"]
  closedAt: string | null
}

export interface QueueItem {
  observation: Observation
  reporterName: string
  reporterRole: string
  reporterScope: string
  waitingMinutes: number
  candidates: QueueCandidate[]
  suggestedAnimal: Animal | null
}

function animalLite(db: Db, a: Animal): QueueCandidate["animal"] {
  return a
}

export async function listReviewQueue(sort: QueueSort = "oldest"): Promise<{ items: QueueItem[]; triagedToday: number }> {
  await delay()
  const db = getDb()
  const user = currentUser(db)
  const items = db.observations
    .filter((o) => o.aiStatus === "needs_review" || o.aiStatus === "awaiting_confirmation")
    .map((o): QueueItem => {
      const reporter = db.users.find((u) => u.id === o.createdBy)
      const candidates = (o.ai?.candidates ?? [])
        .map((c) => {
          const a = db.animals.find((x) => x.id === c.animalId)
          return a
            ? {
                animal: animalLite(db, a),
                speciesName: speciesName(db, a.speciesId),
                confidence: c.confidence,
                status: a.stayStatus === "active" ? "Active" : a.stayStatus === "arriving" ? "Arriving" : "Released",
              }
            : null
        })
        .filter((c): c is QueueCandidate => Boolean(c))
      const waiting = Math.max(0, Math.round((new Date(nowISO()).getTime() - new Date(o.createdAt).getTime()) / 60000))
      return {
        observation: clone(o),
        reporterName: reporter?.name ?? "Unknown",
        reporterRole: reporter?.role ?? "",
        reporterScope:
          reporter?.role === "contractor"
            ? reporter.kennelScope.length > 1
              ? `${reporter.kennelScope[0]}–${reporter.kennelScope.at(-1)}`
              : (reporter.kennelScope[0] ?? "")
            : "",
        waitingMinutes: waiting,
        candidates,
        suggestedAnimal: o.ai?.matchedAnimalId
          ? (db.animals.find((a) => a.id === o.ai?.matchedAnimalId) ?? null)
          : (candidates[0]?.animal ?? null),
      }
    })
    .filter((item) => user.role !== "contractor" || !item.suggestedAnimal || canSeeAnimal(user, item.suggestedAnimal))
  const sorters: Record<QueueSort, (a: QueueItem, b: QueueItem) => number> = {
    oldest: (a, b) =>
      a.observation.skippedCount - b.observation.skippedCount || a.observation.createdAt.localeCompare(b.observation.createdAt),
    newest: (a, b) =>
      a.observation.skippedCount - b.observation.skippedCount || b.observation.createdAt.localeCompare(a.observation.createdAt),
    confidence: (a, b) => (a.observation.ai?.confidence ?? 0) - (b.observation.ai?.confidence ?? 0),
  }
  items.sort(sorters[sort])
  const today = todayISO()
  const triagedToday = db.observations.filter((o) => o.triagedAt?.startsWith(today)).length
  return { items, triagedToday }
}

/** Case-action options for an animal in the triage panel. */
export async function caseOptionsForAnimal(animalId: string): Promise<{ open: QueueCaseOption[]; reopenable: QueueCaseOption[] }> {
  await delay(80)
  const db = getDb()
  const today = todayISO()
  const open = activeCases(db, animalId).map((c) => ({ id: c.id, title: c.title, status: c.status, closedAt: c.closedAt }))
  const reopenable = db.cases
    .filter((c) => c.animalId === animalId && c.status === "closed" && c.closedAt && c.closedAt.slice(0, 10) >= addDays(today, -14))
    .map((c) => ({ id: c.id, title: c.title, status: c.status, closedAt: c.closedAt }))
  return { open, reopenable }
}

export async function triageObservation(observationId: string, decision: RoutingDecision) {
  return confirmRouting(observationId, decision)
}

export async function skipReviewItem(observationId: string): Promise<void> {
  await delay(150)
  const actor = requirePermission("triage", { what: "Review queue" })
  write((db) => {
    const obs = db.observations.find((o) => o.id === observationId)
    if (!obs) throw new ApiError("NOT_FOUND", `Observation ${observationId} was not found.`)
    obs.skippedCount += 1
    appendAudit(db, actor, {
      action: "Review item skipped",
      entityType: "Observation",
      entityId: obs.id,
      entityLabel: `Observation ${obs.id}`,
      after: { skipped: obs.skippedCount },
    })
  })
}

/** Search active animals for "Or search another animal…" in triage. */
export async function searchActiveAnimals(query: string): Promise<{ animal: Animal; speciesName: string }[]> {
  await delay(80)
  const db = getDb()
  const user = currentUser(db)
  const q = query.trim().toLowerCase()
  return db.animals
    .filter((a) => a.stayStatus !== "released" && canSeeAnimal(user, a))
    .filter(
      (a) => !q || a.name.toLowerCase().includes(q) || a.kennelCode.toLowerCase().includes(q) || a.microchip.includes(q.replace(/\s/g, ""))
    )
    .slice(0, 8)
    .map((a) => ({ animal: clone(a), speciesName: speciesName(db, a.speciesId) }))
}
