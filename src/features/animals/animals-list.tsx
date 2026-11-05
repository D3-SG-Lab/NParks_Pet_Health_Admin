"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Download, Plus } from "lucide-react"

import { AnimalAvatar } from "@/components/common/avatars"
import { FilterChips, PageTabs, SearchInput } from "@/components/common/filters"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState, QueryError } from "@/components/common/states"
import { KennelCode, StatusChip } from "@/components/common/status-chip"
import { Panel, ProgressBar } from "@/components/common/surfaces"
import {
  Pagination,
  rangeLabel,
  SortTh,
  Table,
  TableFooter,
  TableMessageRow,
  TableScroll,
  TableSkeletonRows,
  Td,
  Th,
  THead,
  Tr,
  type SortDir,
} from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDebounced } from "@/hooks/use-debounced"
import { usePermission } from "@/hooks/use-session"
import { addDays, todayISO } from "@/lib/clock"
import { downloadCsv } from "@/lib/csv"
import { fmtDate, fmtDayMonth, fmtMicrochip } from "@/lib/format"
import { ANIMAL_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import { listAnimals, recordAnimalExport, type AnimalChip, type AnimalSortKey, type AnimalTab } from "@/services/animals"
import { getReferenceData } from "@/services/reference"

import { animalMeta, CheckChip } from "./animal-bits"

const COLS = 9

/** Animals list (FE-006 / BE-009, Admin_Design.pdf p.2). */
export function AnimalsList() {
  const router = useRouter()
  const canArrive = usePermission("arrival")
  const [tab, setTab] = useState<AnimalTab>("active")
  const [search, setSearch] = useState("")
  const [block, setBlock] = useState("all")
  const [species, setSpecies] = useState("all")
  const [chip, setChip] = useState<AnimalChip>("all")
  const [sort, setSort] = useState<{ key: AnimalSortKey; dir: SortDir }>({ key: "kennel", dir: "asc" })
  const [page, setPage] = useState(1)
  const debounced = useDebounced(search, 200)

  const params = { tab, search: debounced, block, species, chip, sort, page }
  const q = useQuery({ queryKey: ["animals", params], queryFn: () => listAnimals(params), placeholderData: keepPreviousData })
  const ref = useQuery({ queryKey: ["reference"], queryFn: getReferenceData })

  // Any filter change goes back to page 1.
  const resetting =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setPage(1)
    }

  const today = todayISO()
  const data = q.data

  const exportCsv = () => {
    if (!data) return
    downloadCsv(
      `animals-${tab}`,
      ["Kennel", "Animal", "Species", "Sex", "Microchip", "Origin", "Arrival", "Release", "Stay day", "Status"],
      data.allRows.map((r) => [
        r.animal.kennelCode,
        r.animal.name,
        r.speciesName,
        r.animal.sex,
        r.animal.microchip,
        r.animal.origin,
        fmtDate(r.animal.arrivalDate),
        fmtDate(r.animal.releaseDate),
        `${r.stay.day}/${r.stay.total}`,
        ANIMAL_STATUS[r.status].label,
      ])
    )
    void recordAnimalExport(null, `CSV · ${data.allRows.length} rows`, data.allRows.length)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Animals"
        description={`${data?.tabCounts.active ?? "…"} active stays across KC1–KC3 · search by kennel code, name or microchip`}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!data || data.total === 0}>
              <Download /> Export CSV
            </Button>
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

      <PageTabs
        value={tab}
        onChange={resetting(setTab)}
        tabs={[
          { value: "active", label: "Active", count: data?.tabCounts.active },
          { value: "arriving", label: "Arriving today", count: data?.tabCounts.arriving },
          { value: "releasing", label: "Releasing this week", count: data?.tabCounts.releasing },
          { value: "released", label: "Released", count: data?.tabCounts.released },
        ]}
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <SearchInput
            className="w-full sm:w-[260px]"
            value={search}
            onChange={resetting(setSearch)}
            placeholder="Kennel, name or microchip"
          />
          <Select value={block} onValueChange={resetting(setBlock)}>
            <SelectTrigger className="w-[calc(50%-6px)] sm:w-[170px]" aria-label="Kennel block">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kennel blocks</SelectItem>
              {(ref.data?.blocks ?? []).map((b) => (
                <SelectItem key={b.code} value={b.code}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={species} onValueChange={resetting(setSpecies)}>
            <SelectTrigger className="w-[calc(50%-6px)] sm:w-[150px]" aria-label="Species">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All species</SelectItem>
              {(ref.data?.species ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FilterChips
            ariaLabel="Health filter"
            value={chip}
            onChange={resetting(setChip)}
            options={[
              { value: "all", label: "All" },
              { value: "unwell", label: "Unwell", count: data?.chipCounts.unwell },
              { value: "check_due", label: "Check due", count: data?.chipCounts.check_due },
            ]}
          />
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {data ? `${data.total} result${data.total === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        <TableScroll>
          <Table className="min-w-[1040px]">
            <THead>
              <tr>
                <SortTh label="Kennel" sortKey="kennel" sort={sort} onSort={resetting(setSort)} />
                <SortTh label="Animal" sortKey="name" sort={sort} onSort={resetting(setSort)} />
                <Th>Microchip</Th>
                <Th>Origin</Th>
                <SortTh label="Stay" sortKey="stay" sort={sort} onSort={resetting(setSort)} />
                <SortTh label="Status" sortKey="status" sort={sort} onSort={resetting(setSort)} />
                <Th>Today</Th>
                <SortTh label="Release" sortKey="release" sort={sort} onSort={resetting(setSort)} />
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <tbody className={cn(q.isFetching && q.isPlaceholderData && "opacity-60")}>
              {q.isPending ? (
                <TableSkeletonRows cols={COLS} rows={8} />
              ) : q.isError ? (
                <TableMessageRow cols={COLS}>
                  <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load animals" />
                </TableMessageRow>
              ) : data && data.rows.length === 0 ? (
                <TableMessageRow cols={COLS}>
                  <EmptyState
                    icon="search"
                    title="No animals match"
                    description="Try a different kennel code, name or microchip, or clear the filters."
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearch("")
                          setBlock("all")
                          setSpecies("all")
                          setChip("all")
                          setPage(1)
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                </TableMessageRow>
              ) : (
                data?.rows.map((r) => {
                  const st = ANIMAL_STATUS[r.status]
                  const soon = r.animal.stayStatus !== "released" && r.animal.releaseDate <= addDays(today, 3)
                  return (
                    <Tr key={r.animal.id} onClick={() => router.push(`/animals/${r.animal.id}`)}>
                      <Td>
                        <KennelCode code={r.animal.kennelCode} />
                      </Td>
                      <Td>
                        <div className="flex items-center gap-3">
                          <AnimalAvatar name={r.animal.name} speciesId={r.animal.speciesId} />
                          <div className="min-w-0">
                            <p className="font-semibold">{r.animal.name}</p>
                            <p className="text-xs text-muted-foreground">{animalMeta(r.animal, r.speciesName)}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className="font-mono text-[13px] whitespace-nowrap">{fmtMicrochip(r.animal.microchip)}</Td>
                      <Td className="whitespace-nowrap">{r.animal.origin}</Td>
                      <Td className="min-w-[120px]">
                        {r.animal.stayStatus === "released" ? (
                          <span className="text-xs text-muted-foreground">
                            Released {r.animal.releasedAt ? fmtDayMonth(r.animal.releasedAt) : ""}
                          </span>
                        ) : (
                          <>
                            <p className="text-xs text-muted-foreground">
                              Day {r.stay.day} of {r.stay.total}
                            </p>
                            <ProgressBar value={r.stay.ratio} className="mt-1.5 w-24" />
                          </>
                        )}
                      </Td>
                      <Td>
                        <StatusChip tone={st.tone} dot={st.dot}>
                          {st.label}
                        </StatusChip>
                      </Td>
                      <Td>
                        {r.animal.stayStatus === "released" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex gap-1">
                            <CheckChip check={r.am} />
                            <CheckChip check={r.pm} />
                          </div>
                        )}
                      </Td>
                      <Td className={cn("font-mono text-[13px]", soon && "font-bold text-success")}>{fmtDayMonth(r.animal.releaseDate)}</Td>
                      <Td align="right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/animals/${r.animal.id}`} onClick={(e) => e.stopPropagation()}>
                            View
                          </Link>
                        </Button>
                      </Td>
                    </Tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </TableScroll>
        <TableFooter>
          <span>{data ? rangeLabel(data.page, data.pageSize, data.total) : "Loading…"}</span>
          {data ? <Pagination page={data.page} pages={Math.max(1, Math.ceil(data.total / data.pageSize))} onPage={setPage} /> : null}
        </TableFooter>
      </Panel>
      <p className="text-xs text-muted-foreground">
        Microchip must be unique across active stays. Released animals drop out of active monitoring and AI matching (BE-009, AI-002).
      </p>
    </div>
  )
}
