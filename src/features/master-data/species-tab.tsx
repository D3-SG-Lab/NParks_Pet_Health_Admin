"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { Info, Plus } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { EmptyState, QueryError } from "@/components/common/states"
import { Panel, PanelHeader } from "@/components/common/surfaces"
import { Field, FormError } from "@/components/forms/field"
import { Table, TableScroll, TableSkeletonRows, Td, Th, THead, Tr } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import { KENNEL_TYPES, listSpecies, listTemplates, saveSpecies, setSpeciesEnabled, type SpeciesRow } from "@/services/master-data"
import type { KennelType } from "@/types/domain"

import type { FrameRenderer } from "./master-data-screen"
import { FormDialog, InfoBanner, applyApiError } from "./shared"

/** "Dog run · small, Dog run · medium, Dog run · large" → "Dog run · S / M / L". */
export function kennelTypesLabel(types: KennelType[]): string {
  const sizes = types.filter((t) => t.startsWith("Dog run · ")).map((t) => t.replace("Dog run · ", "")[0].toUpperCase())
  const others = types.filter((t) => !t.startsWith("Dog run · ")).map((t) => (t === "Isolation room" ? "Isolation" : t))
  const parts = [sizes.length ? `Dog run · ${sizes.join(" / ")}` : null, ...others].filter(Boolean)
  return parts.length ? parts.join(", ") : "—"
}

type Editing = { row: SpeciesRow | null } | null

export function SpeciesTab({ frame, onOpenTemplate }: { frame: FrameRenderer; onOpenTemplate: (templateId: string) => void }) {
  const q = useQuery({ queryKey: ["master", "species"], queryFn: listSpecies })
  const [editing, setEditing] = useState<Editing>(null)
  const [disabling, setDisabling] = useState<SpeciesRow | null>(null)
  const toggle = useServiceMutation(({ id, enabled }: { id: string; enabled: boolean }) => setSpeciesEnabled(id, enabled), {
    success: (_, v) => (v.enabled ? "Species enabled for new arrivals" : "Species hidden from new arrivals"),
    onSuccess: () => setDisabling(null),
  })

  const actions = (
    <Button onClick={() => setEditing({ row: null })}>
      <Plus /> Add species
    </Button>
  )
  if (q.error) return frame(actions, <QueryError error={q.error} onRetry={() => q.refetch()} />)

  const body = (
    <div className="space-y-5">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Species"
          actions={
            <span className="text-xs text-muted-foreground">
              Shown as the Species choice on New Arrival · disabling hides it for new arrivals only
            </span>
          }
        />
        <TableScroll>
          <Table className="min-w-[860px]">
            <THead>
              <tr>
                <Th>Species</Th>
                <Th>Inspection checklist</Th>
                <Th>Default stay</Th>
                <Th>Kennel types</Th>
                <Th align="right">Active animals</Th>
                <Th align="center">Enabled</Th>
                <Th align="right">Actions</Th>
              </tr>
            </THead>
            <tbody>
              {q.isPending ? (
                <TableSkeletonRows rows={3} cols={7} />
              ) : q.data.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState title="No species yet" description="Add the species accepted for quarantine." icon="search" />
                  </td>
                </tr>
              ) : (
                q.data.map((r) => (
                  <Tr key={r.species.id} className={cn(!r.species.enabled && "text-muted-foreground")}>
                    <Td>
                      <p className="font-semibold text-foreground">{r.species.name}</p>
                      {r.species.description ? <p className="text-xs text-muted-foreground">{r.species.description}</p> : null}
                    </Td>
                    <Td>
                      <button
                        type="button"
                        className="font-medium text-primary hover:underline"
                        onClick={() => onOpenTemplate(r.species.checklistTemplateId)}
                      >
                        {r.templateName}
                        {r.templateVersion ? ` v${r.templateVersion}` : " (no live version)"}
                      </button>
                    </Td>
                    <Td>{r.species.defaultStayDays} days</Td>
                    <Td>{kennelTypesLabel(r.species.kennelTypes)}</Td>
                    <Td align="right" className="tabular-nums">
                      {r.activeAnimals}
                    </Td>
                    <Td align="center">
                      <Switch
                        checked={r.species.enabled}
                        aria-label={`${r.species.enabled ? "Disable" : "Enable"} ${r.species.name}`}
                        onCheckedChange={(c) => (c ? toggle.mutate({ id: r.species.id, enabled: true }) : setDisabling(r))}
                      />
                    </Td>
                    <Td align="right">
                      <Button variant="outline" size="sm" onClick={() => setEditing({ row: r })}>
                        Edit
                      </Button>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableScroll>
      </Panel>
      <InfoBanner icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        Species names are also passed to the AI worker for animal matching. Renaming one does not change existing records.
      </InfoBanner>

      {editing ? <SpeciesDialog key={editing.row?.species.id ?? "new"} row={editing.row} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(o) => !o && setDisabling(null)}
        title={`Disable ${disabling?.species.name ?? "species"}?`}
        description={`${disabling?.species.name} will no longer be offered on New Arrival. The ${disabling?.activeAnimals ?? 0} animal(s) already in quarantine and all existing records are not affected.`}
        confirmLabel="Disable"
        destructive
        loading={toggle.isPending}
        onConfirm={() => disabling && toggle.mutate({ id: disabling.species.id, enabled: false })}
      />
    </div>
  )
  return frame(actions, body)
}

const schema = z.object({
  name: z.string().trim().min(1, "Enter the species name."),
  description: z.string(),
  checklistTemplateId: z.string().min(1, "Pick an inspection checklist."),
  defaultStayDays: z
    .number({ message: "Enter the default stay." })
    .int("Whole days only.")
    .min(1, "Default stay must be 1–180 days.")
    .max(180, "Default stay must be 1–180 days."),
  kennelTypes: z.array(z.enum(KENNEL_TYPES as [KennelType, ...KennelType[]])).min(1, "Pick at least one kennel type."),
  enabled: z.boolean(),
})
type Values = z.infer<typeof schema>

function SpeciesDialog({ row, onClose }: { row: SpeciesRow | null; onClose: () => void }) {
  const templatesQ = useQuery({ queryKey: ["master", "templates"], queryFn: listTemplates })
  const daily = (templatesQ.data ?? []).filter((t) => t.template.kind === "daily")
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: row
      ? {
          name: row.species.name,
          description: row.species.description,
          checklistTemplateId: row.species.checklistTemplateId,
          defaultStayDays: row.species.defaultStayDays,
          kennelTypes: row.species.kennelTypes,
          enabled: row.species.enabled,
        }
      : { name: "", description: "", checklistTemplateId: "tpl-general", defaultStayDays: 30, kennelTypes: [], enabled: true },
  })
  const [formError, setFormError] = useState<string | null>(null)
  const save = useServiceMutation((v: Values) => saveSpecies(row?.species.id ?? null, v), {
    success: (_, v) => (row ? `${v.name} saved` : `${v.name} added`),
    silentError: true,
    onSuccess: onClose,
    onError: (e) => setFormError(applyApiError(form, e, ["name", "description", "checklistTemplateId", "defaultStayDays", "kennelTypes"])),
  })
  const errors = form.formState.errors
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? `Edit ${row.species.name}` : "Add species"}
      description="Changes apply to new arrivals; existing records keep their species."
      onSubmit={form.handleSubmit((v) => {
        setFormError(null)
        save.mutate(v)
      })}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            {row ? "Save changes" : "Add species"}
          </Button>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="Species name" required htmlFor="sp-name" error={errors.name?.message}>
        <Input id="sp-name" aria-invalid={Boolean(errors.name) || undefined} {...form.register("name")} />
      </Field>
      <Field label="Description" htmlFor="sp-desc" hint="e.g. Rabbits, guinea pigs, birds">
        <Input id="sp-desc" {...form.register("description")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inspection checklist" required htmlFor="sp-tpl" error={errors.checklistTemplateId?.message}>
          <Controller
            control={form.control}
            name="checklistTemplateId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="sp-tpl" className="w-full">
                  <SelectValue placeholder="Pick a checklist" />
                </SelectTrigger>
                <SelectContent>
                  {daily.map((t) => (
                    <SelectItem key={t.template.id} value={t.template.id}>
                      {t.template.name}
                      {t.live ? ` v${t.live}` : " (draft only)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Default stay (days)" required htmlFor="sp-stay" error={errors.defaultStayDays?.message}>
          <Input
            id="sp-stay"
            type="number"
            min={1}
            max={180}
            aria-invalid={Boolean(errors.defaultStayDays) || undefined}
            {...form.register("defaultStayDays", { valueAsNumber: true })}
          />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">
          Kennel types<span className="ml-0.5 text-destructive">*</span>
        </legend>
        <Controller
          control={form.control}
          name="kennelTypes"
          render={({ field }) => (
            <div className="grid gap-2 sm:grid-cols-2">
              {KENNEL_TYPES.map((t) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-subtle"
                >
                  <Checkbox
                    checked={field.value.includes(t)}
                    onCheckedChange={(c) => field.onChange(c ? [...field.value, t] : field.value.filter((x) => x !== t))}
                  />
                  {t}
                </label>
              ))}
            </div>
          )}
        />
        {errors.kennelTypes ? <p className="text-[13px] text-destructive">{errors.kennelTypes.message}</p> : null}
      </fieldset>
      <Controller
        control={form.control}
        name="enabled"
        render={({ field }) => (
          <label className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Enabled for new arrivals</span>
              <span className="block text-xs text-muted-foreground">Disabling hides it from New Arrival only.</span>
            </span>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </label>
        )}
      />
    </FormDialog>
  )
}
