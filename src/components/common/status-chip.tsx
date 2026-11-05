import type { ReactNode } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

export const chipVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        abnormal: "bg-abnormal-soft text-abnormal",
        danger: "bg-destructive-soft text-destructive",
        info: "bg-info-soft text-info",
        neutral: "bg-neutral-soft text-neutral",
        ai: "bg-ai-soft text-ai",
        navy: "bg-navy text-navy-foreground",
        primary: "bg-primary-soft text-primary",
      },
      size: {
        default: "",
        sm: "h-5 px-2 text-[11px]",
      },
      outline: {
        true: "border",
        false: "",
      },
    },
    compoundVariants: [
      { tone: "success", outline: true, className: "border-success-border" },
      { tone: "warning", outline: true, className: "border-warning-border" },
      { tone: "danger", outline: true, className: "border-destructive-border" },
      { tone: "info", outline: true, className: "border-info-border" },
      { tone: "ai", outline: true, className: "border-ai-border" },
      { tone: "primary", outline: true, className: "border-primary" },
    ],
    defaultVariants: { tone: "neutral", size: "default", outline: false },
  }
)

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>["tone"]>

interface StatusChipProps extends VariantProps<typeof chipVariants> {
  children: ReactNode
  /** Leading status dot (design: "• Needs review", "• Open"). */
  dot?: boolean
  icon?: ReactNode
  className?: string
  title?: string
}

/** Rounded status chip used for animal, case, user and dose statuses. */
export function StatusChip({ children, tone, size, outline, dot, icon, className, title }: StatusChipProps) {
  return (
    <span className={cn(chipVariants({ tone, size, outline }), className)} title={title}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {icon}
      {children}
    </span>
  )
}

/** Kennel code badge — monospace on a light grey tile ("KC2-2"). */
export function KennelCode({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border border-border bg-subtle px-1.5 font-mono text-xs font-semibold tracking-tight text-foreground",
        className
      )}
    >
      {code}
    </span>
  )
}

/** Small numeric count pill used in tabs and nav ("42", "5"). */
export function CountPill({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode
  tone?: "muted" | "warning" | "inverse" | "primary"
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "warning" && "bg-warning-badge text-warning-badge-foreground",
        tone === "inverse" && "bg-white/15 text-white",
        tone === "primary" && "bg-primary-soft text-primary",
        className
      )}
    >
      {children}
    </span>
  )
}
