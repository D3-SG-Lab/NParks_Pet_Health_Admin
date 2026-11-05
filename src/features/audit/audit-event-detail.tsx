"use client"

import Link from "next/link"

import { fmtFull } from "@/lib/format"
import { shortHash } from "@/lib/hash"
import { cn } from "@/lib/utils"
import type { AuditEvent } from "@/types/domain"

import { entityHref, snapshotLines } from "./audit-format"

function Snapshot({ label, value, tone }: { label: string; value: Record<string, unknown> | null; tone: "before" | "after" }) {
  const lines = snapshotLines(value)
  return (
    <div>
      <p className="eyebrow mb-1.5">{label}</p>
      {lines.length === 0 ? (
        <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">—</p>
      ) : (
        <pre
          className={cn(
            "thin-scroll overflow-x-auto rounded-lg px-3 py-2.5 font-mono text-xs leading-5 break-all whitespace-pre-wrap",
            tone === "before" ? "bg-abnormal-tile text-abnormal" : "bg-success-soft text-success"
          )}
        >
          {lines.join("\n")}
        </pre>
      )}
    </div>
  )
}

/** Event detail panel (Audit log p.8). */
export function AuditEventDetail({ event }: { event: AuditEvent }) {
  const href = entityHref(event)
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Action", value: event.action },
    { label: "User", value: event.userId ? `${event.userName} · ${event.idp}` : "AI worker · System" },
    { label: "Time", value: <span className="font-mono">{fmtFull(event.at)}</span> },
    {
      label: "Entity",
      value: href ? (
        <Link href={href} className="text-primary underline underline-offset-2 hover:text-primary-hover">
          {event.entityLabel}
        </Link>
      ) : (
        event.entityLabel
      ),
    },
    { label: "Source", value: event.source },
  ]
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 font-semibold break-words text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
      <Snapshot label="Before" value={event.before} tone="before" />
      <Snapshot label="After" value={event.after} tone="after" />
      <div className="space-y-1 border-t border-border pt-3 font-mono text-xs text-muted-foreground">
        <p>
          Prev hash{" "}
          <span className="text-foreground" title={event.prevHash}>
            {shortHash(event.prevHash)}
          </span>
        </p>
        <p>
          This hash{" "}
          <span className="text-foreground" title={event.hash}>
            {shortHash(event.hash)}
          </span>
        </p>
      </div>
    </div>
  )
}
