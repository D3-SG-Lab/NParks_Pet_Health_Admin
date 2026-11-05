import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** White rounded card used for every panel in the workbench. */
export function Panel({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode
  className?: string
  as?: "section" | "div" | "aside"
}) {
  return <Tag className={cn("rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]", className)}>{children}</Tag>
}

export function PanelHeader({
  title,
  actions,
  description,
  className,
}: {
  title: ReactNode
  actions?: ReactNode
  description?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Uppercase section label inside a panel ("FOLLOW-UP ACTIONS", "STAY DETAILS"). */
export function SectionLabel({ children, className, actions }: { children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <h3 className="eyebrow">{children}</h3>
      {actions}
    </div>
  )
}

/** Thin horizontal progress bar (stay progress, checks done). */
export function ProgressBar({ value, className, tone = "primary" }: { value: number; className?: string; tone?: "primary" | "success" }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full", tone === "success" ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Key/value list ("Kennel / room — KC2-2"). */
export function DetailList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-4 gap-y-3 text-sm", className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
