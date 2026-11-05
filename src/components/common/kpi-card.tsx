import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { ProgressBar } from "./surfaces"

type Tone = "default" | "success" | "info" | "warning" | "danger" | "abnormal"

const VALUE_TONE: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  danger: "text-destructive",
  abnormal: "text-abnormal",
}

const CARD_TONE: Record<Tone, string> = {
  default: "border-border bg-card",
  success: "border-border bg-card",
  info: "border-border bg-card",
  warning: "border-warning-border bg-warning-tile",
  danger: "border-destructive-border bg-card",
  abnormal: "border-abnormal-border bg-card",
}

interface KpiCardProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  /** Colour of the big number. */
  tone?: Tone
  /** Highlights the whole card (amber "Needs review", red "Overdue"). */
  emphasis?: boolean
  progress?: number
  onClick?: () => void
  loading?: boolean
}

/** KPI tile from the dashboard / inspections header (label, 32px number, sub-line). */
export function KpiCard({ label, value, sub, tone = "default", emphasis, progress, onClick, loading }: KpiCardProps) {
  const Tag = onClick ? "button" : "div"
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-h-[120px] flex-col rounded-2xl border p-5 text-left shadow-[var(--shadow-card)] transition-colors",
        emphasis ? CARD_TONE[tone] : "border-border bg-card",
        onClick && "hover:border-border-strong focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      {loading ? (
        <span className="mt-2 h-9 w-14 animate-pulse rounded-md bg-muted" />
      ) : (
        <span className={cn("mt-1 text-[32px] leading-10 font-semibold tabular-nums", VALUE_TONE[tone])}>{value}</span>
      )}
      {sub ? <span className="mt-1 text-xs text-muted-foreground">{sub}</span> : null}
      {progress !== undefined ? <ProgressBar value={progress} tone="success" className="mt-auto pt-0" /> : null}
    </Tag>
  )
}
