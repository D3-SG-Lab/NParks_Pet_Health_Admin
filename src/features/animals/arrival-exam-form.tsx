"use client"

import { useQuery } from "@tanstack/react-query"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Segmented } from "@/components/common/filters"
import { Field, FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { isApiError } from "@/lib/errors"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import { completeArrivalExam } from "@/services/animals"
import { getReferenceData } from "@/services/reference"
import type { Animal } from "@/types/domain"

export const EXAM_SYSTEMS = ["Skin / coat", "Eyes", "Nose", "Ears", "Mouth", "Hydration", "Respiratory"]
const MENTATIONS = ["Responsive", "Calm", "Active", "Alert"] as const

const schema = z
  .object({
    vetId: z.string().min(1, "Pick the examining vet."),
    weight: z
      .string()
      .trim()
      .min(1, "Enter the weight.")
      .refine((v) => {
        const n = Number(v)
        return Number.isFinite(n) && n >= 0.1 && n < 150
      }, "Enter a weight between 0.1 and 150 kg."),
    mentation: z.enum(MENTATIONS),
    findings: z.array(z.object({ system: z.string(), normal: z.boolean(), note: z.string() })),
    notes: z.string().max(1000, "Keep notes under 1,000 characters."),
  })
  .superRefine((v, ctx) => {
    v.findings.forEach((f, i) => {
      if (!f.normal && !f.note.trim())
        ctx.addIssue({ code: "custom", path: ["findings", i, "note"], message: "Abnormal findings need a note." })
    })
  })
type FormValues = z.infer<typeof schema>

/** Arrival Exam, step 2 of 2 (FE-008 / BE-010). Completing it starts active monitoring. */
export function ArrivalExamForm({ animal, onCompleted }: { animal: Animal; onCompleted: (observationCount: number) => void }) {
  const ref = useQuery({ queryKey: ["reference"], queryFn: getReferenceData })
  const vets = (ref.data?.users ?? []).filter((u) => u.role === "vet" && u.status === "active")
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vetId: "",
      weight: "",
      mentation: "Responsive",
      findings: EXAM_SYSTEMS.map((system) => ({ system, normal: true, note: "" })),
      notes: "",
    },
  })
  const findings = useWatch({ control: form.control, name: "findings" })

  const complete = useServiceMutation(
    (v: FormValues) =>
      completeArrivalExam(animal.id, {
        vetId: v.vetId,
        weightKg: Number(v.weight),
        mentation: v.mentation,
        findings: v.findings,
        notes: v.notes,
      }),
    {
      success: (r) =>
        r.observationIds.length
          ? `Arrival exam completed · ${r.observationIds.length} abnormal finding${r.observationIds.length === 1 ? "" : "s"} sent for AI routing`
          : `Arrival exam completed · ${animal.name} is now under active monitoring`,
      silentError: true,
      onSuccess: (r) => onCompleted(r.observationIds.length),
      onError: (e) => {
        const field = isApiError(e) ? (e.field === "weightKg" ? "weight" : e.field === "vetId" ? "vetId" : undefined) : undefined
        form.setError(field ?? "root", { message: e.message })
      },
    }
  )
  const e = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit((v) => complete.mutate(v))} noValidate className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Examining vet" required error={e.vetId?.message}>
          <Controller
            control={form.control}
            name="vetId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full" aria-label="Examining vet" aria-invalid={Boolean(e.vetId)}>
                  <SelectValue placeholder="Choose vet" />
                </SelectTrigger>
                <SelectContent>
                  {vets.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Weight (kg)" required htmlFor="ex-weight" error={e.weight?.message}>
          <Input id="ex-weight" inputMode="decimal" placeholder="e.g. 6.4" aria-invalid={Boolean(e.weight)} {...form.register("weight")} />
        </Field>
        <Field label="Mentation" required className="md:col-span-2">
          <Controller
            control={form.control}
            name="mentation"
            render={({ field }) => (
              <Segmented
                ariaLabel="Mentation"
                className="w-full sm:w-auto"
                value={field.value}
                onChange={field.onChange}
                options={MENTATIONS.map((m) => ({ value: m, label: m }))}
              />
            )}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Physical exam</legend>
        <div className="divide-y divide-border rounded-xl border border-border">
          {EXAM_SYSTEMS.map((system, i) => {
            const normal = findings[i]?.normal ?? true
            const noteError = e.findings?.[i]?.note?.message
            return (
              <div
                key={system}
                className={cn("grid gap-3 px-4 py-3 sm:grid-cols-[160px_auto_minmax(0,1fr)] sm:items-start", !normal && "bg-abnormal-tile")}
              >
                <p className="pt-2 text-sm font-medium">{system}</p>
                <Controller
                  control={form.control}
                  name={`findings.${i}.normal`}
                  render={({ field }) => (
                    <Segmented
                      size="sm"
                      ariaLabel={`${system} finding`}
                      value={field.value ? "normal" : "abnormal"}
                      onChange={(v) => field.onChange(v === "normal")}
                      options={[
                        { value: "normal", label: "Normal" },
                        { value: "abnormal", label: <span className={cn(!normal && "text-abnormal")}>Abnormal</span> },
                      ]}
                    />
                  )}
                />
                {!normal ? (
                  <div>
                    <Input
                      aria-label={`${system} note`}
                      placeholder="Describe the finding (required)"
                      aria-invalid={Boolean(noteError)}
                      {...form.register(`findings.${i}.note`)}
                    />
                    {noteError ? <p className="mt-1 text-[13px] text-destructive">{noteError}</p> : null}
                  </div>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Abnormal findings create observations that are sent for AI routing.</p>
      </fieldset>

      <Field label="Exam notes" htmlFor="ex-notes" error={e.notes?.message}>
        <Textarea id="ex-notes" rows={3} {...form.register("notes")} />
      </Field>

      <FormError message={e.root?.message} />

      <div className="flex justify-end border-t border-border pt-5">
        <Button type="submit" size="lg" loading={complete.isPending}>
          Complete exam
        </Button>
      </div>
    </form>
  )
}
