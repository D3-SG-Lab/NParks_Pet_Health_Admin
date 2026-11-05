import { now, parseLocal, toISODate } from "@/lib/clock"
import { fmtDayMonth, fmtShortDateTime, fmtTime } from "@/lib/format"

/** "Dr Lim W." → "Dr Lim", "J. Tan" → "J. Tan" (list meta line in the design). */
export function shortName(name: string): string {
  return name.replace(/\s+[A-Z]\.$/, "")
}

/** Today → "16:00", tomorrow/other → "22/10 16:00". */
export function dueLabel(dueAt: string): string {
  const d = parseLocal(dueAt)
  return toISODate(d) === toISODate(now()) ? fmtTime(dueAt) : fmtShortDateTime(dueAt)
}

/** Queue/list time: "09:12" today, "Yesterday 17:30", else "20/10 17:30". */
export function timeOrDay(at: string): string {
  const d = parseLocal(at)
  const today = now()
  if (toISODate(d) === toISODate(today)) return fmtTime(at)
  const y = new Date(today)
  y.setDate(y.getDate() - 1)
  if (toISODate(d) === toISODate(y)) return `Yesterday ${fmtTime(at)}`
  return `${fmtDayMonth(at)} ${fmtTime(at)}`
}

/** 32 → "32 min", 190 → "3 h", 1500 → "1 d". */
export function waitingLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h`
  return `${Math.floor(minutes / (60 * 24))} d`
}

export function pluralCount(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}
