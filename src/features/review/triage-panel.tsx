"use client"

import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Search, Sparkles } from "lucide-react"
import { z } from "zod"

import { AnimalAvatar } from "@/components/common/avatars"
import { EvidenceViewer, MediaThumb } from "@/components/common/evidence"
import { StatusChip } from "@/components/common/status-chip"
import { SectionLabel } from "@/components/common/surfaces"
import { Field } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useDebounced } from "@/hooks/use-debounced"
import { fmtAge, fmtDateTime, fmtDayMonth, fmtShortDateTime, percent } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import {
  caseOptionsForAnimal,
  ROUTING_LABEL,
  searchActiveAnimals,
  skipReviewItem,
  triageObservation,
  type QueueCandidate,
  type QueueItem,
} from "@/services/observations"
import type { RoutingAction } from "@/types/domain"

import { RadioCards } from "../cases/radio-cards"
import { reasonChip, reporterLabel, systemWord } from "./review-helpers"

const schema = z.object({
  animalId: z.string().min(1, "Pick the animal this observation is about."),
  action: z.enum(["timeline", "new_case", "update_case", "reopen_case"], { message: "Pick a case action." }),
  caseId: z.string().nullable(),
  note: z.string().max(500, "Keep the note under 500 characters."),
})
type Values = z.infer<typeof schema>

function CandidateCard({
  c,
  selected,
  onSelect,
  manual,
}: {
  c: QueueCandidate
  selected: boolean
  onSelect: () => void
  manual?: boolean
}) {
  const a = c.animal
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none",
        selected ? "border-primary bg-selected shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:border-border-strong"
      )}
    >
      <AnimalAvatar name={a.name} speciesId={a.speciesId} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {a.kennelCode} · {a.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {c.speciesName} · {a.sex} · {fmtAge(a.dateOfBirth)} · {c.status}
        </span>
      </span>
      {manual ? (
        <span className="text-xs font-semibold text-muted-foreground">Manual</span>
      ) : (
        <span className="flex w-[72px] shrink-0 flex-col items-end gap-1">
          <span className={cn("text-xs font-semibold tabular-nums", c.confidence >= 0.8 ? "text-success" : "text-warning")}>
            {percent(c.confidence)}
          </span>
          <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full", c.confidence >= 0.8 ? "bg-success" : "bg-[#e0a33c]")}
              style={{ width: percent(c.confidence) }}
            />
          </span>
        </span>
      )}
    </button>
  )
}

function AnimalSearch({ onPick }: { onPick: (c: QueueCandidate) => void }) {
  const [value, setValue] = useState("")
  const q = useDebounced(value.trim(), 200)
  const results = useQuery({ queryKey: ["animal-search", q], queryFn: () => searchActiveAnimals(q), enabled: q.length >= 1 })
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Or search another animal…"
        aria-label="Search another animal by kennel code, name or microchip"
        className="h-10 w-full rounded-lg border border-transparent bg-muted pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-primary/15"
      />
      {q.length >= 1 ? (
        <div
          className="absolute inset-x-0 top-11 z-20 rounded-xl border border-border bg-popover p-1 shadow-[var(--shadow-raised)]"
          role="listbox"
          aria-label="Animal search results"
        >
          {results.isPending ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : (results.data ?? []).length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No active animal matches “{q}”.</p>
          ) : (
            results.data?.map((r) => (
              <button
                key={r.animal.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onPick({
                    animal: r.animal,
                    speciesName: r.speciesName,
                    confidence: 0,
                    status: r.animal.stayStatus === "active" ? "Active" : "Arriving",
                  })
                  setValue("")
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <AnimalAvatar name={r.animal.name} speciesId={r.animal.speciesId} size="sm" />
                <span className="text-sm">
                  <span className="font-semibold">
                    {r.animal.kennelCode} · {r.animal.name}
                  </span>{" "}
                  <span className="text-muted-foreground">{r.speciesName}</span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Triage detail for one queue item (FE-017 / BE-019): pick the animal and the
 * case action manually; the decision is recorded against the AI result.
 * Keyed by observation id by the parent so state resets per item.
 */
export function TriagePanel({
  item,
  onDone,
  onBack,
}: {
  item: QueueItem
  onDone: (mode: "triaged" | "skipped") => void
  onBack?: () => void
}) {
  const o = item.observation
  const ai = o.ai
  const chip = reasonChip(item)
  const [manual, setManual] = useState<QueueCandidate | null>(null)
  const [viewer, setViewer] = useState<number | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      animalId: ai?.matchedAnimalId ?? item.candidates[0]?.animal.id ?? "",
      action: (ai?.suggestedAction ?? undefined) as Values["action"],
      caseId: ai?.suggestedCaseId ?? null,
      note: "",
    },
  })
  const animalId = useWatch({ control: form.control, name: "animalId" })
  const action = useWatch({ control: form.control, name: "action" }) as RoutingAction | undefined
  const caseId = useWatch({ control: form.control, name: "caseId" })

  const options = useQuery({
    queryKey: ["case-options", animalId],
    queryFn: () => caseOptionsForAnimal(animalId),
    enabled: Boolean(animalId),
  })
  const open = options.data?.open ?? []
  const reopenable = options.data?.reopenable ?? []

  const candidates = [...item.candidates]
  if (manual && !candidates.some((c) => c.animal.id === manual.animal.id)) candidates.push(manual)
  const selected = candidates.find((c) => c.animal.id === animalId)
  const name = selected?.animal.name ?? "the animal"
  const signCodes = ai?.signs.map((s) => s.code) ?? []

  const actionDisabled: Record<RoutingAction, boolean> = {
    timeline: !animalId,
    new_case: !animalId,
    update_case: !animalId || open.length === 0,
    reopen_case: !animalId || reopenable.length === 0,
  }
  const pool = action === "update_case" ? open : action === "reopen_case" ? reopenable : []
  const effectiveCaseId = pool.some((c) => c.id === caseId) ? caseId : (pool[0]?.id ?? null)
  const actionValid = Boolean(action) && !actionDisabled[action as RoutingAction]

  const triage = useServiceMutation(
    (v: Values) =>
      triageObservation(o.id, {
        animalId: v.animalId,
        action: v.action,
        caseId: v.action === "update_case" || v.action === "reopen_case" ? effectiveCaseId : null,
        signs: ai?.signs,
        note: v.note,
      }),
    {
      success: (r, v) => `${o.id} routed · ${ROUTING_LABEL[v.action].toLowerCase()}${r.caseId ? ` · ${r.caseId}` : ""}`,
      onSuccess: () => onDone("triaged"),
    }
  )
  const skip = useServiceMutation(() => skipReviewItem(o.id), {
    success: `${o.id} skipped — moved to the end of the queue`,
    onSuccess: () => onDone("skipped"),
  })

  const submit = form.handleSubmit((v) => {
    if (!actionValid) {
      form.setError("action", { message: "This case action isn’t available for the selected animal." })
      return
    }
    triage.mutate(v)
  })
  const errors = form.formState.errors

  const caseActionOptions = [
    { value: "timeline" as const, label: "Timeline only", description: `Record on ${name}’s 30-day timeline, no case` },
    {
      value: "new_case" as const,
      label: "New case",
      description: open.length
        ? `${name} has an open case (${open[0].id}) — consider updating it`
        : `No open or recent ${systemWord(signCodes)} case for ${name}`,
    },
    {
      value: "update_case" as const,
      label: "Update open case",
      description: open.length
        ? open.length === 1
          ? `${open[0].id} · ${open[0].title}`
          : `${open.length} open cases — pick one below`
        : "None open for this animal",
    },
    {
      value: "reopen_case" as const,
      label: "Reopen closed case",
      description: reopenable.length
        ? `${reopenable[0].id} · closed ${reopenable[0].closedAt ? fmtDayMonth(reopenable[0].closedAt) : ""} · same or related signs within 14 days`
        : "Same or related signs within 14 days — none for this animal",
    },
  ].map((opt) => ({ ...opt, disabled: actionDisabled[opt.value] }))

  return (
    <div>
      <div className="space-y-3 border-b border-border p-5">
        {onBack ? (
          <Button variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={onBack}>
            <ArrowLeft /> Queue
          </Button>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone={chip.tone} dot={chip.dot}>
            {chip.label}
          </StatusChip>
          <span className="text-xs text-muted-foreground">
            Observation {o.id} · {fmtShortDateTime(o.createdAt)} · {reporterLabel(item)}
          </span>
        </div>
        <p className="text-lg leading-snug font-medium text-foreground">“{o.text}”</p>
        {o.media.length ? (
          <div className="flex flex-wrap gap-2">
            {o.media.map((m, i) => (
              <MediaThumb key={m.id} media={m} onClick={() => setViewer(i)} className="size-24" />
            ))}
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} noValidate className="grid md:grid-cols-2">
        <div className="space-y-4 p-5 md:border-r md:border-border">
          <div className="rounded-xl border border-ai-border bg-ai-soft p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ai">
                <Sparkles className="size-4" aria-hidden /> AI analysis
              </p>
              <span className="font-mono text-xs text-muted-foreground">
                prompt {ai?.promptVersion ?? "—"} · {ai?.latencySec ?? 0} s
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-ai/90">{ai?.rationale || "No AI result available."}</p>
          </div>

          <Field label="Animal" required error={errors.animalId?.message}>
            <div role="radiogroup" aria-label="Animal" className="space-y-2">
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No AI candidates — search for the animal below.</p>
              ) : null}
              {candidates.map((c) => (
                <CandidateCard
                  key={c.animal.id}
                  c={c}
                  manual={manual?.animal.id === c.animal.id && !item.candidates.some((x) => x.animal.id === c.animal.id)}
                  selected={c.animal.id === animalId}
                  onSelect={() => form.setValue("animalId", c.animal.id, { shouldValidate: true })}
                />
              ))}
              <AnimalSearch
                onPick={(c) => {
                  setManual(c)
                  form.setValue("animalId", c.animal.id, { shouldValidate: true })
                }}
              />
            </div>
          </Field>

          {ai && (ai.signs.length || ai.onset) ? (
            <div>
              <SectionLabel>Extracted signs</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ai.signs.map((s) => (
                  <StatusChip key={s.code} tone="abnormal" title={s.code}>
                    {s.label}
                  </StatusChip>
                ))}
                {ai.onset ? <StatusChip tone="neutral">Onset {fmtDayMonth(ai.onset)}</StatusChip> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 border-t border-border p-5 md:border-t-0">
          <Field label="Case action" required error={errors.action?.message}>
            <RadioCards
              ariaLabel="Case action"
              value={action ?? null}
              invalid={Boolean(errors.action)}
              onChange={(v) => {
                form.setValue("action", v, { shouldValidate: true })
                form.clearErrors("action")
              }}
              options={caseActionOptions}
            />
          </Field>
          {pool.length > 1 ? (
            <Field label={action === "update_case" ? "Case to update" : "Case to reopen"} required>
              <Select value={effectiveCaseId ?? ""} onValueChange={(v) => form.setValue("caseId", v)}>
                <SelectTrigger className="w-full" aria-label="Case">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pool.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.id} · {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Triage note" htmlFor={`triage-note-${o.id}`} error={errors.note?.message}>
            <Textarea
              id={`triage-note-${o.id}`}
              rows={2}
              placeholder="Optional — why you chose this animal or action"
              {...form.register("note")}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" loading={skip.isPending} disabled={triage.isPending} onClick={() => skip.mutate()}>
              Skip
            </Button>
            <Button type="submit" loading={triage.isPending} disabled={skip.isPending}>
              Confirm triage
            </Button>
          </div>
          <p className="text-right text-xs text-muted-foreground">Your decision is recorded against the AI result and leaves the queue.</p>
        </div>
      </form>

      <EvidenceViewer
        items={o.media}
        index={viewer}
        onIndexChange={setViewer}
        title={selected ? `${selected.animal.kennelCode} ${selected.animal.name}` : "Unmatched observation"}
        subtitle={(m) => `${fmtDateTime(m.at)} · ${item.reporterName} · Observation ${o.id}`}
      />
    </div>
  )
}
