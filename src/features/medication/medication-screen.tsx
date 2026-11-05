"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Download } from "lucide-react"

import { PageTabs } from "@/components/common/filters"
import { PageHeader } from "@/components/common/page-header"
import { Button } from "@/components/ui/button"
import { downloadCsv } from "@/lib/csv"
import { fmtDate, fmtTime } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { listAdministrations, listDueToday, listSchedules, recordMedicationExport } from "@/services/medication"

import { AdministrationLogTab } from "./administration-log"
import { DueTodayTab } from "./due-today"
import { SchedulesTab } from "./schedules-tab"

type Tab = "due" | "schedules" | "log"

export function MedicationScreen() {
  const [tab, setTab] = useState<Tab>("due")
  const due = useQuery({ queryKey: ["medication-due", "all"], queryFn: () => listDueToday("all") })
  const schedules = useQuery({ queryKey: ["medication-schedules", "", "all"], queryFn: () => listSchedules({ search: "", state: "all" }) })

  const exportLog = useServiceMutation(
    async () => {
      const rows = await listAdministrations({})
      downloadCsv(
        "medication-administration-log",
        ["Date", "Time", "Kennel", "Animal", "Item", "Dose", "Route", "Dose time", "Given by", "Remarks", "Linked case"],
        rows.map((r) => [
          fmtDate(r.administration.at),
          fmtTime(r.administration.at),
          r.animal.kennelCode,
          r.animal.name,
          r.schedule.item,
          r.schedule.dose,
          r.schedule.route,
          r.administration.doseTime,
          r.byName,
          r.administration.remarks,
          r.schedule.caseId ?? "",
        ])
      )
      await recordMedicationExport(rows.length)
      return rows.length
    },
    { success: (n) => `Exported ${n} administrations · export recorded in the audit log` }
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medication"
        description="Schedules and administrations for medication and supplements · time and officer are captured automatically"
        actions={
          <Button variant="outline" onClick={() => exportLog.mutate()} loading={exportLog.isPending}>
            <Download /> Export log
          </Button>
        }
      />
      <PageTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "due", label: "Due today", count: due.data?.counts.all },
          { value: "schedules", label: "Schedules", count: schedules.data?.length },
          { value: "log", label: "Administration log" },
        ]}
      />
      <div role="tabpanel">{tab === "due" ? <DueTodayTab /> : tab === "schedules" ? <SchedulesTab /> : <AdministrationLogTab />}</div>
    </div>
  )
}
