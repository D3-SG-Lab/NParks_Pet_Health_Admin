"use client"

import Link from "next/link"
import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ExternalLink, History, Lock, Sparkles } from "lucide-react"

import { AnimalAvatar } from "@/components/common/avatars"
import { KennelCode, StatusChip } from "@/components/common/status-chip"
import { PanelSkeleton, QueryError } from "@/components/common/states"
import { FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useUser } from "@/hooks/use-session"
import { errorMessage } from "@/lib/errors"
import { fmtDate, fmtTime } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import { roleHas } from "@/config/rbac"
import { getInspectionForm, recordInspection, type BoardTile, type InspectionForm } from "@/services/inspections"
import type { ChecklistItem, ChecklistOption, Session } from "@/types/domain"

interface RowMeta {
  itemId: string
  label: string
  section: string
  input: ChecklistItem["input"]
  options: ChecklistOption[]
  noteIfAbnormal: boolean
  /** First row of a grouped item (shows the group heading). */
  groupLabel: string | null
}

function buildRows(items: ChecklistItem[]): RowMeta[] {
  const rows: RowMeta[] = []
  for (const item of items) {
    if (item.input === "free_text") continue
    const labels = item.rows.length > 0 ? item.rows : [item.label]
    labels.forEach((label, i) =>
      rows.push({
        itemId: item.id,
        label,
        section: item.section,
        input: item.input,
        options: item.options,
        noteIfAbnormal: item.noteIfAbnormal,
        groupLabel: item.rows.length > 0 && i === 0 ? item.label : null,
      })
    )
  }
  return rows
}

const isAbnormal = (meta: RowMeta, value: string) => Boolean(meta.options.find((o) => o.label === value)?.abnormal)

function ChoiceChips({
  meta,
  value,
  onChange,
  disabled,
  labelId,
}: {
  meta: RowMeta
  value: string
  onChange: (v: string) => void
  disabled: boolean
  labelId: string
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
      {meta.options.map((o) => {
        const selected = o.label === value
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(o.label)}
            className={cn(
              "inline-flex h-8 items-center rounded-md border px-2.5 text-[13px] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none disabled:cursor-not-allowed",
              selected && !o.abnormal && "border-primary bg-primary-soft text-primary",
              selected && o.abnormal && "border-abnormal bg-abnormal-soft text-abnormal",
              !selected &&
                "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground disabled:hover:border-border"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function InspectionFormBody({
  form,
  tile,
  date,
  session,
  readOnly,
  onDone,
}: {
  form: InspectionForm
  tile: BoardTile
  date: string
  session: Session
  readOnly: boolean
  onDone: () => void
}) {
  const router = useRouter()
  const rowsMeta = useMemo(() => buildRows(form.items), [form.items])
  const hasOther = form.items.some((i) => i.input === "free_text")

  const schema = useMemo(
    () =>
      z
        .object({
          rows: z.array(
            z.object({ value: z.string().min(1, "Pick a value."), note: z.string().max(300, "Keep notes under 300 characters.") })
          ),
          otherFindings: z.string().max(1000, "Keep other findings under 1000 characters."),
        })
        .superRefine((v, ctx) => {
          v.rows.forEach((r, i) => {
            const meta = rowsMeta[i]
            if (meta && meta.noteIfAbnormal && isAbnormal(meta, r.value) && !r.note.trim()) {
              ctx.addIssue({ code: "custom", path: ["rows", i, "note"], message: "Add a note for the abnormal finding." })
            }
          })
        }),
    [rowsMeta]
  )
  type Values = z.infer<typeof schema>

  const defaults: Values = useMemo(() => {
    const items = new Map(form.items.map((i) => [i.id, i]))
    return {
      rows: rowsMeta.map((m) => {
        const prev = form.existing?.results.find((r) => r.label === m.label)
        return { value: prev?.value ?? items.get(m.itemId)?.defaultOption ?? m.options[0]?.label ?? "", note: prev?.note ?? "" }
      }),
      otherFindings: form.existing?.otherFindings ?? "",
    }
  }, [form, rowsMeta])

  const { control, handleSubmit, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults })
  const values = useWatch({ control }) as Values
  const abnormalCount =
    values.rows.filter((r, i) => rowsMeta[i] && isAbnormal(rowsMeta[i], r.value)).length + (values.otherFindings.trim() ? 1 : 0)

  const save = useServiceMutation(recordInspection, {
    silentError: true,
    success: (r) =>
      r.observationId
        ? `${r.edited ? "Inspection updated" : "Inspection saved"} · abnormal findings sent for AI routing (${r.observationId})`
        : r.edited
          ? "Inspection updated · edit recorded in the audit log"
          : `${session} inspection saved for ${form.animal.name}`,
    successAction: (r) =>
      r.observationId ? { label: "Review queue", onClick: () => router.push(`/review?id=${r.observationId}`) } : undefined,
    onSuccess: () => onDone(),
  })

  const submit = handleSubmit((v) =>
    save.mutate({
      animalId: form.animal.id,
      date,
      session,
      otherFindings: v.otherFindings,
      results: v.rows.map((r, i) => {
        const m = rowsMeta[i]
        return {
          itemId: m.itemId,
          label: m.label,
          value: r.value,
          abnormal: isAbnormal(m, r.value),
          note: isAbnormal(m, r.value) ? r.note.trim() : "",
        }
      }),
    })
  )

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {form.existing ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-info-border bg-info-soft px-3.5 py-2.5 text-[13px] text-info">
            <History className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Recorded {fmtTime(form.existing.at)}
              {tile.inspectorName ? ` by ${tile.inspectorName}` : ""}
              {form.existing.editedAt ? ` · last edited ${fmtTime(form.existing.editedAt)}` : ""}. Edits are audited.
            </span>
          </div>
        ) : null}
        {readOnly ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-border bg-subtle px-3.5 py-2.5 text-[13px] text-muted-foreground">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            Read only — your role or kennel scope doesn’t include recording inspections for {tile.kennel.code}.
          </div>
        ) : null}

        <div className="divide-y divide-border">
          {rowsMeta.map((meta, i) => {
            const showSection = i === 0 || rowsMeta[i - 1].section !== meta.section
            const labelId = `insp-row-${i}`
            const abnormal = isAbnormal(meta, values.rows[i]?.value ?? "")
            return (
              <div key={`${meta.itemId}-${meta.label}`} className={cn(showSection ? "pt-4" : "pt-3", "pb-3")}>
                {showSection ? <p className="eyebrow mb-3">{meta.section}</p> : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span id={labelId} className="text-sm font-semibold text-foreground">
                    {meta.label}
                  </span>
                  <Controller
                    control={control}
                    name={`rows.${i}.value`}
                    render={({ field }) => (
                      <ChoiceChips meta={meta} value={field.value} onChange={field.onChange} disabled={readOnly} labelId={labelId} />
                    )}
                  />
                </div>
                {abnormal && meta.noteIfAbnormal ? (
                  <Controller
                    control={control}
                    name={`rows.${i}.note`}
                    render={({ field, fieldState }) => (
                      <div className="mt-2">
                        <Textarea
                          {...field}
                          disabled={readOnly}
                          aria-label={`${meta.label} note`}
                          aria-invalid={Boolean(fieldState.error) || undefined}
                          placeholder={`Describe the ${meta.label.toLowerCase()} finding`}
                          className="min-h-14"
                        />
                        {fieldState.error ? <p className="mt-1 text-[13px] text-destructive">{fieldState.error.message}</p> : null}
                      </div>
                    )}
                  />
                ) : null}
              </div>
            )
          })}
        </div>

        {hasOther ? (
          <div className="pt-4">
            <p className="eyebrow mb-2">Other findings</p>
            <Controller
              control={control}
              name="otherFindings"
              render={({ field }) => (
                <Textarea
                  {...field}
                  disabled={readOnly}
                  aria-label="Other findings"
                  placeholder="Optional — anything else you noticed"
                  className="min-h-20"
                />
              )}
            />
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ai">
              <Sparkles className="size-3.5" aria-hidden /> Any text is sent for AI review
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border bg-card px-5 py-4">
        {save.error ? (
          <div className="mb-3">
            <FormError message={errorMessage(save.error)} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] text-muted-foreground">
            {abnormalCount > 0 ? (
              <span className="font-semibold text-abnormal">{abnormalCount} abnormal · will be sent for AI routing</span>
            ) : (
              "All normal"
            )}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onDone}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly ? (
              <Button type="submit" loading={save.isPending} disabled={formState.isSubmitting}>
                {form.existing ? "Save changes" : "Save inspection"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  )
}

export function InspectionSheet({
  tile,
  date,
  session,
  onClose,
}: {
  tile: BoardTile | null
  date: string
  session: Session
  onClose: () => void
}) {
  const user = useUser()
  const animal = tile?.animal ?? null
  const recordable = animal?.stayStatus === "active"
  const q = useQuery({
    queryKey: ["inspection-form", animal?.id, date, session],
    queryFn: () => getInspectionForm(animal!.id, date, session),
    enabled: Boolean(animal && recordable),
  })
  const canRecord = Boolean(
    animal && roleHas(user.role, "record") && (user.role !== "contractor" || user.kennelScope.includes(animal.kennelCode.split("-")[0]))
  )

  return (
    <Sheet open={Boolean(tile)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-[520px]">
        {animal && tile ? (
          <>
            <div className="border-b border-border px-5 pt-5 pb-4">
              <div className="flex items-start gap-3 pr-8">
                <AnimalAvatar name={animal.name} speciesId={animal.speciesId} />
                <div className="min-w-0">
                  <SheetTitle className="text-lg font-semibold">
                    {q.data?.existing ? "Inspection" : "Record inspection"} · {animal.name}
                  </SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <KennelCode code={animal.kennelCode} />
                    <span>
                      {session} session · {fmtDate(date)}
                    </span>
                    {q.data ? (
                      <StatusChip size="sm" tone="neutral">
                        {q.data.templateName} v{q.data.templateVersion}
                      </StatusChip>
                    ) : null}
                  </SheetDescription>
                </div>
              </div>
              <Link
                href={`/animals/${animal.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
              >
                Open animal record <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </div>
            {!recordable ? (
              <div className="p-5 text-sm text-muted-foreground">
                {animal.stayStatus === "arriving"
                  ? "Daily inspections start once the arrival exam is completed."
                  : "Released animals are no longer inspected."}
              </div>
            ) : q.isPending ? (
              <PanelSkeleton lines={8} />
            ) : q.isError ? (
              <div className="p-5">
                <QueryError error={q.error} onRetry={() => q.refetch()} title="Couldn’t load the checklist" />
              </div>
            ) : (
              <InspectionFormBody
                key={`${animal.id}-${date}-${session}-${q.data.existing?.editedAt ?? q.data.existing?.at ?? "new"}`}
                form={q.data}
                tile={tile}
                date={date}
                session={session}
                readOnly={!canRecord}
                onDone={onClose}
              />
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
