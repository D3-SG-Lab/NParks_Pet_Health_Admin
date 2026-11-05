"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { AnimalAvatar } from "@/components/common/avatars"
import { SearchInput } from "@/components/common/filters"
import { EmptyState, QueryError } from "@/components/common/states"
import { Panel } from "@/components/common/surfaces"
import { DatePicker } from "@/components/forms/date-picker"
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
import { useDebounced } from "@/hooks/use-debounced"
import { todayISO } from "@/lib/clock"
import { fmtShortDateTime } from "@/lib/format"
import { listAdministrations } from "@/services/medication"

const PAGE = 10

export function AdministrationLogTab() {
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const debounced = useDebounced(search)
  const q = useQuery({
    queryKey: ["medication-log", debounced, from, to],
    queryFn: () => listAdministrations({ search: debounced, from: from || undefined, to: to || undefined }),
  })
  const rows = q.data ?? []
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const current = Math.min(page, pages)
  const visible = rows.slice((current - 1) * PAGE, current * PAGE)
  const filtered = Boolean(search || from || to)
  const reset = () => {
    setSearch("")
    setFrom("")
    setTo("")
    setPage(1)
  }

  return (
    <Panel>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:flex lg:items-end">
        <SearchInput
          className="sm:col-span-2 lg:max-w-sm lg:flex-1"
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder="Animal, kennel, item or officer"
        />
        <div className="lg:w-[170px]">
          <DatePicker
            value={from}
            max={to || todayISO()}
            placeholder="From"
            ariaLabel="From date"
            onChange={(v) => {
              setFrom(v)
              setPage(1)
            }}
          />
        </div>
        <div className="lg:w-[170px]">
          <DatePicker
            value={to}
            min={from || undefined}
            max={todayISO()}
            placeholder="To"
            ariaLabel="To date"
            onChange={(v) => {
              setTo(v)
              setPage(1)
            }}
          />
        </div>
        {filtered ? (
          <Button variant="outline" onClick={reset}>
            Reset
          </Button>
        ) : null}
      </div>
      {q.isError ? (
        <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load the administration log" />
      ) : (
        <TableScroll>
          <Table className="min-w-[820px]">
            <THead>
              <tr>
                <Th>Given ↓</Th>
                <Th>Animal</Th>
                <Th>Item &amp; dose</Th>
                <Th>Dose time</Th>
                <Th>Given by</Th>
                <Th>Remarks</Th>
              </tr>
            </THead>
            <tbody>
              {q.isPending ? (
                <TableSkeletonRows cols={6} rows={6} />
              ) : visible.length === 0 ? (
                <TableMessageRow cols={6}>
                  <EmptyState
                    icon="search"
                    title="No administrations found"
                    description={filtered ? "Nothing matches these filters." : "Recorded doses will appear here."}
                    action={
                      filtered ? (
                        <Button variant="outline" size="sm" onClick={reset}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                </TableMessageRow>
              ) : (
                visible.map((r) => (
                  <Tr key={r.administration.id}>
                    <Td className="font-mono text-[13px] whitespace-nowrap">{fmtShortDateTime(r.administration.at)}</Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <AnimalAvatar name={r.animal.name} speciesId={r.animal.speciesId} size="sm" />
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
                      </p>
                    </Td>
                    <Td className="font-mono">{r.administration.doseTime}</Td>
                    <Td>{r.byName}</Td>
                    <Td className="max-w-[240px] text-muted-foreground">{r.administration.remarks || "—"}</Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableScroll>
      )}
      <TableFooter>
        <span>{rangeLabel(current, PAGE, rows.length, "administrations")}</span>
        <Pagination page={current} pages={pages} onPage={setPage} />
      </TableFooter>
    </Panel>
  )
}
