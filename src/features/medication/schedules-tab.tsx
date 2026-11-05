"use client"

import Link from "next/link"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Pencil, Plus, Square } from "lucide-react"

import { AnimalAvatar } from "@/components/common/avatars"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { SearchInput } from "@/components/common/filters"
import { EmptyState, QueryError } from "@/components/common/states"
import { StatusChip, type ChipTone } from "@/components/common/status-chip"
import { Panel } from "@/components/common/surfaces"
import { Field } from "@/components/forms/field"
import {
  Pagination,
  rangeLabel,
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useDebounced } from "@/hooks/use-debounced"
import { usePermission } from "@/hooks/use-session"
import { fmtDayMonth } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { listSchedules, stopSchedule, type ScheduleRow } from "@/services/medication"

import { ScheduleForm } from "./schedule-form"

const PAGE = 10
type StateFilter = ScheduleRow["state"] | "all"

const STATE: Record<ScheduleRow["state"], { label: string; tone: ChipTone }> = {
  active: { label: "Active", tone: "success" },
  upcoming: { label: "Upcoming", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
  stopped: { label: "Stopped", tone: "danger" },
}

export function SchedulesTab() {
  const canRecord = usePermission("record")
  const [search, setSearch] = useState("")
  const [state, setState] = useState<StateFilter>("all")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<ScheduleRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [stopping, setStopping] = useState<ScheduleRow | null>(null)
  const [reason, setReason] = useState("")
  const debounced = useDebounced(search)

  const q = useQuery({ queryKey: ["medication-schedules", debounced, state], queryFn: () => listSchedules({ search: debounced, state }) })
  const rows = q.data ?? []
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * PAGE, current * PAGE)

  const stop = useServiceMutation(() => stopSchedule(stopping!.schedule.id, reason), {
    success: () => `Stopped ${stopping?.schedule.item} for ${stopping?.animal.name}`,
    onSuccess: () => {
      setStopping(null)
      setReason("")
    },
  })

  return (
    <Panel>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
        <SearchInput
          className="sm:max-w-sm sm:flex-1"
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder="Animal, kennel or item"
        />
        <Select
          value={state}
          onValueChange={(v) => {
            setState(v as StateFilter)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-[170px]" aria-label="Schedule state">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
            <SelectItem value="stopped">Stopped</SelectItem>
          </SelectContent>
        </Select>
        {canRecord ? (
          <Button className="sm:ml-auto" onClick={() => setAdding(true)}>
            <Plus /> Add schedule
          </Button>
        ) : null}
      </div>
      {q.isError ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load schedules" />
      ) : (
        <TableScroll>
          <Table className="min-w-[860px]">
            <THead>
              <tr>
                <Th>Animal</Th>
                <Th>Item &amp; dose</Th>
                <Th>Frequency</Th>
                <Th>Period</Th>
                <Th>Linked case</Th>
                <Th>State</Th>
                <Th align="right">Actions</Th>
              </tr>
            </THead>
            <tbody>
              {q.isPending ? (
                <TableSkeletonRows cols={7} rows={6} />
              ) : visible.length === 0 ? (
                <TableMessageRow cols={7}>
                  <EmptyState icon="search" title="No schedules match" description="Try another search or state." />
                </TableMessageRow>
              ) : (
                visible.map((r) => {
                  const editable = canRecord && (r.state === "active" || r.state === "upcoming")
                  return (
                    <Tr key={r.schedule.id}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <AnimalAvatar name={r.animal.name} speciesId={r.animal.speciesId} />
                          <div>
                            <p className="font-semibold">{r.animal.name}</p>
                            <p className="text-xs text-muted-foreground">{r.animal.kennelCode}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <p className="font-semibold">{r.schedule.item}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.schedule.dose} · {r.schedule.route}
                          {r.schedule.site ? ` · ${r.schedule.site}` : ""}
                        </p>
                      </Td>
                      <Td>
                        <p>{r.frequency}</p>
                        <p className="font-mono text-xs text-muted-foreground">{r.schedule.doseTimes.join(" · ")}</p>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {fmtDayMonth(r.schedule.startDate)}–{fmtDayMonth(r.schedule.endDate)}
                      </Td>
                      <Td>
                        {r.schedule.caseId ? (
                          <Link
                            href={`/cases?id=${r.schedule.caseId}`}
                            className="font-mono text-[13px] font-semibold text-primary hover:underline"
                          >
                            {r.schedule.caseId}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                      <Td>
                        <StatusChip tone={STATE[r.state].tone} dot={r.state === "active"}>
                          {STATE[r.state].label}
                        </StatusChip>
                      </Td>
                      <Td align="right">
                        {editable ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing(r)}
                              aria-label={`Edit ${r.schedule.item} for ${r.animal.name}`}
                            >
                              <Pencil /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive-outline"
                              onClick={() => setStopping(r)}
                              aria-label={`Stop ${r.schedule.item} for ${r.animal.name}`}
                            >
                              <Square /> Stop
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">by {r.createdByName}</span>
                        )}
                      </Td>
                    </Tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </TableScroll>
      )}
      <TableFooter>
        <span>{rangeLabel(current, PAGE, rows.length, "schedules")}</span>
        <Pagination page={current} pages={pages} onPage={setPage} />
      </TableFooter>

      <Dialog
        open={Boolean(editing) || adding}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null)
            setAdding(false)
          }
        }}
      >
        <DialogContent className="thin-scroll max-h-[92vh] gap-5 overflow-y-auto rounded-2xl p-6 sm:max-w-[520px]">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-semibold">
              {editing ? `Edit schedule · ${editing.animal.name}` : "Add schedule"}
            </DialogTitle>
            <DialogDescription>
              {editing ? `${editing.animal.kennelCode} · changes are audited` : "Schedules appear in the due list on their start date."}
            </DialogDescription>
          </DialogHeader>
          <ScheduleForm
            key={editing?.schedule.id ?? "new"}
            schedule={editing?.schedule}
            idPrefix="dlg-sched"
            onDone={() => {
              setEditing(null)
              setAdding(false)
            }}
            onCancel={() => {
              setEditing(null)
              setAdding(false)
            }}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(stopping)}
        onOpenChange={(o) => {
          if (!o) {
            setStopping(null)
            setReason("")
          }
        }}
        title={`Stop ${stopping?.schedule.item ?? "schedule"}?`}
        description={
          stopping
            ? `${stopping.animal.kennelCode} ${stopping.animal.name} · no further doses will be due. Recorded doses are kept and the change is audited.`
            : undefined
        }
        confirmLabel="Stop schedule"
        destructive
        icon={<Square className="size-5" />}
        loading={stop.isPending}
        onConfirm={() => stop.mutate()}
      >
        <Field label="Reason" htmlFor="stop-reason" hint="Optional — e.g. course completed early, vet instruction">
          <Textarea
            id="stop-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional"
            className="min-h-16"
          />
        </Field>
      </ConfirmDialog>
    </Panel>
  )
}
