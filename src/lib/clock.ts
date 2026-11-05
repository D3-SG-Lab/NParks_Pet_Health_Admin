import { APP_CONFIG, SESSIONS } from "@/config/app"
import type { ISODate, ISODateTime, Session } from "@/types/domain"

/**
 * Demo clock. The seed data is anchored to the design reference moment; the
 * clock starts there when the page loads and then advances in real time so new
 * records get realistic, increasing timestamps.
 *
 * Only call `now()` from client code (event handlers, effects, client renders
 * after hydration) — never during server prerendering.
 */
const loadedAt = typeof performance !== "undefined" ? Date.now() : 0

function anchor(): Date | null {
  if (APP_CONFIG.demoNow === "real") return null
  return parseLocal(APP_CONFIG.demoNow)
}

export function now(): Date {
  const a = anchor()
  if (!a) return new Date()
  return new Date(a.getTime() + (Date.now() - loadedAt))
}

const pad = (n: number) => String(n).padStart(2, "0")

/** Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm(:ss)" as local time. */
export function parseLocal(value: string): Date {
  const [d, t = "00:00:00"] = value.split("T")
  const [y, m, day] = d.split("-").map(Number)
  const [hh, mm, ss = 0] = t.split(":").map(Number)
  return new Date(y, m - 1, day, hh, mm, ss)
}

export function toISODateTime(date: Date): ISODateTime {
  return `${toISODate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function nowISO(): ISODateTime {
  return toISODateTime(now())
}

export function todayISO(): ISODate {
  return toISODate(now())
}

export function currentSession(at: Date = now()): Session {
  return at.getHours() < 12 ? "AM" : "PM"
}

/** Due moment for a session on a given day. */
export function sessionDue(date: ISODate, session: Session): Date {
  return parseLocal(`${date}T${SESSIONS[session].due}`)
}

export function sessionCloses(date: ISODate, session: Session): Date {
  return parseLocal(`${date}T${SESSIONS[session].closes}`)
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseLocal(date)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** Whole days between two calendar dates (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseLocal(b).getTime() - parseLocal(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** "Day 12 of 30" for a stay. */
export function stayProgress(arrival: ISODate, release: ISODate, today: ISODate = todayISO()) {
  // Arrived 10/10, release 09/11 → "Day 12 of 30" on 21/10 (release day is not counted).
  const total = Math.max(1, diffDays(arrival, release))
  const day = Math.min(total, Math.max(1, diffDays(arrival, today) + 1))
  return { day, total, ratio: day / total }
}
