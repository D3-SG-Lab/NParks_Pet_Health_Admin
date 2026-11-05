"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Trash2, X } from "lucide-react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { Field, FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ChecklistInput, ChecklistItem } from "@/types/domain"

import { FormDialog } from "./shared"

export const INPUT_LABEL: Record<ChecklistInput, string> = {
  single: "Single choice",
  normal_abnormal: "Normal / Abnormal",
  yes_no: "Yes / No",
  free_text: "Free text · optional",
}

const PRESETS: Record<ChecklistInput, { label: string; abnormal: boolean }[]> = {
  single: [
    { label: "Option 1", abnormal: false },
    { label: "Option 2", abnormal: true },
  ],
  normal_abnormal: [
    { label: "Normal", abnormal: false },
    { label: "Abnormal", abnormal: true },
  ],
  yes_no: [
    { label: "Yes", abnormal: false },
    { label: "No", abnormal: true },
  ],
  free_text: [],
}

const schema = z
  .object({
    label: z.string().trim().min(1, "Enter the item label."),
    section: z.string().trim().min(1, "Enter the section."),
    input: z.enum(["single", "normal_abnormal", "yes_no", "free_text"]),
    rows: z.string(),
    options: z.array(z.object({ label: z.string().trim().min(1, "Option label is required."), abnormal: z.boolean() })),
    defaultOption: z.string(),
    noteIfAbnormal: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.input === "free_text") return
    if (v.options.length < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two options." })
    const labels = v.options.map((o) => o.label.trim().toLowerCase())
    if (new Set(labels).size !== labels.length)
      ctx.addIssue({ code: "custom", path: ["options"], message: "Option labels must be unique." })
    const def = v.options.find((o) => o.label === v.defaultOption)
    if (!def) ctx.addIssue({ code: "custom", path: ["defaultOption"], message: "Pick the default option." })
    else if (def.abnormal)
      ctx.addIssue({
        code: "custom",
        path: ["defaultOption"],
        message: "The default must be a normal option so a healthy animal takes a few taps.",
      })
  })
type Values = z.infer<typeof schema>

let itemSeq = 0
function newItemId(): string {
  itemSeq += 1
  return `item-${itemSeq}-${Math.random().toString(36).slice(2, 8)}`
}

/** Add / edit one checklist item (label, input type, options with default & abnormal flags, note rule). */
export function TemplateItemDialog({
  item,
  sections,
  onSave,
  onDelete,
  onClose,
  saving,
  serverError,
}: {
  item: ChecklistItem | null
  sections: string[]
  onSave: (item: ChecklistItem) => void
  onDelete?: () => void
  onClose: () => void
  saving: boolean
  serverError: string | null
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: item
      ? {
          label: item.label,
          section: item.section,
          input: item.input,
          rows: item.rows.join("\n"),
          options: item.options,
          defaultOption: item.defaultOption ?? "",
          noteIfAbnormal: item.noteIfAbnormal,
        }
      : {
          label: "",
          section: sections[0] ?? "Body systems",
          input: "normal_abnormal",
          rows: "",
          options: PRESETS.normal_abnormal,
          defaultOption: "Normal",
          noteIfAbnormal: true,
        },
  })
  const options = useFieldArray({ control: form.control, name: "options" })
  const input = useWatch({ control: form.control, name: "input" })
  const watchedOptions = useWatch({ control: form.control, name: "options" })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const errors = form.formState.errors

  const changeInput = (next: ChecklistInput) => {
    form.setValue("input", next)
    options.replace(PRESETS[next])
    form.setValue("defaultOption", PRESETS[next][0]?.label ?? "")
    form.setValue("noteIfAbnormal", next === "normal_abnormal")
  }

  const submit = form.handleSubmit((v) => {
    onSave({
      id: item?.id ?? newItemId(),
      section: v.section.trim(),
      label: v.label.trim(),
      rows:
        v.input === "normal_abnormal"
          ? v.rows
              .split("\n")
              .map((r) => r.trim())
              .filter(Boolean)
          : [],
      input: v.input,
      options: v.input === "free_text" ? [] : v.options.map((o) => ({ label: o.label.trim(), abnormal: o.abnormal })),
      defaultOption: v.input === "free_text" ? null : v.defaultOption,
      noteIfAbnormal: v.input === "free_text" ? false : v.noteIfAbnormal,
      changeNote: item?.changeNote ?? null,
    })
  })

  return (
    <FormDialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={item ? `Edit item · ${item.label}` : "Add checklist item"}
      description="Changes are saved to the draft. Publishing applies them to new inspections only."
      onSubmit={submit}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {onDelete ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-sm text-destructive sm:mr-auto">
                Delete this item?
                <Button type="button" size="sm" variant="destructive" onClick={onDelete} loading={saving}>
                  Delete
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button type="button" variant="destructive-outline" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete item
              </Button>
            )
          ) : null}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {item ? "Save item" : "Add item"}
          </Button>
        </div>
      }
    >
      <FormError message={serverError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label" required htmlFor="ti-label" error={errors.label?.message}>
          <Input id="ti-label" aria-invalid={Boolean(errors.label) || undefined} {...form.register("label")} />
        </Field>
        <Field
          label="Section"
          required
          htmlFor="ti-section"
          error={errors.section?.message}
          hint="Groups items on the form (e.g. Body systems)."
        >
          <Input id="ti-section" list="ti-sections" {...form.register("section")} />
          <datalist id="ti-sections">
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Input" htmlFor="ti-input">
        <Select value={input} onValueChange={(v) => changeInput(v as ChecklistInput)}>
          <SelectTrigger id="ti-input" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(INPUT_LABEL) as ChecklistInput[]).map((k) => (
              <SelectItem key={k} value={k}>
                {INPUT_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {input === "normal_abnormal" ? (
        <Field
          label="Grouped rows"
          htmlFor="ti-rows"
          hint="Optional — one body system per line (e.g. Skin / coat, Eyes…). Each row is answered separately."
        >
          <Textarea id="ti-rows" rows={4} {...form.register("rows")} />
        </Field>
      ) : null}

      {input !== "free_text" ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Options</legend>
          <p className="text-xs text-muted-foreground">
            Pick the default (normal) answer and mark which answers are abnormal — abnormal answers are sent for AI routing.
          </p>
          <Controller
            control={form.control}
            name="defaultOption"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Default option" className="space-y-2">
                {options.fields.map((f, i) => {
                  const label = watchedOptions?.[i]?.label ?? ""
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "flex flex-wrap items-center gap-2 rounded-lg border border-border p-2",
                        field.value === label && label && "border-primary bg-selected"
                      )}
                    >
                      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <input
                          type="radio"
                          name="ti-default"
                          className="size-4 accent-[var(--primary)]"
                          checked={field.value === label && label !== ""}
                          onChange={() => field.onChange(label)}
                          aria-label={`Default: ${label || `option ${i + 1}`}`}
                        />
                        Default
                      </label>
                      <Input
                        aria-label={`Option ${i + 1}`}
                        className="h-9 min-w-0 flex-1"
                        aria-invalid={Boolean(errors.options?.[i]?.label) || undefined}
                        {...form.register(`options.${i}.label`, {
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            if (field.value === label) field.onChange(e.target.value)
                          },
                        })}
                      />
                      <Controller
                        control={form.control}
                        name={`options.${i}.abnormal`}
                        render={({ field: ab }) => (
                          <label
                            className={cn(
                              "flex items-center gap-2 text-xs font-medium",
                              ab.value ? "text-abnormal" : "text-muted-foreground"
                            )}
                          >
                            <Switch checked={ab.value} onCheckedChange={ab.onChange} aria-label={`Option ${i + 1} is abnormal`} />
                            Abnormal
                          </label>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove option ${i + 1}`}
                        onClick={() => options.remove(i)}
                        disabled={options.fields.length <= 1}
                      >
                        <X />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          />
          {errors.options?.message || errors.options?.root?.message ? (
            <p className="text-[13px] text-destructive">{errors.options?.message ?? errors.options?.root?.message}</p>
          ) : null}
          {errors.defaultOption ? <p className="text-[13px] text-destructive">{errors.defaultOption.message}</p> : null}
          <Button type="button" variant="link" size="sm" onClick={() => options.append({ label: "", abnormal: true })}>
            <Plus /> Add option
          </Button>
        </fieldset>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          Free text is optional. Any text entered is sent for AI review.
        </p>
      )}

      {input !== "free_text" ? (
        <Controller
          control={form.control}
          name="noteIfAbnormal"
          render={({ field }) => (
            <label className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
              <span>
                <span className="block text-sm font-semibold">Note required if abnormal</span>
                <span className="block text-xs text-muted-foreground">Officers must describe abnormal findings before submitting.</span>
              </span>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />
      ) : null}
    </FormDialog>
  )
}
