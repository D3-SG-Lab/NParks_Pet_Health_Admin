"use client"

import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Table primitives matching the workbench tables: uppercase 11px headers,
 * 64px rows, selected row tinted with a 3px teal left bar.
 * Wrap in <TableScroll> so wide tables scroll horizontally on small screens.
 */
export function TableScroll({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("thin-scroll relative w-full overflow-x-auto", className)}>{children}</div>
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-y border-border bg-subtle">{children}</thead>
}

export function Th({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode
  className?: string
  align?: "left" | "right" | "center"
}) {
  return (
    <th
      scope="col"
      className={cn(
        "h-10 px-4 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase first:pl-5 last:pr-5",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </th>
  )
}

export type SortDir = "asc" | "desc"

/** Clickable sortable column header ("KENNEL ↑"). */
export function SortTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align,
}: {
  label: string
  sortKey: K
  sort: { key: K; dir: SortDir }
  onSort: (sort: { key: K; dir: SortDir }) => void
  className?: string
  align?: "left" | "right"
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "h-10 px-4 text-[11px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase first:pl-5 last:pr-5",
        align === "right" && "text-right",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
        className={cn(
          "inline-flex items-center gap-1 uppercase hover:text-foreground focus-visible:underline focus-visible:outline-none",
          active && "text-foreground"
        )}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
      </button>
    </th>
  )
}

export function Tr({
  children,
  selected,
  onClick,
  className,
}: {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-b border-border transition-colors last:border-b-0",
        onClick && "cursor-pointer hover:bg-subtle",
        selected && "bg-selected shadow-[inset_3px_0_0_var(--primary)] hover:bg-selected",
        className
      )}
    >
      {children}
    </tr>
  )
}

export function Td({
  children,
  className,
  align = "left",
}: {
  children?: ReactNode
  className?: string
  align?: "left" | "right" | "center"
}) {
  return (
    <td
      className={cn(
        "h-16 px-4 align-middle first:pl-5 last:pr-5",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  )
}

/** Loading rows for tables (FE-025 "Loading"). */
export function TableSkeletonRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border last:border-b-0">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="h-16 px-4 first:pl-5 last:pr-5">
              {c === 0 ? (
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-2.5 w-14" />
                  </div>
                </div>
              ) : (
                <Skeleton className="h-3 w-[70%]" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Full-width cell for empty / error states inside a table body. */
export function TableMessageRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-10">
        {children}
      </td>
    </tr>
  )
}

/** Footer bar under a table: "Showing 1–10 of 42" + pagination / actions. */
export function TableFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5 text-sm text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}

function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1)
  if (page <= 3) return [1, 2, 3, "…", pages]
  if (page >= pages - 2) return [1, "…", pages - 2, pages - 1, pages]
  return [1, "…", page, "…", pages]
}

/** Numbered pagination (‹ 1 2 … 24 ›). */
export function Pagination({
  page,
  pages,
  onPage,
  className,
}: {
  page: number
  pages: number
  onPage: (page: number) => void
  className?: string
}) {
  if (pages <= 1) return null
  const btn =
    "inline-flex size-8 items-center justify-center rounded-lg border text-[13px] font-semibold tabular-nums transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none disabled:opacity-40"
  return (
    <nav aria-label="Pagination" className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        className={cn(btn, "border-border-strong bg-card text-foreground hover:bg-subtle")}
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </button>
      {pageList(page, pages).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className={cn(btn, "border-transparent")}>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              btn,
              p === page ? "border-navy bg-navy text-navy-foreground" : "border-border-strong bg-card text-foreground hover:bg-subtle"
            )}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        className={cn(btn, "border-border-strong bg-card text-foreground hover:bg-subtle")}
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  )
}

export function rangeLabel(page: number, pageSize: number, total: number, noun = "results"): string {
  if (total === 0) return `No ${noun}`
  const start = (page - 1) * pageSize + 1
  const end = Math.min(total, page * pageSize)
  return `Showing ${start}–${end} of ${total}`
}
