"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { AnimalAvatar } from "@/components/common/avatars"
import { FilterChips } from "@/components/common/filters"
import { EmptyState, QueryError } from "@/components/common/states"
import { StatusChip } from "@/components/common/status-chip"
import { Panel, PanelHeader } from "@/components/common/surfaces"
import { Table, TableFooter, TableMessageRow, TableScroll, TableSkeletonRows, Td, Th, THead, Tr } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { usePermission } from "@/hooks/use-session"
import { fmtDayMonth, fmtTime } from "@/lib/format"
import { listAnimals } from "@/services/animals"
import { listDueToday, type DueFilter, type DueRow } from "@/services/medication"

import { RecordDoseDialog } from "./record-dose-dialog"
import { ScheduleForm } from "./schedule-form"

const PREVIEW = 6

function overdueLabel(min: number) {
  return min >= 60 ? `Overdue ${Math.floor(min / 60)} h` : `Overdue ${Math.max(1, min)} min`
}

export function DoseStatusChip({ row }: { row: DueRow }) {
  switch (row.status) {
    case "overdue":
      return (
        <StatusChip tone="danger" dot>
          {overdueLabel(row.overdueMinutes)}
        </StatusChip>
      )
    case "partial":
      return (
        <StatusChip tone="neutral">
          {row.givenCount} of {row.schedule.doseTimes.length} given
        </StatusChip>
      )
    case "recorded":
      return (
        <StatusChip tone="success" dot>
          Recorded {row.recordedAt ? fmtTime(row.recordedAt) : ""}
        </StatusChip>
      )
    default:
      return <StatusChip tone="info">Due</StatusChip>
  }
}

function DueTable({ selectedAnimalId, onSelectAnimal }: { selectedAnimalId: string | null; onSelectAnimal: (id: string) => void }) {
  const canRecord = usePermission("record")
  const [filter, setFilter] = useState<DueFilter>("all")
  const [showAll, setShowAll] = useState(false)
  const [recordRow, setRecordRow] = useState<DueRow | null>(null)
  const q = useQuery({ queryKey: ["medication-due", filter], queryFn: () => listDueToday(filter) })

  const rows = useMemo(() => q.data?.rows ?? [], [q.data])
  const visible = showAll ? rows : rows.slice(0, PREVIEW)

  return (
    <Panel className="min-w-0">
      <PanelHeader
        title="Due & overdue"
        actions={
          <FilterChips
            ariaLabel="Filter doses"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: q.data?.counts.all },
              { value: "overdue", label: "Overdue", count: q.data?.counts.overdue },
              { value: "next_2h", label: "Next 2 h", count: q.data?.counts.next_2h },
            ]}
          />
        }
      />
      {q.isError ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load today’s doses" />
      ) : (
        <TableScroll>
          <Table className="min-w-[760px]">
            <THead>
              <tr>
                <Th>Animal</Th>
                <Th>Item &amp; dose</Th>
                <Th>Frequency</Th>
                <Th>Due ↑</Th>
                <Th>Status</Th>
                <Th align="right">Action</Th>
              </tr>
            </THead>
            <tbody>
              {q.isPending ? (
                <TableSkeletonRows cols={6} rows={5} />
              ) : visible.length === 0 ? (
                <TableMessageRow cols={6}>
                  <EmptyState
                    title={
                      filter === "overdue"
                        ? "No overdue doses"
                        : filter === "next_2h"
                          ? "Nothing due in the next 2 hours"
                          : "No medication due today"
                    }
                    description={filter === "all" ? "Add a schedule to start tracking doses." : "Everything in this view has been given."}
                    action={
                      filter !== "all" ? (
                        <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                          Show all
                        </Button>
                      ) : undefined
                    }
                  />
                </TableMessageRow>
              ) : (
                visible.map((r) => (
                  <Tr key={r.schedule.id} selected={r.animal.id === selectedAnimalId} onClick={() => onSelectAnimal(r.animal.id)}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <AnimalAvatar name={r.animal.name} speciesId={r.animal.speciesId} />
                        <div className="min-w-0">
                          <p className={r.status === "recorded" ? "font-medium text-muted-foreground" : "font-semibold"}>{r.animal.name}</p>
                          <p className="text-xs text-muted-foreground">{r.animal.kennelCode}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <p className={r.status === "recorded" ? "font-medium text-muted-foreground" : "font-semibold"}>{r.schedule.item}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.schedule.dose} · {r.schedule.site || r.schedule.route.toLowerCase()}
                      </p>
                    </Td>
                    <Td>
                      <p>{r.frequency}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDayMonth(r.schedule.startDate)}–{fmtDayMonth(r.schedule.endDate)}
                      </p>
                    </Td>
                    <Td className="font-mono">{r.dueTime}</Td>
                    <Td>
                      <DoseStatusChip row={r} />
                    </Td>
                    <Td align="right">
                      {r.status === "recorded" ? (
                        <span className="text-[13px] text-muted-foreground">{r.recordedBy}</span>
                      ) : canRecord ? (
                        <Button
                          size="sm"
                          variant={r.status === "overdue" ? "default" : "outline"}
                          onClick={(e) => {
                            e.stopPropagation()
                            setRecordRow(r)
                          }}
                        >
                          Record dose
                        </Button>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">—</span>
                      )}
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableScroll>
      )}
      <TableFooter>
        <span>
          Double-recording the same dose is blocked · showing {visible.length} of {rows.length}
        </span>
        {rows.length > PREVIEW ? (
          <Button variant="link" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show less" : "Show all"}
          </Button>
        ) : null}
      </TableFooter>
      <RecordDoseDialog row={recordRow} onClose={() => setRecordRow(null)} />
    </Panel>
  )
}

export function DueTodayTab() {
  const canRecord = usePermission("record")
  /** Row clicked in the table — pre-fills (and resets) the Add schedule form. */
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null)
  /** Animal currently chosen in the form (header label). */
  const [formAnimalId, setFormAnimalId] = useState<string | null>(null)
  const animalsQ = useQuery({ queryKey: ["animals", "picker", "active"], queryFn: () => listAnimals({ tab: "active", pageSize: 1000 }) })
  const headerId = formAnimalId ?? selectedAnimalId
  const headerAnimal = headerId ? animalsQ.data?.allRows.find((r) => r.animal.id === headerId)?.animal : undefined
  const selectedLabel = headerAnimal ? `${headerAnimal.name} · ${headerAnimal.kennelCode}` : null
  const select = (id: string | null) => {
    setSelectedAnimalId(id)
    setFormAnimalId(id)
  }
  return (
    <div
      className={
        canRecord
          ? "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]"
          : "grid grid-cols-1 gap-6"
      }
    >
      <DueTable selectedAnimalId={headerId} onSelectAnimal={select} />
      {canRecord ? (
        <Panel as="aside" className="h-fit w-full max-w-xl xl:max-w-none">
          <PanelHeader
            title="Add schedule"
            actions={selectedLabel ? <span className="text-[13px] text-muted-foreground">{selectedLabel}</span> : null}
          />
          <div className="border-t border-border px-5 py-5">
            <ScheduleForm
              key={selectedAnimalId ?? "none"}
              initialAnimalId={selectedAnimalId}
              idPrefix="add-sched"
              onAnimalChange={setFormAnimalId}
              onCancel={() => select(null)}
            />
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
