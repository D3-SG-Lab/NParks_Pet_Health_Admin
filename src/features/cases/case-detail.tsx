"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CircleCheck, Download, FolderOpen, FolderX } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { AiSummaryCard } from "@/components/common/ai-card"
import { AnimalAvatar } from "@/components/common/avatars"
import { EvidenceViewer, MediaThumb } from "@/components/common/evidence"
import { StatusChip } from "@/components/common/status-chip"
import { PanelSkeleton, QueryError } from "@/components/common/states"
import { Panel, SectionLabel } from "@/components/common/surfaces"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { usePermission, useUser } from "@/hooks/use-session"
import { fmtDateTime, fmtDayMonth, fmtShortDateTime, fmtTime } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { CASE_STATUS } from "@/lib/status"
import { cn } from "@/lib/utils"
import { addCaseNote, assignCase, CLOSE_REASON_LABEL, getCase, setCaseStatus, type CaseDetail } from "@/services/cases"
import { listAssignees } from "@/services/dashboard"
import { getReferenceData } from "@/services/reference"
import type { MediaRef } from "@/types/domain"

import { CloseCaseDialog, ReopenCaseDialog } from "./case-dialogs"
import { FollowUps } from "./follow-ups"

const noteSchema = z.object({
  text: z.string().trim().min(2, "Write a note before posting.").max(2000, "Notes are limited to 2,000 characters."),
})
type NoteValues = z.infer<typeof noteSchema>

export function caseTheme(title: string): string {
  return title.split(/\s+[—-]\s+|,/)[0]
}

function AssignSelect({ detail, canEdit }: { detail: CaseDetail; canEdit: boolean }) {
  const assignees = useQuery({
    queryKey: ["assignees", detail.animal.id],
    queryFn: () => listAssignees(detail.animal.id),
    enabled: canEdit,
  })
  const options = useMemo(() => {
    const list = (assignees.data ?? []).filter((a) => a.role !== "contractor")
    if (detail.case.assigneeId && !list.some((a) => a.id === detail.case.assigneeId))
      list.unshift({ id: detail.case.assigneeId, name: detail.assigneeName, role: "" })
    return list
  }, [assignees.data, detail.case.assigneeId, detail.assigneeName])
  const mutation = useServiceMutation((id: string) => assignCase(detail.case.id, id), {
    success: (_d, id) => `Case assigned to ${options.find((o) => o.id === id)?.name ?? "user"}`,
  })
  const disabled = !canEdit || detail.case.status === "closed" || mutation.isPending
  return (
    <div className="flex items-center gap-3">
      <span id={`assign-${detail.case.id}`} className="text-sm whitespace-nowrap text-muted-foreground">
        Assigned to
      </span>
      {disabled && !mutation.isPending ? (
        <span className={cn("text-sm font-semibold", !detail.case.assigneeId && "text-warning")}>
          {detail.case.assigneeId ? detail.assigneeName : "Unassigned"}
        </span>
      ) : (
        <Select value={detail.case.assigneeId ?? ""} onValueChange={(v) => mutation.mutate(v)} disabled={disabled}>
          <SelectTrigger className="w-[180px]" aria-labelledby={`assign-${detail.case.id}`}>
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function Notes({ detail }: { detail: CaseDetail }) {
  const user = useUser()
  const canPost = user.role !== "auditor" && user.role !== "admin"
  const form = useForm<NoteValues>({ resolver: zodResolver(noteSchema), defaultValues: { text: "" } })
  const mutation = useServiceMutation((v: NoteValues) => addCaseNote(detail.case.id, v.text), {
    success: "Note posted",
    onSuccess: () => form.reset(),
  })
  const error = form.formState.errors.text?.message
  return (
    <div>
      <SectionLabel>Notes</SectionLabel>
      <ul className="mt-3 space-y-2.5">
        {detail.notes.length === 0 ? <li className="text-sm text-muted-foreground">No notes yet.</li> : null}
        {detail.notes.map((n) => (
          <li key={n.id} className="rounded-xl bg-subtle px-3.5 py-3">
            <p className="text-xs">
              <span className="font-semibold text-foreground">{n.authorName}</span>
              <span className="font-mono text-muted-foreground"> · {fmtShortDateTime(n.at)}</span>
            </p>
            <p className="mt-1 text-sm whitespace-pre-line text-foreground">{n.text}</p>
          </li>
        ))}
      </ul>
      {canPost ? (
        <form className="mt-3 space-y-2" onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
          <label htmlFor={`note-${detail.case.id}`} className="sr-only">
            Add a note
          </label>
          <Textarea
            id={`note-${detail.case.id}`}
            rows={3}
            placeholder="Add a note for this case…"
            aria-invalid={Boolean(error) || undefined}
            {...form.register("text")}
          />
          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">Notes are audited and cannot be edited after posting.</p>
            <Button type="submit" size="sm" loading={mutation.isPending}>
              Post note
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

/** Right-hand detail of the Health cases workbench (FE-016, p.4). */
export function CaseDetailPanel({ caseId, onBack }: { caseId: string; onBack: () => void }) {
  const canEdit = usePermission("cases")
  const q = useQuery({ queryKey: ["case", caseId], queryFn: () => getCase(caseId) })
  const ref = useQuery({ queryKey: ["reference"], queryFn: getReferenceData })
  const [closeOpen, setCloseOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const markReviewed = useServiceMutation(() => setCaseStatus(caseId, "open"), { success: `Case ${caseId} marked reviewed` })

  if (q.error) {
    return (
      <Panel className="p-4">
        <BackButton onBack={onBack} />
        <QueryError error={q.error} onRetry={() => void q.refetch()} title="Couldn’t load the case" />
      </Panel>
    )
  }
  if (q.isPending) {
    return (
      <Panel>
        <PanelSkeleton lines={8} />
      </Panel>
    )
  }

  const d = q.data
  const c = d.case
  const status = CASE_STATUS[c.status]
  const userName = (id: string) => ref.data?.users.find((u) => u.id === id)?.name ?? ""
  const mediaSource = (m: MediaRef) => d.linked.find((l) => l.media.some((x) => x.id === m.id))?.id
  const evidence = c.evidence

  const cite = (refId: string) => {
    const el = document.getElementById(`case-linked-${refId}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlight(refId)
      window.setTimeout(() => setHighlight((h) => (h === refId ? null : h)), 2200)
    } else {
      toast.info(`Source ${refId} is not linked to this case.`)
    }
  }

  return (
    <Panel className="overflow-hidden">
      <div className="space-y-4 p-5">
        <div className="lg:hidden">
          <BackButton onBack={onBack} />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={c.status === "closed" ? "neutral" : "info"} dot={c.status !== "closed"}>
              {c.status === "closed" ? "Closed" : "Open"}
            </StatusChip>
            {c.status === "needs_review" ? <StatusChip tone="warning">{status.label}</StatusChip> : null}
            <span className="font-mono text-xs text-muted-foreground">
              {c.id} · opened {fmtDayMonth(c.openedAt)} by {d.openedByName} · {d.observationCount} observation
              {d.observationCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/cases/${encodeURIComponent(c.id)}/report`} target="_blank" rel="noopener">
                <Download /> Case report PDF
              </Link>
            </Button>
            {canEdit && c.status === "needs_review" ? (
              <Button variant="soft" size="sm" loading={markReviewed.isPending} onClick={() => markReviewed.mutate()}>
                <CircleCheck /> Mark reviewed
              </Button>
            ) : null}
            {canEdit && c.status !== "closed" ? (
              <Button variant="destructive-outline" size="sm" onClick={() => setCloseOpen(true)}>
                <FolderX /> Close case…
              </Button>
            ) : null}
            {canEdit && c.status === "closed" ? (
              <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)}>
                <FolderOpen /> Reopen case…
              </Button>
            ) : null}
          </div>
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-foreground">{c.title}</h2>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/animals/${d.animal.id}`}
            className="group flex items-center gap-3 rounded-lg focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
          >
            <AnimalAvatar name={d.animal.name} speciesId={d.animal.speciesId} />
            <span>
              <span className="block text-sm font-semibold text-foreground group-hover:underline">{d.animal.name}</span>
              <span className="block font-mono text-xs text-muted-foreground">
                {d.animal.kennelCode} · {d.speciesName} · Day {d.stay.day} of {d.stay.total}
              </span>
            </span>
          </Link>
          <AssignSelect detail={d} canEdit={canEdit} />
        </div>

        {c.status === "closed" ? (
          <div className="rounded-xl border border-border bg-subtle px-4 py-3 text-sm">
            <p className="font-semibold text-foreground">
              Closed {c.closedAt ? fmtDateTime(c.closedAt) : ""}
              {d.closedByName ? ` by ${d.closedByName}` : ""} · {CLOSE_REASON_LABEL[c.closeReason ?? "other"]}
            </p>
            {c.closeNote ? <p className="mt-1 text-muted-foreground">{c.closeNote}</p> : null}
          </div>
        ) : null}

        <AiSummaryCard title="Case summary · AI" summary={d.summary} variant="inline" onCite={cite} />
      </div>

      <div className="grid border-t border-border lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6 p-5 lg:border-r lg:border-border">
          <FollowUps detail={d} canEdit={canEdit} />
          <div>
            <SectionLabel>Linked observations &amp; events</SectionLabel>
            {d.linked.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No linked observations.</p>
            ) : (
              <ol className="relative mt-3">
                {d.linked.map((l, i) => (
                  <li
                    key={l.id}
                    id={`case-linked-${l.id}`}
                    className={cn(
                      "relative grid grid-cols-[44px_20px_minmax(0,1fr)] gap-x-2 rounded-lg pb-4 transition-colors",
                      highlight === l.id && "bg-ai-soft"
                    )}
                  >
                    <span className="pt-0.5 font-mono text-xs text-muted-foreground">{fmtDayMonth(l.at)}</span>
                    <span className="relative flex justify-center">
                      {i < d.linked.length - 1 ? <span className="absolute top-4 bottom-[-16px] w-px bg-border" aria-hidden /> : null}
                      <span
                        aria-hidden
                        className={cn(
                          "relative mt-1 inline-flex size-3.5 items-center justify-center rounded-full border-2 bg-card",
                          l.kind === "created" ? "border-navy" : "border-abnormal"
                        )}
                      >
                        <span className={cn("size-1.5 rounded-full", l.kind === "created" ? "bg-navy" : "bg-abnormal")} />
                      </span>
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-muted-foreground">
                        {fmtTime(l.at)} · {l.meta.replace(" · routed by AI", "")}
                        {l.aiRouted ? <span className="font-sans font-semibold text-ai"> · routed by AI</span> : null}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-foreground">{l.text}</p>
                      {l.media.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {l.media.map((m) => (
                            <MediaThumb
                              key={m.id}
                              media={m}
                              size="sm"
                              onClick={() =>
                                setViewer(
                                  Math.max(
                                    0,
                                    evidence.findIndex((e) => e.id === m.id)
                                  )
                                )
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
        <div className="space-y-6 border-t border-border p-5 lg:border-t-0">
          <div>
            <SectionLabel>Evidence · {evidence.length}</SectionLabel>
            {evidence.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No photos or videos attached.</p>
            ) : (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {evidence.map((m, i) => (
                  <MediaThumb key={m.id} media={m} onClick={() => setViewer(i)} className="aspect-square size-auto w-full" />
                ))}
              </div>
            )}
          </div>
          <Notes detail={d} />
        </div>
      </div>

      <EvidenceViewer
        items={evidence}
        index={viewer}
        onIndexChange={setViewer}
        title={`${d.animal.kennelCode} ${d.animal.name}`}
        subtitle={(m) =>
          [fmtDateTime(m.at), userName(m.byUserId), mediaSource(m) ? `Observation ${mediaSource(m)}` : null].filter(Boolean).join(" · ")
        }
      />
      {canEdit ? (
        <>
          <CloseCaseDialog
            open={closeOpen}
            onOpenChange={setCloseOpen}
            caseId={c.id}
            animalName={d.animal.name}
            theme={caseTheme(c.title)}
          />
          <ReopenCaseDialog open={reopenOpen} onOpenChange={setReopenOpen} caseId={c.id} />
        </>
      ) : null}
    </Panel>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
      <ArrowLeft /> All cases
    </Button>
  )
}
