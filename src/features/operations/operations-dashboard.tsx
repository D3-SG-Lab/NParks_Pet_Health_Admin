"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Camera, Download, Plus, RefreshCw } from "lucide-react"

import { FilterChips } from "@/components/common/filters"
import { KpiCard } from "@/components/common/kpi-card"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState, PanelSkeleton, QueryError } from "@/components/common/states"
import { Panel, PanelHeader } from "@/components/common/surfaces"
import { Table, TableFooter, TableScroll, TableSkeletonRows, Th, THead, type SortDir } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { usePermission } from "@/hooks/use-session"
import { downloadCsv } from "@/lib/csv"
import { fmtTime } from "@/lib/format"
import { NewObservationDialog } from "@/features/observations/new-observation-dialog"
import { recordAnimalExport } from "@/services/animals"
import { getDashboard, type UnwellFilter, type UnwellRow } from "@/services/dashboard"
import { getReferenceData } from "@/services/reference"

import { FollowUpPanel } from "./follow-up-panel"
import { UNWELL_STATUS, UnwellCards, UnwellTable, type UnwellSortKey } from "./unwell-table"

const STATUS_RANK = { needs_review: 0, open: 1, monitoring: 2 } as const

function sortRows(rows: UnwellRow[], sort: { key: UnwellSortKey; dir: SortDir }): UnwellRow[] {
  const dir = sort.dir === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sort.key === "status") return dir * (STATUS_RANK[a.status] - STATUS_RANK[b.status])
    if (sort.key === "next") {
      const rank = (r: UnwellRow) => (r.nextAction.tone === "danger" ? "0" : r.nextAction.dueAt ? `1${r.nextAction.dueAt}` : "2")
      return dir * rank(a).localeCompare(rank(b))
    }
    return dir * a.animal.name.localeCompare(b.animal.name)
  })
}

/** Operations dashboard (FE-005 / FE-021, Admin_Design.pdf p.1 and p.16). */
export function OperationsDashboard() {
  const router = useRouter()
  const canAssign = usePermission("cases")
  const canArrive = usePermission("arrival")
  const canRecord = usePermission("record")
  const q = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard })
  const ref = useQuery({ queryKey: ["reference"], queryFn: getReferenceData })

  const [filter, setFilter] = useState<UnwellFilter>("open")
  const [block, setBlock] = useState("all")
  const [sort, setSort] = useState<{ key: UnwellSortKey; dir: SortDir }>({ key: "status", dir: "asc" })
  const [selected, setSelected] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [obsOpen, setObsOpen] = useState(false)

  const inBlock = useMemo(
    () => (q.data?.rows ?? []).filter((r) => block === "all" || r.animal.kennelCode.startsWith(`${block}-`)),
    [q.data, block]
  )
  const rows = useMemo(
    () =>
      sortRows(
        inBlock.filter((r) => r.filters.includes(filter)),
        sort
      ),
    [inBlock, filter, sort]
  )
  const counts = (f: UnwellFilter) => inBlock.filter((r) => r.filters.includes(f)).length
  const selectedRow = rows.find((r) => r.animal.id === selected) ?? rows[0] ?? null

  const openAssign = (id: string) => {
    setSelected(id)
    setSheetOpen(true)
  }

  const exportCsv = () => {
    downloadCsv(
      "unwell-animals",
      ["Kennel", "Animal", "Species", "Status", "AI summary", "Assigned", "Next action", "Case"],
      rows.map((r) => [
        r.animal.kennelCode,
        r.animal.name,
        r.speciesName,
        UNWELL_STATUS[r.status].label,
        r.aiSummary,
        r.assigneeId ? r.assigneeName : "Unassigned",
        r.nextAction.label,
        r.caseId ?? "",
      ])
    )
    void recordAnimalExport(null, `Unwell animals · CSV · ${rows.length} rows`, rows.length)
  }

  const c = q.data?.counts
  const kennelBlocks = (ref.data?.blocks ?? []).filter(
    (b) => b.kind === "kennel" || q.data?.rows.some((r) => r.animal.kennelCode.startsWith(`${b.code}-`))
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations dashboard"
        description={<>Today’s monitoring across all kennels{q.data ? ` · updated ${fmtTime(q.data.updatedAt)}` : ""}</>}
        actions={
          <>
            <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching} aria-label="Refresh dashboard">
              <RefreshCw className={q.isFetching ? "animate-spin" : undefined} /> <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canRecord ? (
              <Button variant="outline" onClick={() => setObsOpen(true)}>
                <Camera /> <span className="hidden sm:inline">New observation</span>
              </Button>
            ) : null}
            {canArrive ? (
              <Button asChild>
                <Link href="/animals/new">
                  <Plus /> New arrival
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {q.isError ? (
        <Panel>
          <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load the dashboard" />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <KpiCard
              label="Active animals"
              loading={!c}
              value={c?.activeAnimals}
              sub={c ? `Across ${c.blocks} · ${c.arrivalsToday} arrival${c.arrivalsToday === 1 ? "" : "s"} today` : undefined}
              onClick={() => router.push("/animals")}
            />
            <KpiCard
              label="Checks due"
              loading={!c}
              value={c?.checksDue}
              sub={c ? `AM ${c.checksDueAM} · PM ${c.checksDuePM}` : undefined}
              progress={c?.checksDoneRatio}
              onClick={() => router.push("/inspections")}
            />
            <KpiCard
              label="Open cases"
              tone="info"
              loading={!c}
              value={c?.openCases}
              sub={
                c
                  ? `${c.casesUpdatedToday} updated today · ${c.followUpsOverdue} follow-up${c.followUpsOverdue === 1 ? "" : "s"} overdue`
                  : undefined
              }
              onClick={() => router.push("/cases")}
            />
            <KpiCard
              label="Needs review"
              tone="warning"
              emphasis
              loading={!c}
              value={c?.needsReview}
              sub="AI unmatched or low confidence"
              onClick={() => router.push("/review")}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel className="min-w-0 overflow-hidden">
              <PanelHeader
                title="Unwell animals"
                actions={
                  <FilterChips
                    ariaLabel="Filter unwell animals"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "open", label: "Open", count: counts("open") },
                      { value: "needs_review", label: "Needs review", count: counts("needs_review") },
                      { value: "last_7_days", label: "Last 7 days" },
                      { value: "assigned_to_me", label: "Assigned to me" },
                    ]}
                  />
                }
              />
              <div className="px-5 pb-4">
                <Select value={block} onValueChange={setBlock}>
                  <SelectTrigger className="w-[180px]" aria-label="Kennel block">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All kennels</SelectItem>
                    {kennelBlocks.map((b) => (
                      <SelectItem key={b.code} value={b.code}>
                        {b.name} · {b.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {q.isPending ? (
                <TableScroll>
                  <Table>
                    <THead>
                      <tr>
                        {["Animal", "Status", "AI summary", "Assigned", "Next action", "Action"].map((h) => (
                          <Th key={h}>{h}</Th>
                        ))}
                      </tr>
                    </THead>
                    <tbody>
                      <TableSkeletonRows cols={6} rows={5} />
                    </tbody>
                  </Table>
                </TableScroll>
              ) : rows.length === 0 ? (
                <div className="border-t border-border">
                  <EmptyState
                    title="No unwell animals"
                    description={
                      filter === "open" && block === "all"
                        ? "Every animal is healthy right now."
                        : `Nothing matches “${filter === "open" ? "Open" : filter === "needs_review" ? "Needs review" : filter === "last_7_days" ? "Last 7 days" : "Assigned to me"}”${block !== "all" ? ` in ${block}` : ""}.`
                    }
                    action={
                      filter !== "open" || block !== "all" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFilter("open")
                            setBlock("all")
                          }}
                        >
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="hidden md:block">
                    <UnwellTable
                      rows={rows}
                      selectedId={selectedRow?.animal.id ?? null}
                      onSelect={setSelected}
                      onAssign={openAssign}
                      sort={sort}
                      onSort={setSort}
                      canAssign={canAssign}
                    />
                  </div>
                  <div className="border-t border-border md:hidden">
                    <UnwellCards rows={rows} selectedId={selectedRow?.animal.id ?? null} onAssign={openAssign} canAssign={canAssign} />
                  </div>
                </>
              )}
              <TableFooter>
                <span>
                  Showing {rows.length} of {inBlock.length}
                </span>
                <Button variant="link" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
                  <Download /> Export CSV
                </Button>
              </TableFooter>
            </Panel>

            <Panel as="aside" className="hidden self-start p-5 lg:block">
              {q.isPending ? (
                <PanelSkeleton lines={8} className="p-0" />
              ) : selectedRow ? (
                <FollowUpPanel key={selectedRow.animal.id} row={selectedRow} canAssign={canAssign} />
              ) : (
                <EmptyState title="Nothing selected" description="Pick an animal to see its AI summary and assign a follow-up." />
              )}
            </Panel>
          </div>
        </>
      )}

      <Sheet open={sheetOpen && Boolean(selectedRow)} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-5 sm:max-w-[420px] lg:hidden">
          <SheetHeader className="p-0">
            <SheetTitle>Assign follow-up</SheetTitle>
            <SheetDescription className="sr-only">AI summary and follow-up form for the selected animal</SheetDescription>
          </SheetHeader>
          {selectedRow ? (
            <FollowUpPanel key={selectedRow.animal.id} row={selectedRow} canAssign={canAssign} onAssigned={() => setSheetOpen(false)} />
          ) : null}
        </SheetContent>
      </Sheet>

      <NewObservationDialog open={obsOpen} onOpenChange={setObsOpen} />
    </div>
  )
}
