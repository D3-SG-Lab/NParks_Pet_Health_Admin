"use client"

import { AnimalAvatar } from "@/components/common/avatars"
import { FilterChips, SearchInput } from "@/components/common/filters"
import { EmptyState, QueryError } from "@/components/common/states"
import { KennelCode, StatusChip } from "@/components/common/status-chip"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { fmtDayMonth, fmtRelative } from "@/lib/format"
import { CASE_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import type { CaseFilter, CaseListItem } from "@/services/cases"

import { shortName } from "./case-helpers"

export const CASE_FILTERS: { value: CaseFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "needs_review", label: "Needs review" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "assigned_to_me", label: "Assigned to me" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
]

const COUNTED: CaseFilter[] = ["open", "needs_review"]

interface CaseListProps {
  items: CaseListItem[] | undefined
  counts: Record<CaseFilter, number> | undefined
  isPending: boolean
  error: unknown
  onRetry: () => void
  filter: CaseFilter
  onFilter: (f: CaseFilter) => void
  search: string
  onSearch: (s: string) => void
  selectedId: string | null
  onSelect: (id: string) => void
}

function metaLine(item: CaseListItem) {
  const c = item.case
  if (c.status === "closed" && c.closedAt) {
    return (
      <>
        {c.id} · closed {fmtDayMonth(c.closedAt)} · {shortName(item.assigneeName)}
      </>
    )
  }
  return (
    <>
      {c.id} · {fmtRelative(c.updatedAt)} ·{" "}
      {c.assigneeId ? shortName(item.assigneeName) : <span className="font-semibold text-warning">unassigned</span>}
    </>
  )
}

/** Left list of the Health cases workbench (Admin_Design.pdf p.4). */
export function CaseList({
  items,
  counts,
  isPending,
  error,
  onRetry,
  filter,
  onFilter,
  search,
  onSearch,
  selectedId,
  onSelect,
}: CaseListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-4">
        <SearchInput value={search} onChange={onSearch} placeholder="Animal, kennel or case no." />
        <FilterChips
          ariaLabel="Filter cases"
          options={CASE_FILTERS.map((f) => ({ ...f, count: COUNTED.includes(f.value) ? counts?.[f.value] : undefined }))}
          value={filter}
          onChange={onFilter}
        />
      </div>

      {error ? (
        <QueryError error={error} onRetry={onRetry} title="Couldn’t load cases" />
      ) : isPending || !items ? (
        <div className="space-y-0" aria-busy="true" aria-label="Loading cases">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b border-border px-4 py-4">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={search ? "search" : "check"}
          title={search ? "No cases match" : "No cases here"}
          description={search ? `Nothing matches “${search}” with this filter.` : "Nothing matches this filter right now."}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onSearch("")
                onFilter("all")
              }}
            >
              Clear filters
            </Button>
          }
          className="px-4 py-10"
        />
      ) : (
        <ul className="thin-scroll flex-1 overflow-y-auto" aria-label="Health cases">
          {items.map((item) => {
            const c = item.case
            const selected = c.id === selectedId
            const status = CASE_STATUS[c.status]
            return (
              <li key={c.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors focus-visible:bg-subtle focus-visible:outline-none",
                    selected ? "bg-selected shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-subtle"
                  )}
                >
                  <AnimalAvatar name={item.animal.name} speciesId={item.animal.speciesId} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <KennelCode code={item.animal.kennelCode} className="h-5 text-[11px]" />
                      <span className="text-sm font-semibold text-foreground">{item.animal.name}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-foreground">{c.title}</span>
                    <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{metaLine(item)}</span>
                  </span>
                  <StatusChip tone={status.tone} size="sm" dot={c.status !== "closed"}>
                    {status.short}
                  </StatusChip>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
