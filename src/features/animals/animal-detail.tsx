"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Camera, ClipboardCheck, Download, FolderOpen, LogOut, Pencil } from "lucide-react"
import { toast } from "sonner"

import { AiSummaryCard } from "@/components/common/ai-card"
import { AnimalAvatar } from "@/components/common/avatars"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { Breadcrumbs } from "@/components/common/page-header"
import { PanelSkeleton, QueryError } from "@/components/common/states"
import { KennelCode, StatusChip } from "@/components/common/status-chip"
import { DetailList, Panel, ProgressBar, SectionLabel } from "@/components/common/surfaces"
import { Field } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { NewObservationDialog } from "@/features/observations/new-observation-dialog"
import { usePermission } from "@/hooks/use-session"
import { fmtDate, fmtDayMonth, fmtMicrochip, fmtTime } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { ANIMAL_STATUS, CASE_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import { getAnimal, releaseAnimal, type AnimalDetail as Detail } from "@/services/animals"
import type { CheckInfo } from "@/services/derive"

import { animalMeta } from "./animal-bits"
import { AnimalEditDialog } from "./animal-edit-dialog"
import { HealthRecord, type TimelineFocus } from "./health-record"

function TodayTile({
  label,
  value,
  tone,
  dashed,
}: {
  label: string
  value: string
  tone: "success" | "warning" | "danger" | "muted" | "abnormal"
  dashed?: boolean
}) {
  return (
    <div className={cn("rounded-xl border px-3 py-3", dashed ? "border-dashed border-warning-border bg-warning-tile" : "border-border")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-[15px] font-semibold",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
          tone === "abnormal" && "text-abnormal",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </p>
    </div>
  )
}

function checkTile(c: CheckInfo) {
  const label = `${c.session} insp.`
  switch (c.state) {
    case "done":
      return <TodayTile label={label} value={fmtTime(c.at!)} tone="success" />
    case "abnormal":
      return <TodayTile label={label} value={`${fmtTime(c.at!)} · ${c.abnormalCount} abn.`} tone="abnormal" />
    case "overdue":
      return <TodayTile label={label} value={`Overdue ${c.dueTime}`} tone="danger" dashed />
    case "due":
      return <TodayTile label={label} value={`Due ${c.dueTime}`} tone="warning" dashed />
    default:
      return <TodayTile label={label} value="—" tone="muted" />
  }
}

/** Animal profile & health record (FE-014, Admin_Design.pdf p.3). */
export function AnimalDetail() {
  const { id } = useParams<{ id: string }>()
  const q = useQuery({ queryKey: ["animal", id], queryFn: () => getAnimal(id) })

  if (q.isPending) {
    return (
      <div className="space-y-5">
        <Panel>
          <PanelSkeleton lines={3} />
        </Panel>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel>
            <PanelSkeleton lines={8} />
          </Panel>
          <Panel>
            <PanelSkeleton lines={5} />
          </Panel>
        </div>
      </div>
    )
  }
  if (q.isError) return <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load this animal" />
  return <DetailView detail={q.data} />
}

function DetailView({ detail }: { detail: Detail }) {
  const router = useRouter()
  const canArrive = usePermission("arrival")
  const canRecord = usePermission("record")
  const { row, exam, cases, medications, summary } = detail
  const a = row.animal
  const released = a.stayStatus === "released"
  const st = ANIMAL_STATUS[row.status]
  const openCases = cases.filter((c) => c.status !== "closed")
  const [editOpen, setEditOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseNote, setReleaseNote] = useState("")
  const [obsOpen, setObsOpen] = useState(false)
  const [focus, setFocus] = useState<TimelineFocus | null>(null)

  const release = useServiceMutation(() => releaseAnimal(a.id, releaseNote), {
    success: `${a.name} released`,
    onSuccess: () => setReleaseOpen(false),
  })

  const cite = (refId: string) => {
    if (refId.startsWith("ms-")) {
      document.getElementById("medication-card")?.scrollIntoView({ behavior: "smooth", block: "center" })
      return
    }
    if (refId.startsWith("C-")) {
      router.push(`/cases?id=${refId}`)
      return
    }
    setFocus((f) => ({ refId, nonce: (f?.nonce ?? 0) + 1 }))
    toast.info(`Showing source record ${refId}`)
  }

  const statusLabel = row.status === "unwell" ? "Unwell · monitoring" : st.label

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Animals", href: "/animals" }, { label: a.name }]} />

      <Panel className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <AnimalAvatar name={a.name} speciesId={a.speciesId} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{a.name}</h1>
                <StatusChip tone={st.tone} dot={st.dot}>
                  {statusLabel}
                </StatusChip>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
                <KennelCode code={a.kennelCode} /> ·{" "}
                {animalMeta(a, row.speciesName).replace(" · M ·", " · Male ·").replace(" · F ·", " · Female ·")} · {a.origin} · MC{" "}
                <span className="font-mono">{fmtMicrochip(a.microchip)}</span>
              </p>
            </div>
          </div>
          <div className="w-full shrink-0 lg:w-[300px]">
            {released ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Released</span> {a.releasedAt ? fmtDate(a.releasedAt) : ""} · arrived{" "}
                {fmtDayMonth(a.arrivalDate)}
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Day {row.stay.day} of {row.stay.total}
                  </span>{" "}
                  Arrived {fmtDayMonth(a.arrivalDate)} · release {fmtDayMonth(a.releaseDate)}
                </p>
                <ProgressBar value={row.stay.ratio} className="mt-2" />
              </>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {canArrive && !released ? (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          ) : null}
          <Button variant="outline" asChild>
            <Link href={`/animals/${a.id}/report`}>
              <Download /> Export PDF
            </Link>
          </Button>
          {canRecord && !released && a.stayStatus === "active" ? (
            <Button variant="outline" onClick={() => setObsOpen(true)}>
              <Camera /> New observation
            </Button>
          ) : null}
          {canArrive && a.stayStatus === "arriving" ? (
            <Button asChild>
              <Link href={`/animals/new?animal=${a.id}`}>
                <ClipboardCheck /> Complete arrival exam
              </Link>
            </Button>
          ) : null}
          {canArrive && !released ? (
            <Button variant="outline" onClick={() => setReleaseOpen(true)}>
              <LogOut /> Release animal…
            </Button>
          ) : null}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="order-2 min-w-0 lg:order-1">
          <HealthRecord animalId={a.id} arrivalDate={a.arrivalDate} animalLabel={`${a.kennelCode} ${a.name}`} focus={focus} />
        </div>

        <div className="order-1 space-y-5 lg:order-2">
          <AiSummaryCard
            summary={summary}
            onCite={cite}
            footer="AI-generated from this animal’s records. Every statement cites its source."
          />

          {!released ? (
            <Panel className="space-y-3 p-5">
              <SectionLabel>Today</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                <TodayTile label="Arrival exam" value={exam ? "Done" : "Pending"} tone={exam ? "success" : "warning"} dashed={!exam} />
                {checkTile(row.am)}
                {checkTile(row.pm)}
              </div>
              {openCases.map((c) => (
                <Link
                  key={c.id}
                  href={`/cases?id=${c.id}`}
                  className="flex items-center gap-3 rounded-xl bg-subtle px-3 py-3 hover:bg-muted"
                >
                  <FolderOpen className="size-4 text-info" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-mono font-semibold">{c.id}</span> · {c.title}
                  </span>
                  <StatusChip tone={CASE_STATUS[c.status].tone} dot size="sm">
                    {CASE_STATUS[c.status].label}
                  </StatusChip>
                </Link>
              ))}
            </Panel>
          ) : null}

          <Panel className="space-y-4 p-5">
            <SectionLabel>Stay details</SectionLabel>
            <DetailList
              items={[
                { label: "Kennel / room", value: a.kennelCode },
                { label: "Breed", value: a.breed || "—" },
                { label: "Date of birth", value: fmtDate(a.dateOfBirth) },
                { label: "Arrival", value: fmtDate(a.arrivalDate) },
                { label: released ? "Released" : "Release", value: fmtDate(a.releasedAt ?? a.releaseDate) },
                { label: "Examining vet", value: exam?.vetName ?? "Pending" },
                { label: "Baseline weight", value: exam ? `${exam.weightKg.toFixed(1)} kg` : "—" },
              ]}
            />
            {cases.some((c) => c.status === "closed") ? (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs text-muted-foreground">Closed cases</p>
                {cases
                  .filter((c) => c.status === "closed")
                  .map((c) => (
                    <Link key={c.id} href={`/cases?id=${c.id}`} className="block truncate text-sm hover:underline">
                      <span className="font-mono font-semibold">{c.id}</span> · {c.title}
                    </Link>
                  ))}
              </div>
            ) : null}
          </Panel>

          <Panel className="space-y-3 p-5" as="section">
            <div id="medication-card" />
            <SectionLabel
              actions={
                <Link href="/medication" className="text-sm font-semibold text-primary hover:underline">
                  Manage
                </Link>
              }
            >
              Medication
            </SectionLabel>
            {medications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active medication or supplements.</p>
            ) : (
              <ul className="divide-y divide-border">
                {medications.map((m) => (
                  <li key={m.schedule.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {m.schedule.item} · {m.schedule.dose} {m.schedule.route.toLowerCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.frequency} · {fmtDayMonth(m.schedule.startDate)}–{fmtDayMonth(m.schedule.endDate)}
                      </p>
                    </div>
                    {m.nextDose ? (
                      m.nextDose.state === "overdue" ? (
                        <StatusChip tone="danger" dot size="sm">
                          Overdue
                        </StatusChip>
                      ) : m.nextDose.state === "due" ? (
                        <StatusChip tone="info" size="sm">
                          Due {m.nextDose.time}
                        </StatusChip>
                      ) : (
                        <StatusChip tone="success" size="sm">
                          Given today
                        </StatusChip>
                      )
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <AnimalEditDialog animal={a} open={editOpen} onOpenChange={setEditOpen} />
      <NewObservationDialog open={obsOpen} onOpenChange={setObsOpen} defaultAnimalId={a.id} />
      <ConfirmDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        title={`Release ${a.name}?`}
        description={`${a.kennelCode} becomes vacant and ${a.name} drops out of active monitoring and AI matching. The release is audited.`}
        confirmLabel="Release animal"
        icon={<LogOut className="size-5" />}
        loading={release.isPending}
        onConfirm={() => release.mutate()}
      >
        {openCases.length > 0 ? (
          <p className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-sm text-warning">
            {openCases.length} open case{openCases.length === 1 ? "" : "s"} ({openCases.map((c) => c.id).join(", ")}) will be closed with
            reason “Animal released”, and active medication schedules stop.
          </p>
        ) : null}
        <Field label="Release note" htmlFor="release-note" hint="Optional — e.g. collected by owner, transferred.">
          <Textarea id="release-note" rows={3} value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  )
}
