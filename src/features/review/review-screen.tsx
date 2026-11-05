"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { PageHeader } from "@/components/common/page-header"
import { EmptyState, PanelSkeleton, QueryError } from "@/components/common/states"
import { StatusChip } from "@/components/common/status-chip"
import { Panel } from "@/components/common/surfaces"
import { RequirePermission } from "@/components/layout/require-permission"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { percent } from "@/lib/format"
import { cn } from "@/lib/utils"
import { listReviewQueue, ROUTING_LABEL, type QueueItem, type QueueSort } from "@/services/observations"
import { getReferenceData } from "@/services/reference"

import { pluralCount, timeOrDay, waitingLabel } from "../cases/case-helpers"
import { reasonChip, reporterLabel } from "./review-helpers"
import { TriagePanel } from "./triage-panel"

function subLine(item: QueueItem): string {
  const o = item.observation
  const photos = o.media.filter((m) => m.kind === "photo").length
  const media = o.media.length ? pluralCount(o.media.length, photos === o.media.length ? "photo" : "attachment") : null
  const reason = o.ai?.reviewReason
  if (o.aiStatus === "awaiting_confirmation" || reason === "low_confidence") {
    const s = item.suggestedAnimal
    return s
      ? `Suggested: ${s.kennelCode} ${s.name} · ${o.ai?.suggestedAction ? ROUTING_LABEL[o.ai.suggestedAction] : "Timeline only"}`
      : `Waiting ${waitingLabel(item.waitingMinutes)}`
  }
  if (reason === "unavailable") return ["Needs manual routing", media].filter(Boolean).join(" · ")
  return [media, `waiting ${waitingLabel(item.waitingMinutes)}`].filter(Boolean).join(" · ")
}

function ReviewQueue() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [sort, setSort] = useState<QueueSort>("oldest")
  const q = useQuery({ queryKey: ["review-queue", sort], queryFn: () => listReviewQueue(sort) })
  const ref = useQuery({ queryKey: ["reference"], queryFn: getReferenceData })
  const items = q.data?.items ?? []
  const paramId = params.get("id")
  const selected = items.find((i) => i.observation.id === paramId) ?? items[0] ?? null
  const threshold = ref.data?.settings.aiConfidenceThreshold ?? 0.8

  const select = (id: string | null) => router.replace(id ? `${pathname}?id=${encodeURIComponent(id)}` : pathname, { scroll: false })

  const onDone = (mode: "triaged" | "skipped") => {
    if (!selected) return
    const idx = items.findIndex((i) => i.observation.id === selected.observation.id)
    const rest = items.filter((i) => i.observation.id !== selected.observation.id)
    const next = rest[idx] ?? rest[0] ?? (mode === "skipped" ? selected : null)
    select(next ? next.observation.id : null)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review queue"
        description={`Observations the AI could not match, or scored below the ${percent(threshold)} confidence threshold. Pick the animal and case action manually.`}
        meta={
          q.data ? (
            <>
              <StatusChip tone="warning">{items.length} to triage</StatusChip>
              <StatusChip tone="success">{q.data.triagedToday} triaged today</StatusChip>
            </>
          ) : null
        }
      />
      {q.error ? (
        <Panel>
          <QueryError error={q.error} onRetry={() => void q.refetch()} title="Couldn’t load the review queue" />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <Panel className={cn("self-start overflow-hidden", paramId && "hidden lg:block")}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">Queue</h2>
              <Select value={sort} onValueChange={(v) => setSort(v as QueueSort)}>
                <SelectTrigger size="sm" className="w-[160px]" aria-label="Sort queue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="confidence">Lowest confidence</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {q.isPending ? (
              <div aria-busy="true" aria-label="Loading queue">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2 border-b border-border p-4">
                    <Skeleton className="h-5 w-32 rounded-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                title="Queue is clear"
                description="Every observation has been matched and routed. New items appear here when the AI needs help."
                className="px-4 py-10"
              />
            ) : (
              <ul aria-label="Observations to triage">
                {items.map((item) => {
                  const o = item.observation
                  const chip = reasonChip(item)
                  const active = selected?.observation.id === o.id
                  return (
                    <li key={o.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => select(o.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full px-4 py-3.5 text-left transition-colors focus-visible:bg-subtle focus-visible:outline-none",
                          active ? "bg-selected shadow-[inset_3px_0_0_var(--primary)]" : "hover:bg-subtle"
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <StatusChip size="sm" tone={chip.tone} dot={chip.dot}>
                            {chip.label}
                          </StatusChip>
                          <span className="truncate text-xs text-muted-foreground">
                            {timeOrDay(o.createdAt)} · {reporterLabel(item).replace(/, .*\)$/, ")")}
                          </span>
                        </span>
                        <span className="mt-2 line-clamp-3 block text-sm font-medium text-foreground">“{o.text}”</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {subLine(item)}
                          {o.skippedCount ? ` · skipped ${o.skippedCount}×` : ""}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
          <Panel className={cn("min-w-0 overflow-visible", !paramId && "hidden lg:block")}>
            {q.isPending ? (
              <PanelSkeleton lines={8} />
            ) : selected ? (
              <TriagePanel key={selected.observation.id} item={selected} onDone={onDone} onBack={() => select(null)} />
            ) : (
              <EmptyState title="Nothing to triage" description="Pick an item from the queue when one arrives." className="py-16" />
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

/** Review queue (FE-017, BE-019; Admin_Design.pdf p.5). Officers, vets and supervisors only. */
export function ReviewScreen() {
  return (
    <RequirePermission permission="triage" page="Review queue">
      <ReviewQueue />
    </RequirePermission>
  )
}
