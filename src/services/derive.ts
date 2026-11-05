/**
 * Derived read models shared by several services: animal status, today's
 * checks, next actions, timelines and the AI summaries (AI-005).
 * Pure functions over the mock DB — no writes.
 */
import { SESSIONS } from "@/config/app"
import { addDays, now, parseLocal, sessionDue, todayISO, toISODate } from "@/lib/clock"
import { fmtDayMonth, fmtTime } from "@/lib/format"
import type { Db } from "@/lib/mock/db"
import type { AiSummary, Animal, AnimalHealthStatus, HealthCase, Inspection, MediaRef, MedicationSchedule, Session } from "@/types/domain"

import { userName } from "./core"

export function speciesName(db: Db, id: string): string {
  return db.species.find((s) => s.id === id)?.name ?? id
}

export function activeCases(db: Db, animalId: string): HealthCase[] {
  return db.cases.filter((c) => c.animalId === animalId && c.status !== "closed")
}

export function animalHealthStatus(db: Db, a: Animal): AnimalHealthStatus {
  if (a.stayStatus === "released") return "released"
  if (a.stayStatus === "arriving") return "awaiting_exam"
  if (activeCases(db, a.id).length > 0) return "unwell"
  if (a.monitoringFlag) return "monitoring"
  return "active"
}

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

export type CheckState = "done" | "abnormal" | "due" | "overdue" | "not_applicable"

export interface CheckInfo {
  session: Session
  state: CheckState
  inspectionId: string | null
  at: string | null
  abnormalCount: number
  dueTime: string
}

export function inspectionFor(db: Db, animalId: string, date: string, session: Session): Inspection | undefined {
  return db.inspections.find((i) => i.animalId === animalId && i.date === date && i.session === session)
}

/** Inspection state for one animal and session (Inspections board p.6, Animals "Today" column p.2). */
export function checkInfo(db: Db, a: Animal, date: string, session: Session): CheckInfo {
  const dueTime = SESSIONS[session].due
  if (a.stayStatus !== "active" || date < a.arrivalDate) {
    return { session, state: "not_applicable", inspectionId: null, at: null, abnormalCount: 0, dueTime }
  }
  const insp = inspectionFor(db, a.id, date, session)
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

/** "All normal · Food: Full · Stool: Soft · Urine: Yes" style one-liner. */
export function inspectionSummary(i: Inspection): string {
  const abn = i.results.filter((r) => r.abnormal)
  const key = ["Food", "Stool", "Urine"].map((label) => i.results.find((r) => r.label === label)).filter(Boolean)
  if (abn.length === 0) {
    return ["All normal", ...key.map((r) => `${r!.label}: ${r!.value}`)].join(" · ")
  }
  const parts = abn.map((r) => `${r.label}: ${r.value === "Abnormal" ? "Abnormal" : r.value}${r.note ? ` (${r.note})` : ""}`)
  if (i.otherFindings) parts.push(`Other: ${i.otherFindings}`)
  return parts.join(" · ")
}

// ---------------------------------------------------------------------------
// Cases & next actions
// ---------------------------------------------------------------------------

export interface NextAction {
  label: string
  tone: "default" | "danger"
  dueAt: string | null
}

function dueLabel(dueAt: string): string {
  const d = parseLocal(dueAt)
  return toISODate(d) === todayISO() ? fmtTime(dueAt) : fmtDayMonth(dueAt)
}

export function caseNextAction(c: HealthCase): NextAction {
  const open = c.followUps.filter((f) => !f.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const first = open[0]
  if (first) {
    if (parseLocal(first.dueAt).getTime() < now().getTime()) return { label: "Follow-up overdue", tone: "danger", dueAt: first.dueAt }
    const isToday = toISODate(parseLocal(first.dueAt)) === todayISO()
    const label =
      first.action.toLowerCase().includes("review") && isToday && parseLocal(first.dueAt).getHours() >= 17
        ? `${first.action} · today`
        : `${first.action} · ${dueLabel(first.dueAt)}`
    return { label, tone: "default", dueAt: first.dueAt }
  }
  if (c.status === "needs_review") return { label: "Triage observation", tone: "default", dueAt: null }
  return { label: "—", tone: "default", dueAt: null }
}

export function caseTheme(c: HealthCase): string {
  return c.title.split(/\s+[—-]\s+|,/)[0]
}

// ---------------------------------------------------------------------------
// Medication
// ---------------------------------------------------------------------------

export function scheduleActiveOn(s: MedicationSchedule, date: string): boolean {
  if (s.stoppedAt && s.stoppedAt.slice(0, 10) <= date) return false
  return s.startDate <= date && s.endDate >= date
}

export function freqLabel(s: Pick<MedicationSchedule, "frequency" | "doseTimes">): string {
  if (s.frequency === "custom") return `${s.doseTimes.length}× daily (custom)`
  return `${s.frequency.replace("x", "×")} daily`
}

// ---------------------------------------------------------------------------
// Timeline (BE-020)
// ---------------------------------------------------------------------------

export type TimelineType = "exam" | "inspection" | "observation" | "medication" | "case"

export interface TimelineEntry {
  id: string
  /** Source record id — used by AI summary citations. */
  refId: string
  type: TimelineType
  at: string
  title: string
  /** Optional emphasised id in the title, e.g. "O-3381". */
  titleRef: string | null
  detail: string
  tone: "success" | "abnormal" | "neutral" | "case"
  media: MediaRef[]
  href: string | null
}

export function buildTimeline(db: Db, animalId: string): TimelineEntry[] {
  const out: TimelineEntry[] = []
  const exam = db.arrivalExams.find((e) => e.animalId === animalId)
  if (exam) {
    const abn = exam.findings.filter((f) => !f.normal)
    out.push({
      id: `t-${exam.id}`,
      refId: exam.id,
      type: "exam",
      at: exam.at,
      title: "Arrival exam",
      titleRef: null,
      detail: [
        userName(db, exam.vetId),
        `${exam.weightKg.toFixed(1)} kg`,
        exam.mentation,
        ...abn.map((f) => `${f.system} abnormal: ${f.note}`),
      ].join(" · "),
      tone: abn.length ? "abnormal" : "neutral",
      media: [],
      href: null,
    })
  }
  for (const i of db.inspections.filter((x) => x.animalId === animalId)) {
    out.push({
      id: `t-${i.id}`,
      refId: i.id,
      type: "inspection",
      at: i.at,
      title: `${i.session} inspection`,
      titleRef: null,
      detail: `${inspectionSummary(i)} · by ${userName(db, i.byUserId)}${i.editedAt ? " · edited" : ""}`,
      tone: i.abnormalCount > 0 ? "abnormal" : "success",
      media: [],
      href: null,
    })
  }
  const schedules = new Map(db.medicationSchedules.map((s) => [s.id, s]))
  for (const m of db.medicationAdministrations.filter((x) => x.animalId === animalId)) {
    const s = schedules.get(m.scheduleId)
    if (!s) continue
    const idx = s.doseTimes.indexOf(m.doseTime) + 1
    out.push({
      id: `t-${m.id}`,
      refId: m.id,
      type: "medication",
      at: m.at,
      title: `${s.item} ${s.dose} given`,
      titleRef: null,
      detail: [
        s.doseTimes.length > 1 ? `Dose ${idx} of ${s.doseTimes.length}` : null,
        m.remarks && !m.remarks.startsWith("Dose") ? m.remarks : null,
        `by ${userName(db, m.byUserId)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      tone: "success",
      media: [],
      href: null,
    })
  }
  for (const o of db.observations.filter((x) => x.animalId === animalId)) {
    out.push({
      id: `t-${o.id}`,
      refId: o.id,
      type: "observation",
      at: o.createdAt,
      title: "Observation",
      titleRef: o.id,
      detail: o.text,
      tone: "abnormal",
      media: o.media,
      href: null,
    })
    if (o.caseId && o.triagedAt && o.routedAction && o.routedAction !== "timeline") {
      const verb = o.routedAction === "new_case" ? "opened" : o.routedAction === "reopen_case" ? "reopened" : "updated"
      out.push({
        id: `t-route-${o.id}`,
        refId: o.caseId,
        type: "case",
        at: o.triagedAt,
        title: `Case ${verb}`,
        titleRef: o.caseId,
        detail: `AI routing confirmed by ${userName(db, o.triagedBy)} · ${o.routedAction.replace("_", " ")}`,
        tone: "case",
        media: [],
        href: `/cases?id=${o.caseId}`,
      })
    }
  }
  for (const c of db.cases.filter((x) => x.animalId === animalId)) {
    if (c.closedAt && c.status === "closed") {
      out.push({
        id: `t-close-${c.id}`,
        refId: c.id,
        type: "case",
        at: c.closedAt,
        title: "Case closed",
        titleRef: c.id,
        detail: `${CLOSE_REASON_LABEL[c.closeReason ?? "other"]} · by ${userName(db, c.closedBy)}`,
        tone: "case",
        media: [],
        href: `/cases?id=${c.id}`,
      })
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

export const CLOSE_REASON_LABEL: Record<NonNullable<HealthCase["closeReason"]>, string> = {
  resolved: "Resolved — signs cleared",
  released: "Animal released",
  duplicate: "Duplicate or opened in error",
  other: "Other",
}

// ---------------------------------------------------------------------------
// AI summaries (AI-005) — every statement cites source record ids
// ---------------------------------------------------------------------------

export function animalAiSummary(db: Db, animalId: string): AiSummary {
  const today = todayISO()
  const sevenAgo = addDays(today, -7)
  const bullets: AiSummary["bullets"] = []
  const sources: string[] = []

  for (const c of activeCases(db, animalId)) {
    const obsIds = c.observationIds.filter((id) => {
      const o = db.observations.find((x) => x.id === id)
      return o && o.createdAt.slice(0, 10) >= sevenAgo
    })
    const inspIds = c.inspectionIds.filter((id) => (db.inspections.find((x) => x.id === id)?.date ?? "") >= sevenAgo)
    const count = obsIds.length + inspIds.length
    const cites = [...obsIds, ...inspIds]
    bullets.push({
      text: `${caseTheme(c)} since ${fmtDayMonth(c.openedAt)} — ${count} observation${count === 1 ? "" : "s"} in 7 days`,
      citations: cites.length ? cites : [c.id],
    })
    sources.push(c.updatedAt)
  }

  const recent = db.inspections
    .filter((i) => i.animalId === animalId && i.date > addDays(today, -4))
    .sort((a, b) => b.at.localeCompare(a.at))
  const days = new Map<string, Inspection[]>()
  for (const i of recent) days.set(i.date, [...(days.get(i.date) ?? []), i])
  const lowFood = Array.from(days.entries()).filter(([, list]) =>
    list.some((i) => i.results.some((r) => r.label === "Food" && r.value !== "Full"))
  )
  if (lowFood.length > 0) {
    const value = lowFood[0][1].flatMap((i) => i.results).find((r) => r.label === "Food" && r.value !== "Full")?.value ?? "Half"
    bullets.push({
      text: `Food intake “${value}” on ${lowFood.length} of the last ${Math.min(4, Math.max(days.size, lowFood.length))} days`,
      citations: lowFood
        .map(([, list]) => list.find((i) => i.results.some((r) => r.label === "Food" && r.value !== "Full"))!.id)
        .slice(0, 3),
    })
    sources.push(recent[0].at)
  }

  for (const s of db.medicationSchedules.filter((x) => x.animalId === animalId && scheduleActiveOn(x, today) && x.caseId)) {
    bullets.push({
      text: `On ${s.item.toLowerCase()} ${s.dose} ${freqLabel(s).replace(" daily", "")} daily since ${fmtDayMonth(s.startDate)}`,
      citations: [s.id],
    })
    sources.push(s.createdAt)
  }

  const closed = db.cases.filter(
    (c) => c.animalId === animalId && c.status === "closed" && c.closedAt && c.closedAt.slice(0, 10) >= addDays(today, -30)
  )
  for (const c of closed) {
    bullets.push({ text: `${caseTheme(c)} resolved ${fmtDayMonth(c.closedAt!)} (${c.id})`, citations: [c.id] })
  }

  if (bullets.length === 0) {
    const last = db.inspections.filter((i) => i.animalId === animalId).sort((a, b) => b.at.localeCompare(a.at))[0]
    const exam = db.arrivalExams.find((e) => e.animalId === animalId)
    bullets.push({
      text: last
        ? "No abnormal findings in the last 30 days — inspections normal"
        : exam
          ? "Arrival exam completed; no inspections recorded yet"
          : "Awaiting arrival exam — no clinical records yet",
      citations: last ? [last.id] : exam ? [exam.id] : [],
    })
    if (last) sources.push(last.at)
  }

  const latest = sources.sort().at(-1) ?? `${today}T00:00:00`
  return { bullets, updatedAt: latest }
}

export function caseAiSummary(db: Db, c: HealthCase): AiSummary {
  const sevenAgo = addDays(todayISO(), -7)
  const obs = c.observationIds.map((id) => db.observations.find((o) => o.id === id)).filter((o): o is NonNullable<typeof o> => Boolean(o))
  const recentObs = obs.filter((o) => o.createdAt.slice(0, 10) >= sevenAgo)
  const insp = c.inspectionIds.map((id) => db.inspections.find((i) => i.id === id)).filter((i): i is Inspection => Boolean(i))
  const count = recentObs.length + insp.filter((i) => i.date >= sevenAgo).length
  const bullets: AiSummary["bullets"] = [
    {
      text: `${caseTheme(c)} since ${fmtDayMonth(c.openedAt)} — ${count} related observation${count === 1 ? "" : "s"} in 7 days`,
      citations: [...recentObs.map((o) => o.id), ...insp.map((i) => i.id)].slice(0, 4),
    },
  ]
  const latest = obs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (latest) bullets.push({ text: `Latest: “${latest.text.replace(/\.$/, "")}”`, citations: [latest.id] })
  const animalInsp = db.inspections.filter((i) => i.animalId === c.animalId && i.at >= c.openedAt)
  if (animalInsp.length > 0) {
    const allNormalMentation = animalInsp.every((i) => !i.results.some((r) => r.label === "Mentation" && r.abnormal))
    if (allNormalMentation) bullets.push({ text: "Mentation normal throughout", citations: [animalInsp[animalInsp.length - 1].id] })
  }
  if (c.status === "closed" && c.closedAt)
    bullets.push({ text: `Closed ${fmtDayMonth(c.closedAt)} — ${CLOSE_REASON_LABEL[c.closeReason ?? "other"]}`, citations: [c.id] })
  const updatedAt = [c.updatedAt, ...obs.map((o) => o.createdAt)].sort().at(-1) ?? c.updatedAt
  return { bullets, updatedAt }
}
