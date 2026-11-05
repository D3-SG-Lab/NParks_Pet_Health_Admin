"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bell, Download } from "lucide-react"

import { Segmented } from "@/components/common/filters"
import { KpiCard } from "@/components/common/kpi-card"
import { PageHeader } from "@/components/common/page-header"
import { PanelSkeleton, QueryError } from "@/components/common/states"
import { Panel } from "@/components/common/surfaces"
import { DatePicker } from "@/components/forms/date-picker"
import { Button } from "@/components/ui/button"
import { usePermission } from "@/hooks/use-session"
import { currentSession, todayISO } from "@/lib/clock"
import { downloadCsv } from "@/lib/csv"
import { fmtTime } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { getSessionBoard, recordSessionExport, remindAssignees, type BoardTile, type SessionBoard } from "@/services/inspections"
import type { Session } from "@/types/domain"

import { BoardBlockSection, BoardLegend } from "./session-board"
import { InspectionSheet } from "./inspection-sheet"

const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  abnormal: "Abnormal",
  due: "Due",
  overdue: "Overdue",
  not_applicable: "Arrival exam pending",
}

function exportRows(board: SessionBoard) {
  return board.blocks.flatMap((b) =>
    b.tiles
      .filter((t) => t.animal)
      .map((t) => [
        t.kennel.code,
        t.animal!.name,
        STATUS_LABEL[t.check?.state ?? "due"] ?? "",
        t.check?.at ? fmtTime(t.check.at) : "",
        t.inspectorName ?? "",
        t.check?.state === "abnormal" ? t.label.replace(/^\d\d:\d\d · /, "") : t.check?.state === "done" ? "normal" : "",
      ])
  )
}

export function InspectionsScreen() {
  const canRecord = usePermission("record")
  const [session, setSession] = useState<Session>(() => currentSession())
  const [date, setDate] = useState<string>(() => todayISO())
  const [openTile, setOpenTile] = useState<BoardTile | null>(null)
  const today = todayISO()

  const q = useQuery({ queryKey: ["inspection-board", date, session], queryFn: () => getSessionBoard(date, session) })

  const remind = useServiceMutation(() => remindAssignees(date, session), {
    success: (r) =>
      r.kennels === 0
        ? "Nothing to remind — every animal has been inspected this session"
        : `Reminder sent to ${r.notified} contractor${r.notified === 1 ? "" : "s"} for ${r.kennels} animal${r.kennels === 1 ? "" : "s"}`,
  })

  const exportCsv = useServiceMutation(
    async (board: SessionBoard) => {
      const rows = exportRows(board)
      downloadCsv(`inspections-${board.date}-${board.session}`, ["Kennel", "Animal", "Status", "Time", "Inspector", "Findings"], rows)
      await recordSessionExport(board.date, board.session, rows.length)
      return rows.length
    },
    { success: (n) => `Exported ${n} rows` }
  )

  const board = q.data
  const t = board?.totals

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inspections"
        description="AM/PM checks by kennel · one AM and one PM inspection per animal per day; edits are audited"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Session"
          value={session}
          onChange={setSession}
          options={[
            { value: "AM", label: "AM session" },
            { value: "PM", label: "PM session" },
          ]}
        />
        <div className="w-[176px]">
          <DatePicker value={date} onChange={(d) => setDate(d)} max={today} ariaLabel="Inspection date" />
        </div>
        {canRecord ? (
          <Button variant="outline" onClick={() => remind.mutate()} loading={remind.isPending} disabled={date !== today}>
            <Bell /> Remind assignees
          </Button>
        ) : null}
      </div>

      {q.isError ? (
        <Panel>
          <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load the session board" />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={`Completed · ${session}`}
              value={t?.completed ?? 0}
              tone="success"
              loading={q.isPending}
              sub={`of ${t?.expected ?? 0} animals`}
              progress={t && t.expected ? t.completed / t.expected : 0}
            />
            <KpiCard
              label="Still due"
              value={t?.stillDue ?? 0}
              loading={q.isPending}
              sub={board ? `Session closes ${board.closes}` : undefined}
            />
            <KpiCard
              label="Overdue"
              value={t?.overdue ?? 0}
              tone="danger"
              emphasis={Boolean(t?.overdue)}
              loading={q.isPending}
              sub={t?.overdueList.length ? t.overdueList.join(" · ") : "Nothing overdue"}
            />
            <KpiCard
              label="Abnormal findings"
              value={t?.abnormal ?? 0}
              tone="abnormal"
              emphasis={Boolean(t?.abnormal)}
              loading={q.isPending}
              sub="Sent for AI routing"
            />
          </div>

          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Session board</h2>
              <BoardLegend />
            </div>
            {q.isPending ? (
              <PanelSkeleton lines={8} />
            ) : board && board.blocks.length > 0 ? (
              <div className="divide-y divide-border">
                {board.blocks.map((b) => (
                  <BoardBlockSection key={b.block.code} block={b} onOpen={setOpenTile} />
                ))}
              </div>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">No kennels in your scope.</p>
            )}
            {board ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5 text-sm text-muted-foreground">
                <span>
                  Showing kennel blocks 1–{board.blocks.length} of {board.blocks.length} · tap a kennel to open the animal record
                </span>
                <Button variant="link" onClick={() => exportCsv.mutate(board)} disabled={exportCsv.isPending}>
                  <Download /> Export session CSV
                </Button>
              </div>
            ) : null}
          </Panel>
        </>
      )}

      <InspectionSheet tile={openTile} date={date} session={session} onClose={() => setOpenTile(null)} />
    </div>
  )
}
