"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowRight, History } from "lucide-react"

import { Segmented } from "@/components/common/filters"
import { DatePicker } from "@/components/forms/date-picker"
import { Field, FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addDays, todayISO } from "@/lib/clock"
import { isApiError } from "@/lib/errors"
import { fmtMicrochip } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { availableKennels, createArrival } from "@/services/animals"
import { getReferenceData } from "@/services/reference"
import type { Animal } from "@/types/domain"

import { COUNTRIES } from "./animal-bits"

/** Field rules mirror the service validation (BE-009 data dictionary). */
const schema = z
  .object({
    name: z.string().trim().min(1, "Enter the pet name.").max(40, "Keep the name under 40 characters."),
    speciesId: z.string().min(1, "Pick a species."),
    breed: z.string().trim().max(60, "Keep the breed under 60 characters."),
    sex: z.enum(["M", "F"], { message: "Pick the sex." }),
    dateOfBirth: z.string().min(1, "Enter the date of birth."),
    origin: z.string().min(1, "Pick the country of origin."),
    microchip: z
      .string()
      .transform((v) => v.replace(/\s/g, ""))
      .pipe(z.string().regex(/^\d{15}$/, "Microchip must be 15 digits.")),
    kennelCode: z.string().min(1, "Pick a kennel or room."),
    releaseDate: z.string().min(1, "Enter the release date."),
  })
  .superRefine((v, ctx) => {
    const today = todayISO()
    if (v.dateOfBirth && v.dateOfBirth >= today)
      ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Date of birth must be in the past." })
    if (v.releaseDate && v.releaseDate <= today)
      ctx.addIssue({ code: "custom", path: ["releaseDate"], message: "Release date must be after today’s arrival." })
  })
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>
const FIELDS = ["name", "speciesId", "breed", "sex", "dateOfBirth", "origin", "microchip", "kennelCode", "releaseDate"] as const

const EMPTY: FormInput = {
  name: "",
  speciesId: "",
  breed: "",
  sex: "F",
  dateOfBirth: "",
  origin: "",
  microchip: "",
  kennelCode: "",
  releaseDate: "",
}

function readDraft(key: string): FormInput | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const draft = { ...EMPTY, ...(JSON.parse(raw) as Partial<FormInput>) }
    // Only offer a restore when something meaningful was typed.
    return draft.name || draft.speciesId || draft.microchip || draft.origin || draft.dateOfBirth ? draft : null
  } catch {
    return null
  }
}

/** New Arrival step 1 of 2 (FE-007). Draft is kept if the user leaves the screen. */
export function ArrivalDetailsForm({
  userId,
  onCreated,
  onCancel,
}: {
  userId: string
  onCreated: (animal: Animal) => void
  onCancel: () => void
}) {
  const draftKey = `aqc-arrival-draft-${userId}`
  const [restored, setRestored] = useState<FormInput | null>(() => readDraft(draftKey))
  const form = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: restored ?? EMPTY })
  const ref = useQuery({ queryKey: ["reference"], queryFn: getReferenceData })
  const speciesId = useWatch({ control: form.control, name: "speciesId" })
  const values = useWatch({ control: form.control })
  const kennels = useQuery({
    queryKey: ["available-kennels", speciesId],
    queryFn: () => availableKennels(speciesId),
    enabled: Boolean(speciesId),
  })

  // Persist the draft to localStorage on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(values))
    } catch {
      // storage blocked — drafts are best-effort
    }
  }, [values, draftKey])

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      // ignore
    }
  }

  const create = useServiceMutation((v: FormValues) => createArrival(v), {
    success: (a) => `${a.kennelCode} · ${a.name} registered — complete the arrival exam`,
    silentError: true,
    onSuccess: (a) => {
      clearDraft()
      onCreated(a)
    },
    onError: (e) => {
      const field = isApiError(e) ? FIELDS.find((f) => f === e.field) : undefined
      form.setError(field ?? "root", { message: e.message })
    },
  })

  const species = (ref.data?.species ?? []).filter((s) => s.enabled)
  const e = form.formState.errors

  return (
    <form onSubmit={form.handleSubmit((v) => create.mutate(v))} noValidate className="space-y-6">
      {restored ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info-border bg-info-soft px-4 py-3 text-sm text-info">
          <History className="size-4" aria-hidden />
          <span className="flex-1">Draft restored from your last visit.</span>
          <Button
            type="button"
            size="sm"
            variant="link"
            className="text-info"
            onClick={() => {
              clearDraft()
              setRestored(null)
              form.reset(EMPTY)
            }}
          >
            Discard draft
          </Button>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Pet name" required htmlFor="ar-name" error={e.name?.message}>
          <Input id="ar-name" autoComplete="off" aria-invalid={Boolean(e.name)} {...form.register("name")} />
        </Field>
        <Field label="Species" required error={e.speciesId?.message}>
          <Controller
            control={form.control}
            name="speciesId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v)
                  form.setValue("kennelCode", "")
                  const s = species.find((x) => x.id === v)
                  if (s && !form.getValues("releaseDate")) form.setValue("releaseDate", addDays(todayISO(), s.defaultStayDays))
                }}
              >
                <SelectTrigger className="w-full" aria-label="Species" aria-invalid={Boolean(e.speciesId)}>
                  <SelectValue placeholder="Choose species" />
                </SelectTrigger>
                <SelectContent>
                  {species.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.description ? ` · ${s.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Breed" htmlFor="ar-breed" error={e.breed?.message}>
          <Input id="ar-breed" {...form.register("breed")} />
        </Field>
        <Field label="Sex" required error={e.sex?.message}>
          <Controller
            control={form.control}
            name="sex"
            render={({ field }) => (
              <Segmented
                ariaLabel="Sex"
                className="w-full"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: "F", label: "Female" },
                  { value: "M", label: "Male" },
                ]}
              />
            )}
          />
        </Field>
        <Field label="Date of birth" required error={e.dateOfBirth?.message}>
          <Controller
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={field.onChange}
                max={addDays(todayISO(), -1)}
                invalid={Boolean(e.dateOfBirth)}
                ariaLabel="Date of birth"
              />
            )}
          />
        </Field>
        <Field label="Country of origin" required error={e.origin?.message}>
          <Controller
            control={form.control}
            name="origin"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full" aria-label="Country of origin" aria-invalid={Boolean(e.origin)}>
                  <SelectValue placeholder="Choose country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field
          label="Microchip no."
          required
          htmlFor="ar-mc"
          error={e.microchip?.message}
          hint="15-digit ISO chip — must be unique across active stays."
        >
          <Controller
            control={form.control}
            name="microchip"
            render={({ field }) => (
              <Input
                id="ar-mc"
                inputMode="numeric"
                className="font-mono"
                placeholder="900 1234 5678 0000"
                aria-invalid={Boolean(e.microchip)}
                value={fmtMicrochip(field.value)}
                onChange={(ev) => field.onChange(ev.target.value.replace(/[^\d]/g, "").slice(0, 15))}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
        <Field
          label="Kennel / room"
          required
          error={e.kennelCode?.message}
          hint={speciesId ? "Vacant kennels for this species. Out-of-service kennels are hidden." : "Pick a species first."}
        >
          <Controller
            control={form.control}
            name="kennelCode"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={!speciesId}>
                <SelectTrigger className="w-full" aria-label="Kennel or room" aria-invalid={Boolean(e.kennelCode)}>
                  <SelectValue placeholder={kennels.isFetching ? "Loading…" : "Choose kennel"} />
                </SelectTrigger>
                <SelectContent>
                  {(kennels.data ?? []).length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No vacant kennel takes this species.</div>
                  ) : (
                    (kennels.data ?? []).map((k) => (
                      <SelectItem key={k.code} value={k.code}>
                        {k.code} · {k.type}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Release date" required error={e.releaseDate?.message} hint="Defaults to the species’ standard stay.">
          <Controller
            control={form.control}
            name="releaseDate"
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={field.onChange}
                min={addDays(todayISO(), 1)}
                invalid={Boolean(e.releaseDate)}
                ariaLabel="Release date"
              />
            )}
          />
        </Field>
      </div>

      <FormError message={e.root?.message} />

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Continue to arrival exam <ArrowRight />
        </Button>
      </div>
    </form>
  )
}
