import { Check } from "lucide-react"

import { fmtAge } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { CheckInfo } from "@/services/derive"
import type { Animal } from "@/types/domain"

/** Countries offered on the arrival form (common AQC import origins). */
export const COUNTRIES = [
  "Australia",
  "Canada",
  "China",
  "France",
  "Germany",
  "Hong Kong",
  "Indonesia",
  "Japan",
  "Malaysia",
  "Netherlands",
  "New Zealand",
  "Philippines",
  "South Africa",
  "South Korea",
  "Taiwan",
  "Thailand",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Vietnam",
]

/** "Dog · M · 5 y" */
export function animalMeta(a: Pick<Animal, "sex" | "dateOfBirth">, speciesName: string): string {
  return `${speciesName} · ${a.sex} · ${fmtAge(a.dateOfBirth)}`
}

/** Tiny AM/PM chip used in the Animals "Today" column (p.2). */
export function CheckChip({ check }: { check: CheckInfo }) {
  const base = "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold"
  switch (check.state) {
    case "done":
      return (
        <span className={cn(base, "bg-success-soft text-success")} title={`${check.session} inspection done`}>
          {check.session} <Check className="size-3" aria-label="done" />
        </span>
      )
    case "abnormal":
      return (
        <span className={cn(base, "bg-abnormal-soft text-abnormal")} title={`${check.session} inspection: ${check.abnormalCount} abnormal`}>
          {check.session} <Check className="size-3" aria-label="done with abnormal findings" />
        </span>
      )
    case "overdue":
      return (
        <span
          className={cn(base, "bg-destructive-soft text-destructive")}
          title={`${check.session} inspection overdue (due ${check.dueTime})`}
        >
          {check.session} late
        </span>
      )
    case "due":
      return (
        <span className={cn(base, "bg-muted text-muted-foreground")} title={`${check.session} inspection due ${check.dueTime}`}>
          {check.session}
        </span>
      )
    default:
      return (
        <span className={cn(base, "bg-muted text-muted-foreground/60")} title="Not applicable">
          {check.session} –
        </span>
      )
  }
}
