"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, X } from "lucide-react"

import { Segmented } from "@/components/common/filters"
import { DatePicker } from "@/components/forms/date-picker"
import { Field, FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { todayISO } from "@/lib/clock"
import { errorMessage } from "@/lib/errors"
import { useServiceMutation } from "@/lib/query"
import { listAnimals } from "@/services/animals"
import { createSchedule, linkableCases, updateSchedule, type ScheduleInput } from "@/services/medication"
import type { MedicationRoute, MedicationSchedule } from "@/types/domain"

const ROUTES: MedicationRoute[] = ["Oral", "Topical", "Ear", "Eye", "Injection"]
const FREQUENCIES = ["1x", "2x", "3x", "custom"] as const
type Frequency = (typeof FREQUENCIES)[number]
const EXPECTED: Record<Frequency, number> = { "1x": 1, "2x": 2, "3x": 3, custom: 0 }
const DEFAULT_TIMES: Record<Frequency, string[]> = {
  "1x": ["08:00"],
  "2x": ["08:00", "20:00"],
  "3x": ["08:00", "14:00", "20:00"],
  custom: ["08:00"],
}
const NO_CASE = "none"

const schema = z
  .object({
    animalId: z.string().min(1, "Pick an animal."),
    item: z.string().trim().min(1, "Enter the medication or supplement.").max(80, "Keep it under 80 characters."),
    dose: z.string().trim().min(1, "Enter the dose.").max(40, "Keep it under 40 characters."),
    route: z.enum(["Oral", "Topical", "Ear", "Eye", "Injection"]),
    site: z.string().max(40, "Keep it under 40 characters."),
    frequency: z.enum(FREQUENCIES),
    doseTimes: z.array(z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm.")),
    startDate: z.string().min(1, "Pick a start date."),
    endDate: z.string().min(1, "Pick an end date."),
    caseId: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.startDate && v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date." })
    }
    const expected = EXPECTED[v.frequency]
    if (v.doseTimes.length === 0) ctx.addIssue({ code: "custom", path: ["doseTimes"], message: "Add at least one dose time." })
    else if (expected && v.doseTimes.length !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["doseTimes"],
        message: `${v.frequency.replace("x", "×")} daily needs ${expected} dose time${expected > 1 ? "s" : ""}.`,
      })
    }
    if (new Set(v.doseTimes).size !== v.doseTimes.length)
      ctx.addIssue({ code: "custom", path: ["doseTimes"], message: "Dose times must be different." })
  })

type Values = z.infer<typeof schema>

function DoseTimes({
  value,
  onChange,
  canAdd,
  invalid,
}: {
  value: string[]
  onChange: (v: string[]) => void
  canAdd: boolean
  invalid: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((t, i) => (
        <span
          key={i}
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-input bg-card pr-1 pl-2 aria-invalid:border-destructive"
          aria-invalid={invalid || undefined}
        >
          <input
            type="time"
            value={t}
            aria-label={`Dose time ${i + 1}`}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
            className="w-[118px] bg-transparent font-mono text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove dose time ${t}`}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      {canAdd ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...value, value.length ? "12:00" : "08:00"])}>
          <Plus /> Add time
        </Button>
      ) : null}
    </div>
  )
}

interface ScheduleFormProps {
  /** Existing schedule to edit; omitted for "Add schedule". */
  schedule?: MedicationSchedule
  initialAnimalId?: string | null
  onDone?: () => void
  onCancel?: () => void
  /** Prefix for input ids (several forms may be on screen). */
  idPrefix?: string
  /** Notified when the user picks a different animal. */
  onAnimalChange?: (animalId: string) => void
}

export function ScheduleForm({ schedule, initialAnimalId, onDone, onCancel, idPrefix = "sched", onAnimalChange }: ScheduleFormProps) {
  const today = todayISO()
  const animalsQ = useQuery({
    queryKey: ["animals", "picker", "active"],
    queryFn: () => listAnimals({ tab: "active", pageSize: 1000 }),
  })
  const animals = useMemo(
    () => (animalsQ.data?.allRows ?? []).filter((r) => r.animal.stayStatus !== "released").map((r) => r.animal),
    [animalsQ.data]
  )

  const defaults: Values = schedule
    ? {
        animalId: schedule.animalId,
        item: schedule.item,
        dose: schedule.dose,
        route: schedule.route,
        site: schedule.site,
        frequency: schedule.frequency,
        doseTimes: schedule.doseTimes,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        caseId: schedule.caseId ?? NO_CASE,
      }
    : {
        animalId: initialAnimalId ?? "",
        item: "",
        dose: "",
        route: "Oral",
        site: "",
        frequency: "2x",
        doseTimes: DEFAULT_TIMES["2x"],
        startDate: today,
        endDate: "",
        caseId: NO_CASE,
      }

  const { control, register, handleSubmit, setValue, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onChange",
  })
  const animalId = useWatch({ control, name: "animalId" })
  const frequency = useWatch({ control, name: "frequency" })
  const doseTimes = useWatch({ control, name: "doseTimes" })

  const casesQ = useQuery({ queryKey: ["linkable-cases", animalId], queryFn: () => linkableCases(animalId), enabled: Boolean(animalId) })

  const save = useServiceMutation(
    async (input: ScheduleInput): Promise<void> => {
      if (schedule) await updateSchedule(schedule.id, input)
      else await createSchedule(input)
    },
    {
      silentError: true,
      success: (_, input) => (schedule ? `Schedule updated · ${input.item}` : `Schedule added · ${input.item} ${input.dose}`),
      onSuccess: () => {
        if (!schedule) reset({ ...defaults, animalId })
        onDone?.()
      },
    }
  )

  const submit = handleSubmit((v) =>
    save.mutate({
      animalId: v.animalId,
      item: v.item,
      dose: v.dose,
      route: v.route,
      site: v.site,
      frequency: v.frequency,
      doseTimes: v.doseTimes,
      startDate: v.startDate,
      endDate: v.endDate,
      caseId: v.caseId === NO_CASE ? null : v.caseId,
    })
  )

  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Controller
        control={control}
        name="animalId"
        render={({ field, fieldState }) => (
          <Field label="Animal" required htmlFor={id("animal")} error={fieldState.error?.message}>
            <Select
              value={field.value || undefined}
              onValueChange={(v) => {
                field.onChange(v)
                setValue("caseId", NO_CASE)
                onAnimalChange?.(v)
              }}
              disabled={Boolean(schedule)}
            >
              <SelectTrigger id={id("animal")} className="w-full" aria-invalid={Boolean(fieldState.error) || undefined}>
                <SelectValue placeholder={animalsQ.isPending ? "Loading animals…" : "Pick an animal"} />
              </SelectTrigger>
              <SelectContent>
                {animals.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.kennelCode} · {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="item"
        render={({ field, fieldState }) => (
          <Field label="Item" required htmlFor={id("item")} error={fieldState.error?.message}>
            <Input id={id("item")} placeholder="e.g. Kaolin suspension" {...field} aria-invalid={Boolean(fieldState.error) || undefined} />
          </Field>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="dose"
          render={({ field, fieldState }) => (
            <Field label="Dose" required htmlFor={id("dose")} error={fieldState.error?.message}>
              <Input id={id("dose")} placeholder="e.g. 2 mL" {...field} aria-invalid={Boolean(fieldState.error) || undefined} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="route"
          render={({ field }) => (
            <Field label="Route" htmlFor={id("route")}>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={id("route")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUTES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      </div>

      <Field label="Site" htmlFor={id("site")} hint="Optional — e.g. left ear, both eyes">
        <Input id={id("site")} placeholder="Optional" {...register("site")} />
      </Field>

      <Field label="Frequency" required>
        <Controller
          control={control}
          name="frequency"
          render={({ field }) => (
            <Segmented
              ariaLabel="Frequency"
              className="w-full"
              size="sm"
              value={field.value}
              onChange={(v) => {
                field.onChange(v)
                setValue("doseTimes", DEFAULT_TIMES[v], { shouldValidate: true })
              }}
              options={[
                { value: "1x", label: "1× daily" },
                { value: "2x", label: "2× daily" },
                { value: "3x", label: "3× daily" },
                { value: "custom", label: "Custom" },
              ]}
            />
          )}
        />
      </Field>

      <Controller
        control={control}
        name="doseTimes"
        render={({ field, fieldState }) => (
          <Field label="Dose times" error={fieldState.error?.message ?? fieldState.error?.root?.message}>
            <DoseTimes
              value={field.value}
              onChange={field.onChange}
              invalid={Boolean(fieldState.error)}
              canAdd={frequency === "custom" ? doseTimes.length < 6 : doseTimes.length < EXPECTED[frequency]}
            />
          </Field>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="startDate"
          render={({ field, fieldState }) => (
            <Field label="Start" required htmlFor={id("start")} error={fieldState.error?.message}>
              <DatePicker
                id={id("start")}
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                ariaLabel="Start date"
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="endDate"
          render={({ field, fieldState }) => (
            <Field label="End" required htmlFor={id("end")}>
              <DatePicker
                id={id("end")}
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(fieldState.error)}
                ariaLabel="End date"
              />
            </Field>
          )}
        />
      </div>
      {formState.errors.endDate ? (
        <p className="-mt-2 text-[13px] text-destructive" role="alert">
          {formState.errors.endDate.message}
        </p>
      ) : null}

      <Controller
        control={control}
        name="caseId"
        render={({ field }) => (
          <Field
            label="Linked case"
            htmlFor={id("case")}
            hint={animalId && casesQ.data?.length === 0 ? "No open cases for this animal" : undefined}
          >
            <Select value={field.value} onValueChange={field.onChange} disabled={!animalId}>
              <SelectTrigger id={id("case")} className="w-full font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CASE}>No linked case</SelectItem>
                {(casesQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.id} · {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      />

      {save.error ? <FormError message={errorMessage(save.error)} /> : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            reset(defaults)
            onCancel?.()
          }}
        >
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!formState.isValid}>
          {schedule ? "Save changes" : "Save schedule"}
        </Button>
      </div>
    </form>
  )
}
