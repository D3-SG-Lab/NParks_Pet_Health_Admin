/**
 * The parts of the operations dashboard the API can serve: animals in quarantine
 * (`GET /animals?status=active-monitoring`) and today's inspections per animal
 * (`GET /animals/{id}/inspections`). They feed the "Active animals" and
 * "Checks due" counts and the animal list. "Open cases" and "Needs review" come
 * from the cases and queue derived in `remote/health.ts`.
 */
import { SESSIONS } from "@/config/app"
import { currentSession, fromUtc, nowISO, stayProgress, todayISO } from "@/lib/clock"
import { fmtTime } from "@/lib/format"
import type { AiSummary, Inspection, Session } from "@/types/domain"

import type { AnimalStayDto } from "../api/types"
import type { DashboardData, UnwellRow, UnwellStatus } from "../dashboard"
import type { CheckInfo } from "../derive"
import { findingsText, liveCaseCounts, loadLiveHealth } from "./health"
import { checkFromInspections, toAnimal } from "./mappers"

export type LiveCounts = Omit<DashboardData["counts"], "followUpsOverdue">

export interface LiveDashboard {
  counts: LiveCounts
  rows: UnwellRow[]
  notices: string[]
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function nextAction(check: Record<Session, CheckInfo>, session: Session): UnwellRow["nextAction"] {
  const abnormal = (["PM", "AM"] as const).find((s) => check[s].state === "abnormal")
  if (abnormal) return { label: `Review ${abnormal} findings`, tone: "danger", dueAt: null }
  const order: Session[] = session === "AM" ? ["AM", "PM"] : ["PM"]
  for (const s of order) {
    const c = check[s]
    if (c.state === "overdue") return { label: `${s} check overdue`, tone: "danger", dueAt: null }
    if (c.state === "due") return { label: `${s} check due by ${SESSIONS[s].due}`, tone: "default", dueAt: null }
  }
  if (check.AM.state === "not_applicable" && check.PM.state === "not_applicable")
    return { label: "No checks due today", tone: "default", dueAt: null }
  return { label: "Today’s checks done", tone: "default", dueAt: null }
}

function toRow(stay: AnimalStayDto, insps: Inspection[] | null, today: string, session: Session): UnwellRow {
  const animal = toAnimal(stay)
  const todays = (insps ?? []).filter((i) => i.date === today).sort((a, b) => a.at.localeCompare(b.at))
  const check = {
    AM: checkFromInspections(animal, insps ?? [], today, "AM"),
    PM: checkFromInspections(animal, insps ?? [], today, "PM"),
  }
  const latest = todays.at(-1)
  const anyAbnormal = todays.some((i) => i.abnormalCount > 0)
  const status: UnwellStatus = anyAbnormal ? "abnormal" : "monitoring"

  const bullets: AiSummary["bullets"] =
    insps === null
      ? [{ text: "Today’s inspections couldn’t be loaded.", citations: [] }]
      : todays.length
        ? todays.map((i) => ({ text: `${i.session} check ${fmtTime(i.at)}: ${findingsText(i)}`, citations: [] }))
        : [{ text: "No inspections recorded today.", citations: [] }]
  const updatedAt = latest?.at ?? fromUtc(stay.updatedAt) ?? nowISO()
  const { day, total } = stayProgress(stay.arrivalDate, stay.releaseDate ?? "", today)

  return {
    animal,
    speciesName: stay.species,
    status,
    caseId: null,
    aiSummary:
      insps === null
        ? "Inspections couldn’t be loaded"
        : latest
          ? `${latest.session} ${fmtTime(latest.at)} · ${capitalise(findingsText(latest))}`
          : "No checks recorded today",
    assigneeId: null,
    assigneeName: "",
    nextAction: insps === null ? { label: "—", tone: "default", dueAt: null } : nextAction(check, session),
    updatedAt,
    stay: { day, total },
    summary: { bullets, updatedAt },
    filters: [],
  }
}

export async function getLiveDashboard(): Promise<LiveDashboard> {
  const today = todayISO()
  const session = currentSession()
  const [health, caseCounts] = await Promise.all([loadLiveHealth(), liveCaseCounts()])
  const staying = health.animals.map((h) => h.stay)

  let amDue = 0
  let pmDue = 0
  let expected = 0
  let failed = 0
  const rows: UnwellRow[] = []
  health.animals.forEach(({ stay, animal, inspections }) => {
    if (inspections === null) {
      failed++
      rows.push(toRow(stay, null, today, session))
      return
    }
    const insps = inspections.filter((i) => i.date === today)
    for (const s of ["AM", "PM"] as const) {
      const check = checkFromInspections(animal, insps, today, s)
      if (check.state === "not_applicable") continue
      expected++
      if (check.state === "due" || check.state === "overdue") {
        if (s === "AM") amDue++
        else pmDue++
      }
    }
    rows.push(toRow(stay, insps, today, session))
  })

  const blocks = [...new Set(staying.map((s) => s.kennelBlock))].sort()
  return {
    counts: {
      activeAnimals: staying.length,
      arrivalsToday: staying.filter((s) => s.arrivalDate === today).length,
      blocks: blocks.length > 1 ? `${blocks[0]}–${blocks.at(-1)}` : (blocks[0] ?? "—"),
      checksDue: amDue + pmDue,
      checksDueAM: amDue,
      checksDuePM: pmDue,
      checksDoneRatio: expected ? (expected - amDue - pmDue) / expected : 0,
      ...caseCounts,
    },
    rows,
    notices: [
      ...(failed
        ? [`Today’s inspections couldn’t be loaded for ${failed} animal${failed === 1 ? "" : "s"}, so “Checks due” leaves them out.`]
        : []),
      ...health.notices.filter((n) => !n.startsWith("Inspections")),
    ],
  }
}
