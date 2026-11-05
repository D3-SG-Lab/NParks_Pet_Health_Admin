"use client"

import { useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { Download, Lock, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/page-header"
import { EmptyState, QueryError } from "@/components/common/states"
import { StatusChip } from "@/components/common/status-chip"
import { Panel } from "@/components/common/surfaces"
import { DateTimePicker } from "@/components/forms/date-picker"
import { RequirePermission } from "@/components/layout/require-permission"
import {
  Pagination,
  Table,
  TableFooter,
  TableMessageRow,
  TableScroll,
  TableSkeletonRows,
  Td,
  Th,
  THead,
  Tr,
} from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { downloadCsv } from "@/lib/csv"
import { fmtTime } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import { exportAudit, getAuditEvent, getChainStatus, queryAudit, verifyAuditChain, type AuditQuery } from "@/services/audit"
import type { AuditEvent } from "@/types/domain"

import { AuditEventDetail } from "./audit-event-detail"
import { AUDIT_CSV_HEADERS, auditCsvRow } from "./audit-format"

interface Filters {
  animal: string
  caseId: string
  userId: string
  from: string
  to: string
  action: string
}

const EMPTY: Filters = { animal: "", caseId: "", userId: "all", from: "", to: "", action: "all" }

function toQuery(f: Filters): AuditQuery {
  return {
    animal: f.animal.trim() || undefined,
    caseId: f.caseId.trim() || undefined,
    userId: f.userId,
    from: f.from || undefined,
    to: f.to || undefined,
    action: f.action,
  }
}

export function AuditLogScreen() {
  return (
    <RequirePermission permission="audit" page="Audit log">
      <AuditLog />
    </RequirePermission>
  )
}

function ChainBadge() {
  const qc = useQueryClient()
  const { data, isPending } = useQuery({ queryKey: ["audit-chain"], queryFn: getChainStatus })
  const verify = useServiceMutation(verifyAuditChain, {
    onSuccess: (r) => {
      qc.setQueryData(["audit-chain"], r)
      if (r.ok) toast.success(`Hash chain verified · ${r.checked} events`)
      else toast.error(`Hash chain broken at ${r.brokenAt}`)
    },
  })
  if (isPending) return <span className="text-sm text-muted-foreground">Verifying chain…</span>
  if (!data) return null
  return (
    <button
      type="button"
      onClick={() => verify.mutate()}
      disabled={verify.isPending}
      title="Re-run hash chain verification"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none disabled:opacity-60",
        data.ok ? "text-success" : "text-destructive"
      )}
    >
      {data.ok ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldAlert className="size-4" aria-hidden />}
      {verify.isPending ? "Verifying…" : data.ok ? `Hash chain verified · ${fmtTime(data.verifiedAt)}` : `Chain broken at ${data.brokenAt}`}
    </button>
  )
}

function UserCell({ e }: { e: AuditEvent }) {
  if (!e.userId) {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="flex items-center gap-1 font-medium">
          <Sparkles className="size-3.5 text-ai-accent" aria-hidden /> AI worker
        </span>
        <StatusChip size="sm">System</StatusChip>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-medium whitespace-nowrap">{e.userName}</span>
      <StatusChip size="sm">{e.userRole}</StatusChip>
    </div>
  )
}

function AuditLog() {
  const params = useSearchParams()
  const [draft, setDraft] = useState<Filters>(EMPTY)
  const [applied, setApplied] = useState<Filters>(EMPTY)
  const [page, setPage] = useState(1)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("event"))
  const [sheetOpen, setSheetOpen] = useState(false)

  const query = { ...toQuery(applied), page, sortDir }
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["audit", query],
    queryFn: () => queryAudit(query),
    placeholderData: keepPreviousData,
  })

  const effectiveId = selectedId ?? data?.events[0]?.id ?? null
  const inPage = data?.events.find((e) => e.id === effectiveId)
  const { data: fetched } = useQuery({
    queryKey: ["audit-event", effectiveId],
    queryFn: () => getAuditEvent(effectiveId as string),
    enabled: Boolean(effectiveId) && !inPage,
  })
  const selected = inPage ?? fetched ?? null

  const exportMutation = useServiceMutation(() => exportAudit(toQuery(applied)), {
    onSuccess: (rows) => {
      downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}`, AUDIT_CSV_HEADERS, rows.map(auditCsvRow))
      toast.success(`Exported ${rows.length} rows · export recorded in the audit log`)
    },
  })

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    setApplied(draft)
    setPage(1)
    setSelectedId(null)
  }

  const onReset = () => {
    setDraft(EMPTY)
    setApplied(EMPTY)
    setPage(1)
    setSelectedId(null)
  }

  const select = (id: string) => {
    setSelectedId(id)
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) setSheetOpen(true)
  }

  if (error && !data) return <QueryError error={error} onRetry={() => refetch()} title="Couldn’t load the audit log" />

  const invalidRange = Boolean(draft.from && draft.to && draft.from > draft.to)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Append-only record of every create, update, status change, AI decision and login"
        meta={
          <StatusChip icon={<Lock className="size-3.5" aria-hidden />} className="h-8 px-3">
            Auditors &amp; admins only
          </StatusChip>
        }
        actions={
          <Button onClick={() => exportMutation.mutate()} loading={exportMutation.isPending}>
            {!exportMutation.isPending ? <Download /> : null} Export CSV
          </Button>
        }
      />

      <Panel className="p-5">
        <form
          onSubmit={onSearch}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
          aria-label="Audit filters"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-animal" className="text-sm font-semibold">
              Animal
            </label>
            <Input id="audit-animal" placeholder="Kennel or name" value={draft.animal} onChange={(e) => set("animal", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-case" className="text-sm font-semibold">
              Case
            </label>
            <Input
              id="audit-case"
              placeholder="e.g. C-0142"
              className="font-mono"
              value={draft.caseId}
              onChange={(e) => set("caseId", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-user" className="text-sm font-semibold">
              User
            </label>
            <Select value={draft.userId} onValueChange={(v) => set("userId", v)}>
              <SelectTrigger id="audit-user" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any user</SelectItem>
                <SelectItem value="system">AI worker / System</SelectItem>
                {data?.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">From</span>
            <DateTimePicker value={draft.from} onChange={(v) => set("from", v)} ariaLabel="From" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">To</span>
            <DateTimePicker value={draft.to} onChange={(v) => set("to", v)} invalid={invalidRange} ariaLabel="To" />
            {invalidRange ? <p className="text-[13px] text-destructive">“To” must be after “From”.</p> : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-action" className="text-sm font-semibold">
              Action
            </label>
            <Select value={draft.action} onValueChange={(v) => set("action", v)}>
              <SelectTrigger id="audit-action" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {data?.actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3 2xl:col-span-6">
            <Button type="button" variant="outline" onClick={onReset}>
              Reset
            </Button>
            <Button type="submit" disabled={invalidRange}>
              Search
            </Button>
          </div>
        </form>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="overflow-hidden">
          <TableScroll>
            <Table className="min-w-[680px]">
              <THead>
                <tr>
                  <th
                    scope="col"
                    aria-sort={sortDir === "desc" ? "descending" : "ascending"}
                    className="h-10 px-4 pl-5 text-left text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase hover:text-foreground"
                      onClick={() => {
                        setSortDir((d) => (d === "desc" ? "asc" : "desc"))
                        setPage(1)
                      }}
                    >
                      Time {sortDir === "desc" ? "↓" : "↑"}
                    </button>
                  </th>
                  <Th>User</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th align="right">Record</Th>
                </tr>
              </THead>
              <tbody>
                {isPending ? (
                  <TableSkeletonRows cols={5} rows={8} />
                ) : data && data.events.length === 0 ? (
                  <TableMessageRow cols={5}>
                    <EmptyState
                      icon="search"
                      title="No events match"
                      description="Try widening the date range or clearing filters."
                      action={
                        <Button variant="outline" size="sm" onClick={onReset}>
                          Clear filters
                        </Button>
                      }
                    />
                  </TableMessageRow>
                ) : (
                  data?.events.map((e) => (
                    <Tr key={e.id} selected={e.id === effectiveId} onClick={() => select(e.id)}>
                      <Td className="font-mono text-[13px] leading-5 whitespace-nowrap">
                        {e.at.slice(8, 10)}/{e.at.slice(5, 7)}
                        <br />
                        {e.at.slice(11, 19)}
                      </Td>
                      <Td>
                        <UserCell e={e} />
                      </Td>
                      <Td className="max-w-[200px]">{e.action}</Td>
                      <Td className="max-w-[240px]">{e.entityLabel}</Td>
                      <Td align="right">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            select(e.id)
                          }}
                          className="font-semibold text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                          aria-label={`View event ${e.id}`}
                        >
                          View
                        </button>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableScroll>
          <TableFooter>
            <span>{data ? `${data.total} event${data.total === 1 ? "" : "s"} match` : "—"}</span>
            <ChainBadge />
            {data ? <Pagination page={data.page} pages={data.pages} onPage={setPage} /> : null}
          </TableFooter>
        </Panel>

        <Panel as="aside" className="hidden self-start p-5 lg:block">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Event detail</h2>
            {selected ? <span className="font-mono text-xs text-muted-foreground">{selected.id}</span> : null}
          </div>
          {selected ? (
            <AuditEventDetail event={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">Select an event to see its before/after values and hashes.</p>
          )}
        </Panel>
      </div>

      <p className="text-xs text-muted-foreground">
        Audit rows cannot be updated or deleted through any API path. Exporting is itself recorded as an audit event.
      </p>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Event detail</SheetTitle>
            <SheetDescription className="font-mono">{selected?.id ?? ""}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{selected ? <AuditEventDetail event={selected} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
