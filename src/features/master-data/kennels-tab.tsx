"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { z } from "zod"

import { KennelCode, StatusChip } from "@/components/common/status-chip"
import { EmptyState, PanelSkeleton, QueryError } from "@/components/common/states"
import { Panel, PanelHeader } from "@/components/common/surfaces"
import { DatePicker } from "@/components/forms/date-picker"
import { Field, FormError } from "@/components/forms/field"
import { Table, TableScroll, Td, Th, THead, Tr, TableSkeletonRows } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fmtDayMonth } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import {
  KENNEL_STATUS_LABEL,
  KENNEL_TYPES,
  createBlock,
  createKennel,
  importKennels,
  listKennelBlocks,
  listKennels,
  suggestKennelCode,
  updateKennel,
  type BlockSummary,
  type KennelRow,
} from "@/services/master-data"
import { getReferenceData } from "@/services/reference"
import type { KennelStatus, KennelType, Species } from "@/types/domain"

import type { FrameRenderer } from "./master-data-screen"
import { BlockTile, CsvImportButton, FormDialog, MultiSelect, applyApiError } from "./shared"

type Editing = { mode: "edit"; row: KennelRow } | { mode: "add"; code: string } | null

export function KennelsTab({ frame }: { frame: FrameRenderer }) {
  const blocksQ = useQuery({ queryKey: ["master", "blocks"], queryFn: listKennelBlocks })
  const refQ = useQuery({ queryKey: ["reference"], queryFn: getReferenceData })
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [blockOpen, setBlockOpen] = useState(false)
  const blockCode = selected ?? blocksQ.data?.[0]?.block.code ?? null
  const kennelsQ = useQuery({
    queryKey: ["master", "kennels", blockCode],
    queryFn: () => listKennels(blockCode as string),
    enabled: Boolean(blockCode),
  })
  const species = refQ.data?.species ?? []

  const startAdd = async () => {
    if (!blockCode) return
    setEditing({ mode: "add", code: await suggestKennelCode(blockCode) })
  }

  const actions = (
    <>
      <CsvImportButton
        templateName="kennels-template.csv"
        templateHeaders={["code", "type", "species", "status"]}
        templateRows={[
          ["KC4-1", "Dog run · medium", "dog", "in_service"],
          ["KC4-2", "Cattery suite", "cat", "in_service"],
        ]}
        onImport={importKennels}
      />
      <Button onClick={startAdd} disabled={!blockCode}>
        <Plus /> Add kennel
      </Button>
    </>
  )

  if (blocksQ.error) return frame(actions, <QueryError error={blocksQ.error} onRetry={() => blocksQ.refetch()} />)

  const block = blocksQ.data?.find((b) => b.block.code === blockCode)
  const contractors = kennelsQ.data?.contractors ?? []

  const body = (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel className="self-start overflow-hidden">
        <PanelHeader
          title="Blocks"
          actions={
            <Button variant="link" size="sm" onClick={() => setBlockOpen(true)}>
              <Plus /> Block
            </Button>
          }
        />
        {blocksQ.isPending ? (
          <PanelSkeleton lines={4} />
        ) : (
          <ul className="border-t border-border">
            {blocksQ.data.map((b) => (
              <BlockRow
                key={b.block.code}
                b={b}
                selected={b.block.code === blockCode}
                onSelect={() => {
                  setSelected(b.block.code)
                  setEditing(null)
                }}
              />
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="min-w-0 overflow-hidden">
        <PanelHeader
          title={block ? `${block.block.name} · ${block.block.code}` : "Kennels"}
          actions={
            contractors.length ? (
              <span className="text-xs text-muted-foreground">
                Contractor scope: {contractors.map((c) => `${c.name}${c.disabled ? " (disabled)" : ""}`).join(", ")}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No contractors scoped to this block</span>
            )
          }
        />
        {kennelsQ.error ? (
          <QueryError error={kennelsQ.error} onRetry={() => kennelsQ.refetch()} />
        ) : (
          <TableScroll className="max-h-[440px] overflow-y-auto">
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <Th>Code</Th>
                  <Th>Type</Th>
                  <Th>Species allowed</Th>
                  <Th>Status</Th>
                  <Th>Current animal</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </THead>
              <tbody>
                {kennelsQ.isPending ? (
                  <TableSkeletonRows rows={5} cols={6} />
                ) : kennelsQ.data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title="No kennels in this block yet"
                        description="Add the first kennel or import a CSV."
                        icon="search"
                        action={
                          <Button size="sm" onClick={startAdd}>
                            <Plus /> Add kennel
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  kennelsQ.data.rows.map((r) => (
                    <Tr key={r.kennel.code} selected={editing?.mode === "edit" && editing.row.kennel.code === r.kennel.code}>
                      <Td>
                        <KennelCode code={r.kennel.code} />
                      </Td>
                      <Td className="whitespace-nowrap">{r.kennel.type}</Td>
                      <Td>{r.kennel.speciesAllowed.map((id) => species.find((s) => s.id === id)?.name ?? id).join(", ")}</Td>
                      <Td>
                        <KennelStatusChip row={r} />
                      </Td>
                      <Td className="whitespace-nowrap">
                        {r.occupant ? (
                          `${r.occupant.name} · release ${fmtDayMonth(r.occupant.releaseDate)}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </Td>
                      <Td align="right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing({ mode: "edit", row: r })}
                          aria-label={`Edit ${r.kennel.code}`}
                        >
                          Edit
                        </Button>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableScroll>
        )}
        {editing && blockCode ? (
          <KennelForm
            key={editing.mode === "edit" ? editing.row.kennel.code : `add-${editing.code}`}
            editing={editing}
            blockCode={blockCode}
            species={species}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Panel>

      <BlockDialog open={blockOpen} onOpenChange={setBlockOpen} onCreated={(code) => setSelected(code)} />
    </div>
  )

  return frame(actions, body)
}

function BlockRow({ b, selected, onSelect }: { b: BlockSummary; selected: boolean; onSelect: () => void }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className={cn(
          "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-subtle focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none",
          selected && "bg-selected shadow-[inset_3px_0_0_var(--primary)] hover:bg-selected"
        )}
      >
        <BlockTile code={b.block.code} isolation={b.block.kind === "isolation"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{b.block.name}</span>
          <span className="block text-xs text-muted-foreground">
            {b.kennels} {b.block.kind === "isolation" ? "rooms" : "kennels"} · {b.inUse} in use
          </span>
        </span>
        <span className="flex gap-0.5" aria-label={`${b.inUse} of ${b.kennels} in use`}>
          {b.occupancy.map((o, i) => (
            <span
              key={i}
              className={cn("h-3.5 w-1.5 rounded-sm", o === "in_use" ? "bg-primary" : o === "vacant" ? "bg-border-strong" : "bg-muted")}
            />
          ))}
        </span>
      </button>
    </li>
  )
}

function KennelStatusChip({ row }: { row: KennelRow }) {
  if (row.occupant)
    return (
      <StatusChip tone="success" dot size="sm">
        In use
      </StatusChip>
    )
  if (row.kennel.status === "cleaning")
    return (
      <StatusChip tone="warning" size="sm">
        Cleaning{row.kennel.availableFrom ? ` until ${fmtDayMonth(row.kennel.availableFrom)}` : ""}
      </StatusChip>
    )
  if (row.kennel.status === "out_of_service")
    return (
      <StatusChip tone="danger" size="sm">
        Out of service
      </StatusChip>
    )
  return (
    <StatusChip tone="neutral" size="sm">
      Vacant · in service
    </StatusChip>
  )
}

const kennelSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Enter the kennel code.")
      .regex(/^[A-Z]{2,4}\d{0,2}-\d{1,2}$/, "Code must look like KC2-7."),
    type: z.enum(KENNEL_TYPES as [KennelType, ...KennelType[]]),
    speciesAllowed: z.array(z.string()).min(1, "Allow at least one species."),
    status: z.enum(["in_service", "cleaning", "out_of_service"]),
    availableFrom: z.string(),
  })
  .refine((v) => v.status !== "cleaning" || v.availableFrom !== "", { path: ["availableFrom"], message: "Set the date cleaning finishes." })
type KennelValues = z.infer<typeof kennelSchema>

function KennelForm({
  editing,
  blockCode,
  species,
  onDone,
}: {
  editing: NonNullable<Editing>
  blockCode: string
  species: Species[]
  onDone: () => void
}) {
  const row = editing.mode === "edit" ? editing.row : null
  const locked = Boolean(row?.occupant)
  const form = useForm<KennelValues>({
    resolver: zodResolver(kennelSchema),
    defaultValues: row
      ? {
          code: row.kennel.code,
          type: row.kennel.type,
          speciesAllowed: row.kennel.speciesAllowed,
          status: row.kennel.status,
          availableFrom: row.kennel.availableFrom ?? "",
        }
      : {
          code: editing.mode === "add" ? editing.code : "",
          type: blockCode === "ISO" ? "Isolation room" : "Dog run · medium",
          speciesAllowed: [],
          status: "in_service",
          availableFrom: "",
        },
  })
  const [formError, setFormError] = useState<string | null>(null)
  const fields = ["code", "type", "speciesAllowed", "status", "availableFrom"] as const
  const save = useServiceMutation(
    (v: KennelValues) => {
      const input = {
        ...v,
        code: v.code.toUpperCase(),
        blockCode,
        availableFrom: v.status === "cleaning" ? v.availableFrom : null,
        status: v.status as KennelStatus,
      }
      return row ? updateKennel(row.kennel.code, input) : createKennel(input)
    },
    {
      success: (_, v) => (row ? `${v.code} saved` : `${v.code} added`),
      silentError: true,
      onSuccess: onDone,
      onError: (e) => setFormError(applyApiError(form, e, fields)),
    }
  )
  const status = useWatch({ control: form.control, name: "status" })
  const errors = form.formState.errors

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((v) => {
        setFormError(null)
        save.mutate(v)
      })}
      className="space-y-4 border-t border-border bg-subtle/60 px-5 py-5"
      aria-label={row ? `Edit ${row.kennel.code}` : "Add kennel"}
    >
      <h3 className="text-[15px] font-semibold">{row ? `Edit ${row.kennel.code}` : `Add kennel to ${blockCode}`}</h3>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Code" required htmlFor="k-code" error={errors.code?.message}>
          <Input
            id="k-code"
            disabled={locked}
            className="font-mono"
            aria-invalid={Boolean(errors.code) || undefined}
            {...form.register("code")}
          />
        </Field>
        <Field label="Type" required htmlFor="k-type" error={errors.type?.message}>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="k-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KENNEL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Species allowed" required htmlFor="k-species" error={errors.speciesAllowed?.message}>
          <Controller
            control={form.control}
            name="speciesAllowed"
            render={({ field }) => (
              <MultiSelect
                id="k-species"
                invalid={Boolean(errors.speciesAllowed)}
                placeholder="Pick species"
                options={species.map((s) => ({ value: s.id, label: s.name }))}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        <Field label="Status" htmlFor="k-status" error={errors.status?.message}>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="k-status" className="w-full">
                  <SelectValue>
                    {locked && field.value === "in_service" ? "In use" : KENNEL_STATUS_LABEL[field.value as KennelStatus]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KENNEL_STATUS_LABEL) as KennelStatus[]).map((s) => (
                    <SelectItem key={s} value={s} disabled={locked && s !== "in_service"}>
                      {locked && s === "in_service" ? "In use" : KENNEL_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        {status === "cleaning" ? (
          <Field label="Available from" required htmlFor="k-avail" error={errors.availableFrom?.message}>
            <Controller
              control={form.control}
              name="availableFrom"
              render={({ field }) => (
                <DatePicker id="k-avail" value={field.value} onChange={field.onChange} invalid={Boolean(errors.availableFrom)} />
              )}
            />
          </Field>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Code is locked while an animal is assigned. Out-of-service kennels are hidden from the New Arrival picker.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {row ? "Save changes" : "Add kennel"}
        </Button>
      </div>
    </form>
  )
}

const blockSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Enter a block code.")
    .regex(/^[A-Za-z]{2,4}\d{0,2}$/, "Use 2–4 letters and an optional number, e.g. KC4."),
  name: z.string().trim(),
  kind: z.enum(["kennel", "isolation"]),
})
type BlockValues = z.infer<typeof blockSchema>

function BlockDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (code: string) => void
}) {
  const form = useForm<BlockValues>({ resolver: zodResolver(blockSchema), defaultValues: { code: "", name: "", kind: "kennel" } })
  const [formError, setFormError] = useState<string | null>(null)
  const close = (o: boolean) => {
    if (!o) {
      form.reset()
      setFormError(null)
    }
    onOpenChange(o)
  }
  const save = useServiceMutation((v: BlockValues) => createBlock(v), {
    success: (_, v) => `Block ${v.code.toUpperCase()} added`,
    silentError: true,
    onSuccess: (_, v) => {
      onCreated(v.code.toUpperCase())
      close(false)
    },
    onError: (e) => setFormError(applyApiError(form, e, ["code", "name", "kind"])),
  })
  const errors = form.formState.errors
  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title="Add kennel block"
      description="Blocks group kennels for contractor scoping and the inspection board."
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Add block
          </Button>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="Code" required htmlFor="b-code" error={errors.code?.message} hint="e.g. KC4">
        <Input id="b-code" className="font-mono uppercase" aria-invalid={Boolean(errors.code) || undefined} {...form.register("code")} />
      </Field>
      <Field label="Name" htmlFor="b-name" hint="Defaults to “Kennel block N”.">
        <Input id="b-name" {...form.register("name")} />
      </Field>
      <Field label="Kind" htmlFor="b-kind">
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="b-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kennel">Kennel block</SelectItem>
                <SelectItem value="isolation">Isolation ward</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </Field>
    </FormDialog>
  )
}
