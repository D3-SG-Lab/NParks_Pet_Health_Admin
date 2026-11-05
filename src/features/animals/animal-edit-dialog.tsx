"use client"

import { useQuery } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Segmented } from "@/components/common/filters"
import { DatePicker } from "@/components/forms/date-picker"
import { Field } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { todayISO } from "@/lib/clock"
import { isApiError } from "@/lib/errors"
import { useServiceMutation } from "@/lib/query"
import { availableKennels, updateAnimal } from "@/services/animals"
import type { Animal } from "@/types/domain"

import { COUNTRIES } from "./animal-bits"

const schema = z.object({
  name: z.string().trim().min(1, "Enter the pet name.").max(40, "Keep the name under 40 characters."),
  breed: z.string().trim().max(60, "Keep the breed under 60 characters."),
  sex: z.enum(["M", "F"]),
  dateOfBirth: z.string().min(1, "Enter the date of birth."),
  origin: z.string().min(1, "Pick the country of origin."),
  microchip: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{15}$/, "Microchip must be 15 digits.")),
  kennelCode: z.string().min(1, "Pick a kennel."),
  releaseDate: z.string().min(1, "Enter the release date."),
})
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>
const FIELDS = ["name", "breed", "sex", "dateOfBirth", "origin", "microchip", "kennelCode", "releaseDate"] as const

/** Edit animal profile (BE-009 "update the profile"). */
export function AnimalEditDialog({ animal, open, onOpenChange }: { animal: Animal; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl p-6 sm:max-w-[620px]">
        {open ? <EditForm animal={animal} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ animal, onClose }: { animal: Animal; onClose: () => void }) {
  const kennels = useQuery({
    queryKey: ["available-kennels", animal.speciesId, animal.id],
    queryFn: () => availableKennels(animal.speciesId, animal.id),
  })
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: animal.name,
      breed: animal.breed,
      sex: animal.sex,
      dateOfBirth: animal.dateOfBirth,
      origin: animal.origin,
      microchip: animal.microchip,
      kennelCode: animal.kennelCode,
      releaseDate: animal.releaseDate,
    },
  })
  const save = useServiceMutation((v: FormValues) => updateAnimal(animal.id, v), {
    success: "Animal profile updated",
    silentError: true,
    onSuccess: onClose,
    onError: (e) => {
      const field = isApiError(e) ? FIELDS.find((f) => f === e.field) : undefined
      form.setError(field ?? "root", { message: e.message })
    },
  })
  const e = form.formState.errors
  const kennelOptions = Array.from(new Set([animal.kennelCode, ...(kennels.data ?? []).map((k) => k.code)])).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  )

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-5">
      <DialogHeader className="text-left">
        <DialogTitle className="text-lg">Edit {animal.name}</DialogTitle>
        <DialogDescription>Changes are audited with before and after values.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pet name" required htmlFor="ed-name" error={e.name?.message}>
          <Input id="ed-name" aria-invalid={Boolean(e.name)} {...form.register("name")} />
        </Field>
        <Field label="Breed" htmlFor="ed-breed" error={e.breed?.message}>
          <Input id="ed-breed" {...form.register("breed")} />
        </Field>
        <Field label="Sex" required>
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
                  { value: "M", label: "Male" },
                  { value: "F", label: "Female" },
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
                max={todayISO()}
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
                <SelectTrigger className="w-full" aria-label="Country of origin">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([animal.origin, ...COUNTRIES])).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Microchip no." required htmlFor="ed-mc" error={e.microchip?.message}>
          <Input id="ed-mc" inputMode="numeric" className="font-mono" aria-invalid={Boolean(e.microchip)} {...form.register("microchip")} />
        </Field>
        <Field label="Kennel / room" required error={e.kennelCode?.message} hint="Only vacant kennels that take this species are listed.">
          <Controller
            control={form.control}
            name="kennelCode"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full" aria-label="Kennel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kennelOptions.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                      {k === animal.kennelCode ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Release date" required error={e.releaseDate?.message}>
          <Controller
            control={form.control}
            name="releaseDate"
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={field.onChange}
                min={animal.arrivalDate}
                invalid={Boolean(e.releaseDate)}
                ariaLabel="Release date"
              />
            )}
          />
        </Field>
      </div>
      {e.root?.message ? (
        <p className="rounded-lg border border-destructive-border bg-destructive-tile px-3 py-2.5 text-sm text-destructive">
          {e.root.message}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save changes
        </Button>
      </DialogFooter>
    </form>
  )
}
