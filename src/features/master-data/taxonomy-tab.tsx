"use client"

import { useState, type KeyboardEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, X } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { AiNote } from "@/components/common/ai-card"
import { SearchInput } from "@/components/common/filters"
import { EmptyState, PanelSkeleton, QueryError } from "@/components/common/states"
import { Panel } from "@/components/common/surfaces"
import { Field, FormError } from "@/components/forms/field"
import { Table, TableFooter, TableScroll, TableSkeletonRows, Td, Th, THead, Tr } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import { listTaxonomy, saveSign, setSignActive, type SignRow } from "@/services/master-data"
import type { BodySystemId } from "@/types/domain"

import type { FrameRenderer } from "./master-data-screen"
import { FormDialog, applyApiError } from "./shared"

type Editing = { row: SignRow | null } | null

export function TaxonomyTab({ frame }: { frame: FrameRenderer }) {
  const q = useQuery({ queryKey: ["master", "taxonomy"], queryFn: listTaxonomy })
  const [system, setSystem] = useState<BodySystemId>("gastrointestinal")
  const [filter, setFilter] = useState("")
  const [editing, setEditing] = useState<Editing>(null)
  const toggle = useServiceMutation(({ code, active }: { code: string; active: boolean }) => setSignActive(code, active), {
    success: (_, v) => (v.active ? `${v.code} is offered to the AI again` : `${v.code} deactivated — kept on existing records`),
  })

  const actions = (
    <Button onClick={() => setEditing({ row: null })}>
      <Plus /> Add sign
    </Button>
  )
  if (q.error) return frame(actions, <QueryError error={q.error} onRetry={() => q.refetch()} />)

  const systems = q.data?.systems ?? []
  const current = systems.find((s) => s.id === system)
  const f = filter.trim().toLowerCase()
  const signs = (q.data?.signs ?? [])
    .filter((r) => r.sign.bodySystem === system)
    .filter(
      (r) =>
        !f || r.sign.name.toLowerCase().includes(f) || r.sign.code.toLowerCase().includes(f) || r.sign.synonyms.some((s) => s.includes(f))
    )

  const body = (
    <div className="space-y-5">
      <AiNote aside={q.data ? `taxonomy ${q.data.version}` : null}>
        The AI extracts signs only from this taxonomy (AI-003). Synonyms help it map officer wording; the related-signs window drives
        “reopen case” suggestions.
      </AiNote>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel className="self-start overflow-hidden">
          <h2 className="px-5 pt-4 pb-3 text-base font-semibold">Body systems</h2>
          {q.isPending ? (
            <PanelSkeleton lines={6} />
          ) : (
            <ul className="border-t border-border">
              {systems.map((s) => {
                const active = s.id === system
                return (
                  <li key={s.id} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSystem(s.id)
                        setFilter("")
                      }}
                      aria-current={active || undefined}
                      className={cn(
                        "flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-subtle focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none",
                        active && "bg-selected font-semibold shadow-[inset_3px_0_0_var(--primary)] hover:bg-selected"
                      )}
                    >
                      {s.name}
                      <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
            <h2 className="text-base font-semibold">{current?.name ?? "Signs"}</h2>
            <SearchInput value={filter} onChange={setFilter} placeholder="Filter signs" className="w-full sm:w-64" />
          </div>
          <TableScroll>
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <Th>Code</Th>
                  <Th>Sign</Th>
                  <Th>Synonyms (AI)</Th>
                  <Th>Related window</Th>
                  <Th align="right">Obs · 30 d</Th>
                  <Th align="center">Active</Th>
                </tr>
              </THead>
              <tbody>
                {q.isPending ? (
                  <TableSkeletonRows rows={6} cols={6} />
                ) : signs.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon="search"
                        title={f ? "No signs match the filter" : "No signs in this body system"}
                        action={
                          f ? (
                            <Button size="sm" variant="outline" onClick={() => setFilter("")}>
                              Clear filter
                            </Button>
                          ) : null
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  signs.map((r) => (
                    <Tr key={r.sign.code} onClick={() => setEditing({ row: r })} className={cn(!r.sign.active && "text-muted-foreground")}>
                      <Td className="font-mono text-[13px]">{r.sign.code}</Td>
                      <Td>
                        <button
                          type="button"
                          className={cn(
                            "text-left font-semibold hover:underline focus-visible:underline focus-visible:outline-none",
                            r.sign.active ? "text-foreground" : "text-muted-foreground"
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditing({ row: r })
                          }}
                        >
                          {r.sign.name}
                        </button>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {r.sign.synonyms.map((s) => (
                            <span
                              key={s}
                              className={cn(
                                "rounded-md bg-ai-soft px-2 py-0.5 text-xs font-medium text-ai",
                                !r.sign.active && "opacity-60"
                              )}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">{r.sign.relatedWindowDays} days</Td>
                      <Td align="right" className="tabular-nums">
                        {r.observations30d}
                      </Td>
                      <Td align="center">
                        <span onClick={(e) => e.stopPropagation()}>
                          <Switch
                            checked={r.sign.active}
                            aria-label={`${r.sign.name} active`}
                            onCheckedChange={(c) => toggle.mutate({ code: r.sign.code, active: c })}
                          />
                        </span>
                      </Td>
                    </Tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableScroll>
          <TableFooter>
            {signs.length} sign{signs.length === 1 ? "" : "s"} · inactive signs stay on existing records but are not offered to the AI
          </TableFooter>
        </Panel>
      </div>
      {editing ? (
        <SignDialog
          key={editing.row?.sign.code ?? "new"}
          row={editing.row}
          systems={systems}
          defaultSystem={system}
          onClose={() => setEditing(null)}
          onSaved={(s) => setSystem(s)}
        />
      ) : null}
    </div>
  )
  return frame(actions, body)
}

const schema = z.object({
  bodySystem: z.string().min(1),
  name: z.string().trim().min(1, "Enter the sign name."),
  synonyms: z.array(z.string()),
  relatedWindowDays: z
    .number({ message: "Enter the related window." })
    .int("Whole days only.")
    .min(1, "Related window must be 1–90 days.")
    .max(90, "Related window must be 1–90 days."),
  active: z.boolean(),
})
type Values = z.infer<typeof schema>

/** Chip input: type a synonym and press Enter or comma; × removes. */
function SynonymInput({ value, onChange, id }: { value: string[]; onChange: (v: string[]) => void; id: string }) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const s = draft.trim().toLowerCase()
    if (s && !value.includes(s)) onChange([...value, s])
    setDraft("")
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      add()
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }
  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
      {value.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 rounded-md bg-ai-soft py-0.5 pr-1 pl-2 text-xs font-medium text-ai">
          {s}
          <button
            type="button"
            className="rounded p-0.5 hover:bg-ai-border"
            aria-label={`Remove ${s}`}
            onClick={() => onChange(value.filter((x) => x !== s))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder={value.length ? "Add another…" : "Type a synonym and press Enter"}
        className="h-7 min-w-[140px] flex-1 bg-transparent px-1 text-sm outline-none"
      />
    </div>
  )
}

function SignDialog({
  row,
  systems,
  defaultSystem,
  onClose,
  onSaved,
}: {
  row: SignRow | null
  systems: { id: BodySystemId; name: string }[]
  defaultSystem: BodySystemId
  onClose: () => void
  onSaved: (s: BodySystemId) => void
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: row
      ? {
          bodySystem: row.sign.bodySystem,
          name: row.sign.name,
          synonyms: row.sign.synonyms,
          relatedWindowDays: row.sign.relatedWindowDays,
          active: row.sign.active,
        }
      : { bodySystem: defaultSystem, name: "", synonyms: [], relatedWindowDays: 14, active: true },
  })
  const [formError, setFormError] = useState<string | null>(null)
  const save = useServiceMutation((v: Values) => saveSign(row?.sign.code ?? null, { ...v, bodySystem: v.bodySystem as BodySystemId }), {
    success: (code) => (row ? `${code} saved` : `${code} added to the taxonomy`),
    silentError: true,
    onSuccess: (_, v) => {
      onSaved(v.bodySystem as BodySystemId)
      onClose()
    },
    onError: (e) => setFormError(applyApiError(form, e, ["name", "relatedWindowDays", "bodySystem"])),
  })
  const errors = form.formState.errors
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={row ? `Edit ${row.sign.code} · ${row.sign.name}` : "Add sign"}
      description="Changes bump the taxonomy version and are picked up by the AI worker on its next run."
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
            {row ? "Save sign" : "Add sign"}
          </Button>
        </>
      }
    >
      <FormError message={formError} />
      <Field
        label="Body system"
        required
        htmlFor="sg-system"
        hint={row ? "The body system can't change — it is part of the code." : undefined}
      >
        <Controller
          control={form.control}
          name="bodySystem"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={Boolean(row)}>
              <SelectTrigger id="sg-system" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {systems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label="Sign" required htmlFor="sg-name" error={errors.name?.message}>
        <Input id="sg-name" aria-invalid={Boolean(errors.name) || undefined} {...form.register("name")} />
      </Field>
      <Field label="Synonyms (AI)" htmlFor="sg-syn" hint="Officer wording the AI should map to this sign, e.g. “mushy”, “not firm”.">
        <Controller
          control={form.control}
          name="synonyms"
          render={({ field }) => <SynonymInput id="sg-syn" value={field.value} onChange={field.onChange} />}
        />
      </Field>
      <Field
        label="Related window (days)"
        required
        htmlFor="sg-window"
        error={errors.relatedWindowDays?.message}
        hint="Same or related signs within this window suggest reopening a closed case."
      >
        <Input
          id="sg-window"
          type="number"
          min={1}
          max={90}
          className="w-32"
          aria-invalid={Boolean(errors.relatedWindowDays) || undefined}
          {...form.register("relatedWindowDays", { valueAsNumber: true })}
        />
      </Field>
      <Controller
        control={form.control}
        name="active"
        render={({ field }) => (
          <label className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Active</span>
              <span className="block text-xs text-muted-foreground">
                Inactive signs stay on existing records but are not offered to the AI.
              </span>
            </span>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </label>
        )}
      />
    </FormDialog>
  )
}
