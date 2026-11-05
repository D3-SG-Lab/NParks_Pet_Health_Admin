/** Operations dashboard (BE-021, FE-005, FE-021). */
import { addDays, currentSession, nowISO, parseLocal, todayISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import { fmtDateTime } from "@/lib/format"
import type { AiSummary, Animal, HealthCase } from "@/types/domain"

import { addFollowUpRecord } from "./cases"
import { appendAudit, canSeeAnimal, clone, currentUser, delay, getDb, notify, requirePermission, userName, write } from "./core"
import { activeCases, animalAiSummary, caseNextAction, checkInfo, speciesName, type NextAction } from "./derive"

export type UnwellStatus = "needs_review" | "open" | "monitoring"
export type UnwellFilter = "open" | "needs_review" | "last_7_days" | "assigned_to_me"

export interface UnwellRow {
  animal: Animal
  speciesName: string
  status: UnwellStatus
  caseId: string | null
  aiSummary: string
  assigneeId: string | null
  assigneeName: string
  nextAction: NextAction
  updatedAt: string
  stay: { day: number; total: number }
  /** AI 30-day summary for the side panel (AI-005). */
  summary: AiSummary
  /** Filter chips this row belongs to (Open / Needs review / Last 7 days / Assigned to me). */
  filters: UnwellFilter[]
}

export interface DashboardData {
  counts: {
    activeAnimals: number
    arrivalsToday: number
    blocks: string
    checksDue: number
    checksDueAM: number
    checksDuePM: number
    checksDoneRatio: number
    openCases: number
    casesUpdatedToday: number
    followUpsOverdue: number
    needsReview: number
  }
  rows: UnwellRow[]
  filterCounts: Record<UnwellFilter, number>
  updatedAt: string
}

const STATUS_RANK: Record<UnwellStatus, number> = { needs_review: 0, open: 1, monitoring: 2 }

export async function getDashboard(): Promise<DashboardData> {
  await delay()
  const db = getDb()
  const user = currentUser(db)
  const today = todayISO()
  const animals = db.animals.filter((a) => a.stayStatus !== "released" && canSeeAnimal(user, a))

  // Checks due = inspections still outstanding today per session (AM 12 · PM 6 style).
  const inspectable = animals.filter((a) => a.stayStatus === "active")
  const outstanding = (session: "AM" | "PM") =>
    inspectable.filter((a) => {
      const c = checkInfo(db, a, today, session)
      return c.state === "due" || c.state === "overdue"
    }).length
  const session = currentSession()
  const amDue = outstanding("AM")
  const pmDue = outstanding("PM")
  const totalChecks = inspectable.length * 2
  const doneChecks = totalChecks - amDue - pmDue

  const visibleCases = db.cases.filter((c) => animals.some((a) => a.id === c.animalId))
  const open = visibleCases.filter((c) => c.status !== "closed")
  const nowMs = parseLocal(nowISO()).getTime()
  const followUpsOverdue = open.flatMap((c) => c.followUps).filter((f) => !f.done && parseLocal(f.dueAt).getTime() < nowMs).length
  const needsReview = db.observations.filter((o) => o.aiStatus === "needs_review" || o.aiStatus === "awaiting_confirmation").length

  const rows: UnwellRow[] = []
  for (const a of animals) {
    const cases = activeCases(db, a.id).sort(
      (x, y) => Number(y.status === "needs_review") - Number(x.status === "needs_review") || y.updatedAt.localeCompare(x.updatedAt)
    )
    const c: HealthCase | undefined = cases[0]
    if (!c && !a.monitoringFlag) continue
    const summary: AiSummary = animalAiSummary(db, a.id)
    const stay = {
      day: Math.max(1, Math.round((parseLocal(today).getTime() - parseLocal(a.arrivalDate).getTime()) / 86_400_000) + 1),
      total: Math.round((parseLocal(a.releaseDate).getTime() - parseLocal(a.arrivalDate).getTime()) / 86_400_000),
    }
    if (c) {
      rows.push({
        animal: clone(a),
        speciesName: speciesName(db, a.speciesId),
        status: c.status === "needs_review" ? "needs_review" : "open",
        caseId: c.id,
        aiSummary: dashboardSummary(c, summary),
        assigneeId: c.assigneeId,
        assigneeName: userName(db, c.assigneeId),
        nextAction: caseNextAction(c),
        updatedAt: c.updatedAt,
        stay,
        summary,
        filters: [],
      })
    } else {
      const am = checkInfo(db, a, today, session)
      const overdueAction = a.monitoringDueAt && parseLocal(a.monitoringDueAt).getTime() < nowMs && am.state !== "overdue"
      rows.push({
        animal: clone(a),
        speciesName: speciesName(db, a.speciesId),
        status: "monitoring",
        caseId: null,
        aiSummary: a.monitoringNote ?? summary.bullets[0]?.text ?? "Under monitoring",
        assigneeId: a.monitoringAssigneeId,
        assigneeName: userName(db, a.monitoringAssigneeId),
        nextAction: overdueAction
          ? { label: "Follow-up overdue", tone: "danger", dueAt: a.monitoringDueAt }
          : { label: a.monitoringAction ?? "Monitor", tone: "default", dueAt: a.monitoringDueAt },
        updatedAt: a.monitoringDueAt ?? a.createdAt,
        stay,
        summary,
        filters: [],
      })
    }
  }
  rows.sort((x, y) => STATUS_RANK[x.status] - STATUS_RANK[y.status] || y.updatedAt.localeCompare(x.updatedAt))

  const sevenAgo = addDays(today, -7)
  for (const r of rows) {
    r.filters = ["open"]
    if (r.status === "needs_review") r.filters.push("needs_review")
    if (r.updatedAt.slice(0, 10) >= sevenAgo) r.filters.push("last_7_days")
    if (r.assigneeId === user.id) r.filters.push("assigned_to_me")
  }
  const filterCounts: Record<UnwellFilter, number> = {
    open: rows.length,
    needs_review: rows.filter((r) => r.status === "needs_review").length,
    last_7_days: rows.filter((r) => r.updatedAt.slice(0, 10) >= sevenAgo).length,
    assigned_to_me: rows.filter((r) => r.assigneeId === user.id).length,
  }
  const blocks = Array.from(new Set(animals.map((a) => a.kennelCode.split("-")[0])))
    .filter((b) => b.startsWith("KC"))
    .sort()

  return {
    counts: {
      activeAnimals: animals.length,
      arrivalsToday: animals.filter((a) => a.arrivalDate === today).length,
      blocks: blocks.length > 1 ? `${blocks[0]}–${blocks.at(-1)}` : (blocks[0] ?? "—"),
      checksDue: amDue + pmDue,
      checksDueAM: amDue,
      checksDuePM: pmDue,
      checksDoneRatio: totalChecks ? doneChecks / totalChecks : 0,
      openCases: open.length,
      casesUpdatedToday: open.filter((c) => c.updatedAt.startsWith(today)).length,
      followUpsOverdue,
      needsReview,
    },
    rows,
    filterCounts,
    updatedAt: nowISO(),
  }
}

function dashboardSummary(c: HealthCase, s: AiSummary): string {
  if (c.reopenedAt && c.reopenedAt.startsWith(todayISO()))
    return `${c.title.replace(/\s*\(reopened\)$/, "")}, case reopened ${c.reopenedAt.slice(8, 10)}/${c.reopenedAt.slice(5, 7)}`
  const first = s.bullets[0]?.text
  return first ? first.replace(" — ", ", ") : c.title
}

export interface AssignFollowUpInput {
  assigneeId: string
  action: string
  dueAt: string
}

/**
 * "Assign follow-up" from the dashboard (FE-021): adds a follow-up to the
 * animal's active case, or — for monitored animals without a case — sets the
 * animal's monitoring follow-up. Assignee is notified; change is audited.
 */
export async function assignFollowUp(animalId: string, input: AssignFollowUpInput): Promise<{ caseId: string | null }> {
  await delay()
  const actor = requirePermission("cases", { what: "Assign follow-up" })
  if (!input.action.trim()) throw new ApiError("VALIDATION", "Enter the action.", "action")
  if (!input.dueAt) throw new ApiError("VALIDATION", "Pick a due date and time.", "dueAt")
  return write((db) => {
    const a = db.animals.find((x) => x.id === animalId)
    if (!a) throw new ApiError("NOT_FOUND", "Animal not found.")
    const assignee = db.users.find((u) => u.id === input.assigneeId && u.status !== "disabled")
    if (!assignee) throw new ApiError("VALIDATION", "Pick an assignee.", "assigneeId")
    const c = activeCases(db, a.id).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0]
    if (c) {
      const before = { assignee: userName(db, c.assigneeId), followUps: c.followUps.filter((f) => !f.done).length }
      addFollowUpRecord(db, actor.id, c, input)
      if (c.assigneeId !== input.assigneeId) c.assigneeId = input.assigneeId
      appendAudit(db, actor, {
        action: "Follow-up assigned",
        entityType: "Case",
        entityId: c.id,
        entityLabel: `${c.id} · ${input.action.trim()}`,
        animalId: a.id,
        caseId: c.id,
        before,
        after: { assignee: assignee.name, action: input.action.trim(), due: input.dueAt },
      })
      notify(
        db,
        "case_assigned",
        [assignee.id],
        `Follow-up assigned · ${a.kennelCode} ${a.name}`,
        `${input.action.trim()}, due ${fmtDateTime(input.dueAt)}. Tap to open case ${c.id}.`,
        `/cases?id=${c.id}`
      )
      return { caseId: c.id }
    }
    const before = { assignee: userName(db, a.monitoringAssigneeId), action: a.monitoringAction }
    a.monitoringFlag = true
    a.monitoringAssigneeId = assignee.id
    a.monitoringAction = input.action.trim()
    a.monitoringDueAt = input.dueAt
    appendAudit(db, actor, {
      action: "Follow-up assigned",
      entityType: "Animal",
      entityId: a.id,
      entityLabel: `${a.kennelCode} · ${a.name}`,
      animalId: a.id,
      before,
      after: { assignee: assignee.name, action: a.monitoringAction, due: input.dueAt },
    })
    notify(
      db,
      "case_assigned",
      [assignee.id],
      `Follow-up assigned · ${a.kennelCode} ${a.name}`,
      `${a.monitoringAction}, due ${fmtDateTime(input.dueAt)}.`,
      `/animals/${a.id}`
    )
    return { caseId: null }
  })
}

/** Clears the monitoring flag for an animal without an active case. */
export async function clearMonitoring(animalId: string): Promise<void> {
  await delay()
  const actor = requirePermission("cases", { what: "Clear monitoring" })
  write((db) => {
    const a = db.animals.find((x) => x.id === animalId)
    if (!a) throw new ApiError("NOT_FOUND", "Animal not found.")
    a.monitoringFlag = false
    a.monitoringNote = null
    a.monitoringAction = null
    a.monitoringDueAt = null
    a.monitoringAssigneeId = null
    appendAudit(db, actor, {
      action: "Monitoring cleared",
      entityType: "Animal",
      entityId: a.id,
      entityLabel: `${a.kennelCode} · ${a.name}`,
      animalId: a.id,
      before: { monitoring: true },
      after: { monitoring: false },
    })
  })
}

/** Users who can be assigned follow-ups (officer-IdP clinical roles + contractors in scope). */
export async function listAssignees(animalId?: string): Promise<{ id: string; name: string; role: string }[]> {
  await delay(60)
  const db = getDb()
  const animal = animalId ? db.animals.find((a) => a.id === animalId) : undefined
  return db.users
    .filter((u) => u.status !== "disabled" && ["officer", "vet", "supervisor", "contractor"].includes(u.role))
    .filter((u) => u.role !== "contractor" || !animal || u.kennelScope.includes(animal.kennelCode.split("-")[0]))
    .map((u) => ({ id: u.id, name: u.name, role: u.role }))
}

/** Sidebar badges: active animals, open cases, review queue (scoped to the user). */
export async function getNavCounts(): Promise<{ animals: number; cases: number; review: number }> {
  await delay(60)
  const db = getDb()
  const user = currentUser(db)
  const animals = db.animals.filter((a) => a.stayStatus !== "released" && canSeeAnimal(user, a))
  const ids = new Set(animals.map((a) => a.id))
  return {
    animals: animals.length,
    cases: db.cases.filter((c) => c.status !== "closed" && ids.has(c.animalId)).length,
    review: db.observations.filter((o) => o.aiStatus === "needs_review" || o.aiStatus === "awaiting_confirmation").length,
  }
}
