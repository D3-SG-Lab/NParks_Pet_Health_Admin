"use client"

import Link from "next/link"

import { AnimalAvatar } from "@/components/common/avatars"
import { KennelCode, StatusChip } from "@/components/common/status-chip"
import { SortTh, Table, TableScroll, Td, Th, THead, Tr, type SortDir } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UnwellRow, UnwellStatus } from "@/services/dashboard"

export type UnwellSortKey = "animal" | "status" | "next"

export const UNWELL_STATUS: Record<UnwellStatus, { label: string; tone: "warning" | "info" | "neutral"; dot: boolean }> = {
  needs_review: { label: "Needs review", tone: "warning", dot: true },
  open: { label: "Open", tone: "info", dot: true },
  monitoring: { label: "Monitoring", tone: "neutral", dot: false },
}

function Assigned({ row }: { row: UnwellRow }) {
  return row.assigneeId ? <span>{row.assigneeName}</span> : <span className="font-semibold text-warning">Unassigned</span>
}

function NextAction({ row }: { row: UnwellRow }) {
  return <span className={cn(row.nextAction.tone === "danger" && "font-semibold text-destructive")}>{row.nextAction.label}</span>
}

/** Desktop / tablet table of unwell animals (FE-021). */
export function UnwellTable({
  rows,
  selectedId,
  onSelect,
  onAssign,
  sort,
  onSort,
  canAssign,
}: {
  rows: UnwellRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAssign: (id: string) => void
  sort: { key: UnwellSortKey; dir: SortDir }
  onSort: (s: { key: UnwellSortKey; dir: SortDir }) => void
  canAssign: boolean
}) {
  return (
    <TableScroll>
      <Table className="min-w-[860px]">
        <THead>
          <tr>
            <SortTh label="Animal" sortKey="animal" sort={sort} onSort={onSort} />
            <SortTh label="Status" sortKey="status" sort={sort} onSort={onSort} />
            <Th>AI summary</Th>
            <Th>Assigned</Th>
            <SortTh label="Next action" sortKey="next" sort={sort} onSort={onSort} />
            <Th align="right">Action</Th>
          </tr>
        </THead>
        <tbody>
          {rows.map((r) => {
            const st = UNWELL_STATUS[r.status]
            return (
              <Tr key={r.animal.id} selected={r.animal.id === selectedId} onClick={() => onSelect(r.animal.id)}>
                <Td>
                  <div className="flex items-center gap-3">
                    <AnimalAvatar name={r.animal.name} speciesId={r.animal.speciesId} />
                    <div className="min-w-0">
                      <Link
                        href={`/animals/${r.animal.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block font-semibold hover:underline"
                      >
                        {r.animal.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {r.animal.kennelCode} · {r.speciesName}
                      </span>
                    </div>
                  </div>
                </Td>
                <Td>
                  <StatusChip tone={st.tone} dot={st.dot}>
                    {st.label}
                  </StatusChip>
                </Td>
                <Td className="max-w-[260px] text-[13px] leading-snug">{r.aiSummary}</Td>
                <Td className="whitespace-nowrap">
                  <Assigned row={r} />
                </Td>
                <Td className="max-w-[180px] text-[13px]">
                  <NextAction row={r} />
                </Td>
                <Td align="right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canAssign}
                    title={canAssign ? undefined : "Your role can't assign follow-ups"}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAssign(r.animal.id)
                    }}
                  >
                    Assign
                  </Button>
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </TableScroll>
  )
}

/** Narrow layout (p.16): one card per animal with Open record / Assign follow-up. */
export function UnwellCards({
  rows,
  selectedId,
  onAssign,
  canAssign,
}: {
  rows: UnwellRow[]
  selectedId: string | null
  onAssign: (id: string) => void
  canAssign: boolean
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const st = UNWELL_STATUS[r.status]
        const selected = r.animal.id === selectedId
        return (
          <li key={r.animal.id} className={cn("space-y-3 px-4 py-4", selected && "bg-selected shadow-[inset_3px_0_0_var(--primary)]")}>
            <div className="flex items-start gap-3">
              <AnimalAvatar name={r.animal.name} speciesId={r.animal.speciesId} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {r.animal.name} <KennelCode code={r.animal.kennelCode} />
                </p>
                <p className="text-xs text-muted-foreground">{r.speciesName}</p>
              </div>
              <StatusChip tone={st.tone} dot={st.dot}>
                {st.label}
              </StatusChip>
            </div>
            <p className="text-sm">{r.aiSummary}</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Assigned</dt>
                <dd className="font-semibold">
                  <Assigned row={r} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Next action</dt>
                <dd className="font-semibold">
                  <NextAction row={r} />
                </dd>
              </div>
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" asChild>
                <Link href={`/animals/${r.animal.id}`}>Open record</Link>
              </Button>
              <Button onClick={() => onAssign(r.animal.id)} disabled={!canAssign}>
                Assign follow-up
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
