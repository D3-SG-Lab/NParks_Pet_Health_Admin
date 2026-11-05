"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Download } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/common/page-header"
import { Panel } from "@/components/common/surfaces"
import { Button } from "@/components/ui/button"
import { useDebounced } from "@/hooks/use-debounced"
import { todayISO } from "@/lib/clock"
import { downloadCsv } from "@/lib/csv"
import { errorMessage } from "@/lib/errors"
import { fmtDateTime } from "@/lib/format"
import { CASE_STATUS } from "@/lib/status"
import { listCases, recordCaseExport, type CaseFilter } from "@/services/cases"

import { CaseDetailPanel } from "./case-detail"
import { CaseList } from "./case-list"

/** Health cases workbench — list + detail split view (FE-015, FE-016; Admin_Design.pdf p.4). */
export function CasesScreen() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const paramId = params.get("id")
  const [filter, setFilter] = useState<CaseFilter>("open")
  const [search, setSearch] = useState("")
  const q = useDebounced(search, 200)

  const list = useQuery({ queryKey: ["cases", filter, q], queryFn: () => listCases({ filter, search: q }) })
  const items = list.data?.items
  // Desktop shows the first case when nothing is selected; mobile shows the list until a case is picked.
  const effectiveId = paramId ?? items?.[0]?.case.id ?? null

  const select = (id: string | null) => {
    router.replace(id ? `${pathname}?id=${encodeURIComponent(id)}` : pathname, { scroll: false })
  }

  const exportCsv = async () => {
    if (!items?.length) {
      toast.info("No cases to export with the current filter.")
      return
    }
    downloadCsv(
      `health-cases-${todayISO()}`,
      ["Case", "Status", "Title", "Kennel", "Animal", "Species", "Assigned to", "Opened", "Updated", "Observations", "Next action"],
      items.map((i) => [
        i.case.id,
        CASE_STATUS[i.case.status].label,
        i.case.title,
        i.animal.kennelCode,
        i.animal.name,
        i.speciesName,
        i.case.assigneeId ? i.assigneeName : "Unassigned",
        fmtDateTime(i.case.openedAt),
        fmtDateTime(i.case.updatedAt),
        i.observationCount,
        i.nextAction.label,
      ])
    )
    try {
      await recordCaseExport(
        items.map((i) => i.case.id),
        "CSV"
      )
      toast.success(`Exported ${items.length} case${items.length === 1 ? "" : "s"} · export audited`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const counts = list.data?.counts

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health cases"
        description={counts ? `Officer workbench · ${counts.open} open, ${counts.needs_review} need review` : "Officer workbench"}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={list.isPending}>
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <Panel className={paramId ? "hidden overflow-hidden lg:block" : "overflow-hidden"}>
          <CaseList
            items={items}
            counts={counts}
            isPending={list.isPending}
            error={list.error}
            onRetry={() => void list.refetch()}
            filter={filter}
            onFilter={setFilter}
            search={search}
            onSearch={setSearch}
            selectedId={effectiveId}
            onSelect={select}
          />
        </Panel>
        <div className={paramId ? "min-w-0" : "hidden min-w-0 lg:block"}>
          {effectiveId ? (
            <CaseDetailPanel key={effectiveId} caseId={effectiveId} onBack={() => select(null)} />
          ) : list.isPending ? null : (
            <Panel className="flex min-h-[320px] items-center justify-center p-8 text-sm text-muted-foreground">
              Select a case to see its details.
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
