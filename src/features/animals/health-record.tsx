"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { EvidenceViewer, MediaThumb } from "@/components/common/evidence"
import { FilterChips } from "@/components/common/filters"
import { EmptyState, PanelSkeleton, QueryError } from "@/components/common/states"
import { Panel, PanelHeader } from "@/components/common/surfaces"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fmtDayHeading, fmtTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { getTimeline, type TimelinePeriod } from "@/services/animals"
import type { TimelineEntry, TimelineType } from "@/services/derive"
import type { MediaRef } from "@/types/domain"

const PAGE = 7

const DOT: Record<TimelineEntry["tone"], string> = {
  success: "border-success text-success",
  abnormal: "border-abnormal text-abnormal",
  neutral: "border-muted-foreground text-muted-foreground",
  case: "border-navy text-navy",
}

export interface TimelineFocus {
  refId: string
  /** Increments on each citation click so the same ref can be re-focused. */
  nonce: number
}

/** Longitudinal health record (BE-020 / FE-014): filter by type & period, grouped by day. */
export function HealthRecord({
  animalId,
  arrivalDate,
  animalLabel,
  focus,
}: {
  animalId: string
  arrivalDate: string
  animalLabel: string
  focus: TimelineFocus | null
}) {
  const [type, setType] = useState<TimelineType | "all">("all")
  const [period, setPeriod] = useState<TimelinePeriod>("stay")
  const [limit, setLimit] = useState(PAGE)
  const [viewer, setViewer] = useState<{ items: MediaRef[]; index: number | null; title: string }>({ items: [], index: null, title: "" })
  const [appliedFocus, setAppliedFocus] = useState<number | null>(null)

  // A new citation click resets the filters so the cited record is guaranteed to be listed.
  if (focus && focus.nonce !== appliedFocus) {
    setAppliedFocus(focus.nonce)
    setType("all")
    setPeriod("stay")
    setLimit(500)
  }

  const q = useQuery({
    queryKey: ["timeline", animalId, type, period, limit],
    queryFn: () => getTimeline(animalId, { type, period, limit }),
    placeholderData: keepPreviousData,
  })

  useEffect(() => {
    if (!focus || !q.data) return
    const el = document.querySelector<HTMLElement>(`[data-ref="${CSS.escape(focus.refId)}"]`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focus, q.data])

  const groups: { day: string; entries: TimelineEntry[] }[] = []
  for (const e of q.data?.entries ?? []) {
    const day = e.at.slice(0, 10)
    const g = groups.at(-1)
    if (g && g.day === day) g.entries.push(e)
    else groups.push({ day, entries: [e] })
  }

  const resetLimit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setLimit(PAGE)
    }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Health record"
        actions={
          <FilterChips
            ariaLabel="Record type"
            value={type}
            onChange={resetLimit(setType)}
            options={[
              { value: "all", label: "All" },
              { value: "inspection", label: "Inspections" },
              { value: "observation", label: "Observations" },
              { value: "medication", label: "Medication" },
              { value: "case", label: "Cases" },
              { value: "exam", label: "Exam" },
            ]}
          />
        }
      />
      <div className="px-5 pb-4">
        <Select value={period} onValueChange={(v) => resetLimit(setPeriod)(v as TimelinePeriod)}>
          <SelectTrigger className="w-[170px]" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stay">Whole stay</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="border-t border-border">
        {q.isPending ? (
          <PanelSkeleton lines={6} />
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load the health record" />
        ) : groups.length === 0 ? (
          <EmptyState icon="search" title="No records" description="Nothing recorded for this filter and period." />
        ) : (
          <ol className="px-5 py-2">
            {groups.map((g) => (
              <li key={g.day} className="border-b border-border py-3 last:border-b-0">
                <h3 className="mb-2 text-sm font-semibold">
                  {fmtDayHeading(g.day)}
                  {g.day === arrivalDate ? " · Arrival" : ""}
                </h3>
                <ol className="relative">
                  {g.entries.map((e, i) => (
                    <li
                      key={e.id}
                      data-ref={e.refId}
                      className={cn(
                        "relative grid grid-cols-[44px_20px_minmax(0,1fr)] gap-x-3 rounded-lg py-2 transition-colors",
                        focus?.refId === e.refId && "bg-ai-soft ring-1 ring-ai-border"
                      )}
                    >
                      <span className="pt-0.5 font-mono text-xs text-muted-foreground">{fmtTime(e.at)}</span>
                      <span className="relative flex justify-center">
                        {i < g.entries.length - 1 ? <span className="absolute top-5 bottom-[-12px] w-px bg-border" aria-hidden /> : null}
                        <span
                          className={cn(
                            "relative mt-0.5 inline-flex size-4 items-center justify-center rounded-full border-2 bg-card",
                            DOT[e.tone]
                          )}
                          aria-hidden
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                        </span>
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {e.title}
                          {e.titleRef ? (
                            e.href ? (
                              <Link href={e.href} className="ml-1 font-mono text-[13px] text-primary hover:underline">
                                {e.titleRef}
                              </Link>
                            ) : (
                              <span className="ml-1 font-mono text-[13px] text-muted-foreground">{e.titleRef}</span>
                            )
                          ) : null}
                        </p>
                        <p
                          className={cn(
                            "text-[13px] text-muted-foreground",
                            e.tone === "abnormal" && e.type === "inspection" && "text-abnormal"
                          )}
                        >
                          {e.detail}
                        </p>
                        {e.media.length ? (
                          <div className="mt-2 flex gap-2">
                            {e.media.map((m, idx) => (
                              <MediaThumb
                                key={m.id}
                                media={m}
                                size="sm"
                                onClick={() => setViewer({ items: e.media, index: idx, title: animalLabel })}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5 text-sm text-muted-foreground">
        <span>{q.data ? `Showing ${q.data.entries.length} of ${q.data.total} records` : ""}</span>
        {q.data && q.data.entries.length < q.data.total ? (
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE * 2)} loading={q.isFetching}>
            Load earlier
          </Button>
        ) : null}
      </div>
      <EvidenceViewer
        items={viewer.items}
        index={viewer.index}
        onIndexChange={(index) => setViewer((v) => ({ ...v, index }))}
        title={viewer.title}
      />
    </Panel>
  )
}
