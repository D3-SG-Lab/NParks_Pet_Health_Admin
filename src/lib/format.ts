import { format, formatDistanceStrict } from "date-fns"

import { now, parseLocal, toISODate } from "@/lib/clock"
import type { ISODate, ISODateTime } from "@/types/domain"

/** 21/10 */
export const fmtDayMonth = (v: ISODate | ISODateTime) => format(parseLocal(v), "dd/MM")
/** 21/10/2026 */
export const fmtDate = (v: ISODate | ISODateTime) => format(parseLocal(v), "dd/MM/yyyy")
/** 21/10/2026 16:00 */
export const fmtDateTime = (v: ISODateTime) => format(parseLocal(v), "dd/MM/yyyy HH:mm")
/** 21/10 16:21 */
export const fmtShortDateTime = (v: ISODateTime) => format(parseLocal(v), "dd/MM HH:mm")
/** 16:21 */
export const fmtTime = (v: ISODateTime) => format(parseLocal(v), "HH:mm")
/** 21/10/2026 16:21:04 */
export const fmtFull = (v: ISODateTime) => format(parseLocal(v), "dd/MM/yyyy HH:mm:ss")
/** Wed 21 Oct 2026 */
export const fmtLongDay = (v: Date) => format(v, "EEE d MMM yyyy")
/** 21 Oct */
export const fmtDayShort = (v: ISODate | ISODateTime) => format(parseLocal(v), "d MMM")

/** "2 min ago", "3 h ago", "yesterday" relative to the demo clock. */
export function fmtRelative(v: ISODateTime): string {
  const date = parseLocal(v)
  const ref = now()
  const diffMs = ref.getTime() - date.getTime()
  if (diffMs < 60_000) return "just now"
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} min ago`
  if (toISODate(date) === toISODate(ref)) return `${Math.floor(diffMs / 3_600_000)} h ago`
  const y = new Date(ref)
  y.setDate(y.getDate() - 1)
  if (toISODate(date) === toISODate(y)) return "yesterday"
  return formatDistanceStrict(date, ref, { addSuffix: true })
}

/** "Today · 21 Oct", "Yesterday · 20 Oct", "10 Oct". */
export function fmtDayHeading(day: ISODate): string {
  const ref = now()
  const today = toISODate(ref)
  const y = new Date(ref)
  y.setDate(y.getDate() - 1)
  if (day === today) return `Today · ${fmtDayShort(day)}`
  if (day === toISODate(y)) return `Yesterday · ${fmtDayShort(day)}`
  return fmtDayShort(day)
}

/** 900123456780901 → "900 1234 5678 0901" (15-digit ISO 11784 chip, grouped 3·4·4·4). */
export function fmtMicrochip(mc: string): string {
  const d = mc.replace(/\D/g, "")
  if (d.length !== 15) return mc
  return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7, 11)} ${d.slice(11)}`
}

/** Age in whole years from a date of birth. */
export function ageYears(dob: ISODate, at: Date = now()): number {
  const b = parseLocal(dob)
  let years = at.getFullYear() - b.getFullYear()
  const m = at.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) years--
  return Math.max(0, years)
}

export function fmtAge(dob: ISODate): string {
  const y = ageYears(dob)
  if (y >= 1) return `${y} y`
  const b = parseLocal(dob)
  const ref = now()
  const months = (ref.getFullYear() - b.getFullYear()) * 12 + ref.getMonth() - b.getMonth()
  return `${Math.max(0, months)} mo`
}

export function initials(name: string): string {
  const cleaned = name.replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, "").replace(/\./g, " ")
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  // "Lim W." → LW ; "Yang Yang" → YY
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Two-letter avatar label for animals ("Yang Yang" → YY, "Oreo" → OR, "Max" → MX). */
export function animalInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase()
  const n = name.toUpperCase()
  if (n.length <= 2) return n
  // Prefer first letter + next consonant-ish character when the second letter is a vowel followed by a strong consonant (Max → MX)
  if (n.length === 3 && "AEIOU".includes(n[1])) return n[0] + n[2]
  return n.slice(0, 2)
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function percent(v: number): string {
  return `${Math.round(v * 100)}%`
}
