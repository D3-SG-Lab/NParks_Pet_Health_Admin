"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Printer } from "lucide-react"

import { PanelSkeleton, QueryError } from "@/components/common/states"
import { Button } from "@/components/ui/button"
import { APP_CONFIG } from "@/config/app"
import { useUser } from "@/hooks/use-session"
import { nowISO } from "@/lib/clock"
import { fmtDate, fmtDateTime, fmtFull, fmtMicrochip } from "@/lib/format"
import { ANIMAL_STATUS, CASE_STATUS } from "@/lib/status"
import { getAnimal, getTimeline, recordAnimalExport } from "@/services/animals"

/** Print-friendly animal health record for a stay (BE-024: summary, timeline, evidence references). */
export function AnimalReport() {
  const { id } = useParams<{ id: string }>()
  const user = useUser()
  const detail = useQuery({ queryKey: ["animal", id], queryFn: () => getAnimal(id) })
  const timeline = useQuery({
    queryKey: ["timeline", id, "all", "stay", 1000],
    queryFn: () => getTimeline(id, { type: "all", period: "stay", limit: 1000 }),
  })
  const printed = useRef(false)

  const ready = detail.data && timeline.data
  useEffect(() => {
    if (!ready || printed.current) return
    printed.current = true
    const a = detail.data!.row.animal
    void recordAnimalExport(a.id, `${a.kennelCode} · ${a.name} · PDF`)
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [ready, detail.data])

  if (detail.isError) return <QueryError error={detail.error} onRetry={() => detail.refetch()} />
  if (timeline.isError) return <QueryError error={timeline.error} onRetry={() => timeline.refetch()} />
  if (!detail.data || !timeline.data) return <PanelSkeleton lines={10} />

  const { row, exam, cases, summary, medications } = detail.data
  const a = row.animal
  return (
    <div className="mx-auto max-w-[860px] space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href={`/animals/${a.id}`}>
            <ArrowLeft /> Back to record
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Print / Save as PDF
        </Button>
      </div>

      <article className="space-y-6 rounded-2xl border border-border bg-card p-6 sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="eyebrow">{APP_CONFIG.name} · Health record</p>
            <h1 className="mt-1 text-2xl font-semibold">
              {a.kennelCode} · {a.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {row.speciesName} · {a.breed} · {a.sex === "M" ? "Male" : "Female"} · DOB {fmtDate(a.dateOfBirth)} · {a.origin} · MC{" "}
              {fmtMicrochip(a.microchip)}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Status: {ANIMAL_STATUS[row.status].label}</p>
            <p>
              Stay {fmtDate(a.arrivalDate)} – {fmtDate(a.releasedAt ?? a.releaseDate)}
            </p>
            <p>
              Exported {fmtDateTime(nowISO())} by {user.name}
            </p>
          </div>
        </header>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">AI 30-day summary</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {summary.bullets.map((b, i) => (
              <li key={i}>
                {b.text} <span className="font-mono text-xs text-muted-foreground">[{b.citations.join(", ")}]</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <h2 className="text-base font-semibold">Arrival exam</h2>
            {exam ? (
              <>
                <p>
                  {fmtDateTime(exam.at)} · {exam.vetName} · {exam.weightKg.toFixed(1)} kg · {exam.mentation}
                </p>
                <p className="text-muted-foreground">
                  {exam.findings.map((f) => `${f.system}: ${f.normal ? "Normal" : `Abnormal (${f.note})`}`).join(" · ")}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Pending</p>
            )}
          </div>
          <div className="space-y-1 text-sm">
            <h2 className="text-base font-semibold">Cases & medication</h2>
            {cases.length === 0 ? <p className="text-muted-foreground">No health cases.</p> : null}
            {cases.map((c) => (
              <p key={c.id}>
                <span className="font-mono">{c.id}</span> · {c.title} · {CASE_STATUS[c.status].label}
              </p>
            ))}
            {medications.map((m) => (
              <p key={m.schedule.id} className="text-muted-foreground">
                {m.schedule.item} {m.schedule.dose} · {m.frequency}
              </p>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Timeline · {timeline.data.total} records</h2>
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-border text-xs text-muted-foreground uppercase">
              <tr>
                <th className="py-2 pr-3 font-semibold">Time</th>
                <th className="py-2 pr-3 font-semibold">Record</th>
                <th className="py-2 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {timeline.data.entries.map((e) => (
                <tr key={e.id} className="break-inside-avoid border-b border-border align-top">
                  <td className="py-1.5 pr-3 font-mono whitespace-nowrap">{fmtFull(e.at).slice(0, 16)}</td>
                  <td className="py-1.5 pr-3 font-semibold whitespace-nowrap">
                    {e.title}
                    {e.titleRef ? ` ${e.titleRef}` : ""}
                  </td>
                  <td className="py-1.5">
                    {e.detail}
                    {e.media.length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {e.media.length} evidence item(s): {e.media.map((m) => m.caption).join(", ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <footer className="border-t border-border pt-3 text-xs text-muted-foreground">
          Generated from the AQC Animal Health record. Exports respect the user’s kennel scope and are recorded in the audit log.
        </footer>
      </article>
    </div>
  )
}
