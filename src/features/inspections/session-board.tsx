"use client"

import { Check, Clock3, Stethoscope } from "lucide-react"

import { cn } from "@/lib/utils"
import type { BoardBlock, BoardTile } from "@/services/inspections"

const LEGEND = [
  { label: "Done", className: "bg-success" },
  { label: "Abnormal", className: "bg-abnormal" },
  { label: "Due", className: "bg-border-strong" },
  { label: "Overdue", className: "bg-destructive" },
]

export function BoardLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground" aria-label="Legend">
      {LEGEND.map((l) => (
        <li key={l.label} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[3px]", l.className)} aria-hidden />
          {l.label}
        </li>
      ))}
    </ul>
  )
}

function tileClasses(tile: BoardTile): string {
  if (!tile.animal) return "border-dashed border-border-strong bg-subtle text-center"
  switch (tile.check?.state) {
    case "done":
      return "border-success-border bg-success-tile"
    case "abnormal":
      return "border-abnormal-border bg-abnormal-tile"
    case "overdue":
      return "border-destructive-border bg-destructive-tile"
    default:
      return "border-border bg-card"
  }
}

function StatusLine({ tile }: { tile: BoardTile }) {
  const state = tile.check?.state
  if (state === "done")
    return (
      <span className="flex items-center gap-1.5 text-success">
        <Check className="size-3.5 shrink-0" aria-hidden />
        {tile.label}
      </span>
    )
  if (state === "abnormal") return <span className="text-abnormal">{tile.label}</span>
  if (state === "overdue")
    return (
      <span className="flex items-center gap-1.5 text-destructive">
        <Clock3 className="size-3.5 shrink-0" aria-hidden />
        {tile.label}
      </span>
    )
  if (state === "not_applicable")
    return (
      <span className="flex items-center gap-1.5 text-info">
        <Stethoscope className="size-3.5 shrink-0" aria-hidden />
        {tile.label}
      </span>
    )
  return <span className="text-muted-foreground">{tile.label}</span>
}

function Tile({ tile, onOpen }: { tile: BoardTile; onOpen: (tile: BoardTile) => void }) {
  const base = cn("flex min-h-[100px] flex-col rounded-xl border p-3.5 text-left text-[13px] font-semibold", tileClasses(tile))
  if (!tile.animal) {
    return (
      <div className={cn(base, "items-center justify-center gap-1")}>
        <span className="font-mono text-[13px] text-muted-foreground">{tile.kennel.code}</span>
        <span className="text-[15px] text-muted-foreground">Vacant</span>
        <span className="text-xs font-normal text-muted-foreground">{tile.label === "Vacant" ? "Available" : tile.label}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(tile)}
      aria-label={`${tile.kennel.code} ${tile.animal.name}: ${tile.label}`}
      className={cn(
        base,
        "transition-shadow hover:shadow-[var(--shadow-raised)] focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-none"
      )}
    >
      <span className="font-mono text-[13px] text-foreground">{tile.kennel.code}</span>
      <span className="mt-1.5 truncate text-[15px] text-foreground">{tile.animal.name}</span>
      <span className="mt-auto pt-2 text-[13px]">
        <StatusLine tile={tile} />
      </span>
    </button>
  )
}

export function BoardBlockSection({ block, onOpen }: { block: BoardBlock; onOpen: (tile: BoardTile) => void }) {
  const title = block.block.kind === "kennel" ? `Kennel block ${block.block.code}` : block.block.name
  const meta = [
    `${block.done} of ${block.expected} done`,
    block.vacant ? `${block.vacant} kennel${block.vacant === 1 ? "" : "s"} vacant` : null,
    block.assignedTo.length ? `assigned ${block.assignedTo.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <section aria-label={title} className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        <p className="text-[13px] text-muted-foreground">{meta}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {block.tiles.map((t) => (
          <Tile key={t.kennel.code} tile={t} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
