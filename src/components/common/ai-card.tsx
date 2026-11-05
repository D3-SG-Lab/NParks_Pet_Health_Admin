"use client"

import type { ReactNode } from "react"
import { Sparkles } from "lucide-react"

import { fmtRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AiSummary } from "@/types/domain"

/** Numbered citation chip ("1", "2") linking a statement to its source record (AI-005). */
export function CitationChip({ n, refId, onClick }: { n: number; refId: string; onClick?: (refId: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(refId)}
      title={`Source: ${refId}`}
      aria-label={`Citation ${n}: ${refId}`}
      className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-ai-border bg-card px-1 align-[1px] font-mono text-[10px] font-semibold text-ai hover:bg-ai-soft focus-visible:ring-2 focus-visible:ring-ai/30 focus-visible:outline-none"
    >
      {n}
    </button>
  )
}

interface AiCardProps {
  title?: string
  summary: AiSummary
  /** Called when a citation is clicked (open the source record). */
  onCite?: (refId: string) => void
  footer?: ReactNode
  variant?: "list" | "inline"
  className?: string
}

/** Lavender AI summary card ("AI 30-day summary · 2 min ago"). Every statement cites its source. */
export function AiSummaryCard({ title = "AI 30-day summary", summary, onCite, footer, variant = "list", className }: AiCardProps) {
  // Citation numbers run across all bullets: [1] [2] … [n].
  const offsets = summary.bullets.reduce<number[]>(
    (acc, b, i) => [...acc, i === 0 ? 0 : acc[i - 1] + summary.bullets[i - 1].citations.length],
    []
  )
  return (
    <div className={cn("rounded-xl border border-ai-border bg-ai-soft p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ai">
          <Sparkles className="size-4" aria-hidden />
          {title}
        </p>
        <span className="text-xs text-muted-foreground">{fmtRelative(summary.updatedAt)}</span>
      </div>
      {variant === "list" ? (
        <ul className="space-y-1.5 text-sm text-foreground">
          {summary.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground" aria-hidden />
              <span>
                {b.text}{" "}
                {b.citations.map((c, j) => (
                  <CitationChip key={`${c}-${j}`} n={offsets[i] + j + 1} refId={c} onClick={onCite} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-foreground">
          {summary.bullets.map((b, i) => (
            <span key={i}>
              {b.text}
              {b.citations.map((c, j) => (
                <CitationChip key={`${c}-${j}`} n={offsets[i] + j + 1} refId={c} onClick={onCite} />
              ))}
              .{" "}
            </span>
          ))}
        </p>
      )}
      {footer ? <div className="mt-3 text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  )
}

/** Small lavender info banner ("The AI worker picks up glossary changes on its next run."). */
export function AiNote({ children, className, aside }: { children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border border-ai-border bg-ai-soft px-4 py-3 text-sm text-ai", className)}>
      <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {aside ? <div className="shrink-0 font-mono text-xs">{aside}</div> : null}
    </div>
  )
}
