"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Printer } from "lucide-react"

import { AiSummaryCard } from "@/components/common/ai-card"
import { MediaThumb } from "@/components/common/evidence"
import { PanelSkeleton, QueryError } from "@/components/common/states"
import { StatusChip } from "@/components/common/status-chip"
import { Panel, SectionLabel } from "@/components/common/surfaces"
import { Button } from "@/components/ui/button"
import { APP_CONFIG } from "@/config/app"
import { nowISO } from "@/lib/clock"
import { fmtDate, fmtDateTime } from "@/lib/format"
import { CASE_STATUS } from "@/lib/status"
import { CLOSE_REASON_LABEL, getCase, recordCaseExport } from "@/services/cases"

/**
 * Print-friendly case report (BE-024: summary, timeline, evidence thumbnails).
 * "Case report PDF" opens this page; the browser's print dialog saves it as PDF.
 * The export is recorded in the audit log.
 */
export function CaseReport() {
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(params.id)
  const q = useQuery({ queryKey: ["case", id], queryFn: () => getCase(id) })
  const exported = useRef(false)

  useEffect(() => {
    if (!q.data || exported.current) return
    exported.current = true
    void recordCaseExport([q.data.case.id], "PDF")
    const t = window.setTimeout(() => window.print(), 400)
    return () => window.clearTimeout(t)
  }, [q.data])

  if (q.error) return <QueryError error={q.error} onRetry={() => void q.refetch()} title="Couldn’t load the case report" />
  if (q.isPending) return <PanelSkeleton lines={10} />

  const d = q.data
  const c = d.case
  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/cases?id=${encodeURIComponent(c.id)}`}>
            <ArrowLeft /> Back to case
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Print / save as PDF
        </Button>
      </div>
      <Panel className="space-y-6 p-6 sm:p-8 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="eyebrow">{APP_CONFIG.name} · Case report</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {c.id} · {c.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {d.animal.kennelCode} {d.animal.name} · {d.speciesName} · Day {d.stay.day} of {d.stay.total} · MC {d.animal.microchip}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <StatusChip tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</StatusChip>
            <p className="mt-2">Generated {fmtDateTime(nowISO())}</p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Opened</dt>
            <dd className="font-medium">
              {fmtDate(c.openedAt)} · {d.openedByName}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Assigned to</dt>
            <dd className="font-medium">{c.assigneeId ? d.assigneeName : "Unassigned"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Observations</dt>
            <dd className="font-medium">{d.observationCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Closed</dt>
            <dd className="font-medium">
              {c.closedAt && c.status === "closed" ? `${fmtDate(c.closedAt)} · ${CLOSE_REASON_LABEL[c.closeReason ?? "other"]}` : "—"}
            </dd>
          </div>
        </dl>
        {c.status === "closed" && c.closeNote ? <p className="text-sm">Closing note: {c.closeNote}</p> : null}

        <AiSummaryCard title="Case summary · AI" summary={d.summary} variant="list" />

        <section>
          <SectionLabel>Follow-up actions</SectionLabel>
          <ul className="mt-2 divide-y divide-border text-sm">
            {d.followUps.length === 0 ? <li className="py-2 text-muted-foreground">None</li> : null}
            {d.followUps.map((f) => (
              <li key={f.id} className="flex justify-between gap-4 py-2">
                <span className={f.done ? "text-muted-foreground line-through" : ""}>
                  {f.action} · {f.assigneeName}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {f.done && f.doneAt ? `done ${fmtDateTime(f.doneAt)}` : `due ${fmtDateTime(f.dueAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionLabel>Linked observations &amp; events</SectionLabel>
          <ol className="mt-2 divide-y divide-border text-sm">
            {d.linked.map((l) => (
              <li key={l.id} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-2.5">
                <span className="font-mono text-xs text-muted-foreground">{fmtDateTime(l.at)}</span>
                <span>
                  <span className="block text-xs text-muted-foreground">
                    {l.id} · {l.meta}
                  </span>
                  {l.text}
                  {l.media.length ? (
                    <span className="mt-1.5 flex gap-1.5">
                      {l.media.map((m) => (
                        <MediaThumb key={m.id} media={m} size="sm" />
                      ))}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <SectionLabel>Evidence · {c.evidence.length}</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {c.evidence.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : null}
            {c.evidence.map((m) => (
              <figure key={m.id} className="w-[88px] text-center">
                <MediaThumb media={m} />
                <figcaption className="mt-1 truncate text-[11px] text-muted-foreground">{m.caption}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Notes</SectionLabel>
          <ul className="mt-2 space-y-2 text-sm">
            {d.notes.length === 0 ? <li className="text-muted-foreground">None</li> : null}
            {d.notes.map((n) => (
              <li key={n.id}>
                <span className="font-semibold">{n.authorName}</span>{" "}
                <span className="font-mono text-xs text-muted-foreground">{fmtDateTime(n.at)}</span>
                <p>{n.text}</p>
              </li>
            ))}
          </ul>
        </section>
        <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
          AI-generated summary statements cite their source records. This export is recorded in the audit log and respects your access
          scope.
        </footer>
      </Panel>
    </div>
  )
}
