"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, TriangleAlert } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { StatusChip } from "@/components/common/status-chip"
import { PanelSkeleton, QueryError } from "@/components/common/states"
import { Panel, PanelHeader } from "@/components/common/surfaces"
import { Field, FormError } from "@/components/forms/field"
import { TableScroll } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { errorMessage } from "@/lib/errors"
import { fmtDayMonth, fmtRelative } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import {
  createDraft,
  createTemplate,
  discardDraft,
  listTemplates,
  publishDraft,
  saveDraftItems,
  type TemplateListItem,
} from "@/services/master-data"
import type { ChecklistItem, ChecklistTemplateVersion } from "@/types/domain"

import type { FrameRenderer } from "./master-data-screen"
import { MobilePreviewDialog } from "./mobile-preview"
import { FormDialog, applyApiError } from "./shared"
import { INPUT_LABEL, TemplateItemDialog } from "./template-item-dialog"

type View = "draft" | "live"

/** `tpl-dog` opens the draft (if any); `tpl-dog@live` opens the live version. */
function parseSelection(selectedId: string | null, list: TemplateListItem[]): { item: TemplateListItem; view: View } | null {
  const [id, suffix] = (selectedId ?? "").split("@")
  const item = list.find((t) => t.template.id === id) ?? list[0]
  if (!item) return null
  const view: View = suffix === "live" || item.draft === null ? "live" : "draft"
  return { item, view }
}

const itemCount = (items: ChecklistItem[]) => items.reduce((n, i) => n + Math.max(1, i.rows.length), 0)

function liveSubtitle(t: TemplateListItem): string {
  const live = t.template.versions.find((v) => v.status === "live")
  if (!live) return "No live version yet"
  const speciesSpecific = t.template.appliesTo === "Dog" || t.template.appliesTo === "Cat"
  return speciesSpecific && t.liveSince
    ? `v${live.version} · in use since ${fmtDayMonth(t.liveSince)}`
    : `v${live.version} · ${t.template.appliesTo}`
}

export function TemplatesTab({
  frame,
  selectedId,
  onSelect,
}: {
  frame: FrameRenderer
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const q = useQuery({ queryKey: ["master", "templates"], queryFn: listTemplates })
  const [creating, setCreating] = useState(false)

  const actions = (
    <Button onClick={() => setCreating(true)}>
      <Plus /> New template
    </Button>
  )
  if (q.error) return frame(actions, <QueryError error={q.error} onRetry={() => q.refetch()} />)

  const selection = q.data ? parseSelection(selectedId, q.data) : null

  const body = (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Panel className="self-start overflow-hidden">
        <PanelHeader title="Templates" />
        {q.isPending ? (
          <PanelSkeleton lines={5} />
        ) : (
          <ul className="border-t border-border">
            {q.data.flatMap((t) => {
              const rows: { key: string; view: View; title: string; sub: string }[] = []
              if (t.draft !== null)
                rows.push({
                  key: `${t.template.id}`,
                  view: "draft",
                  title: t.template.name,
                  sub: `v${t.draft} draft · edited ${t.draftUpdatedAt ? fmtRelative(t.draftUpdatedAt) : "—"}`,
                })
              if (t.live !== null) rows.push({ key: `${t.template.id}@live`, view: "live", title: t.template.name, sub: liveSubtitle(t) })
              return rows.map((r) => {
                const active = selection?.item.template.id === t.template.id && selection.view === r.view
                return (
                  <li key={r.key} className="border-b border-border last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onSelect(r.key)}
                      aria-current={active || undefined}
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-subtle focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none",
                        active && "bg-selected shadow-[inset_3px_0_0_var(--primary)] hover:bg-selected"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>
                      </span>
                      {r.view === "draft" ? (
                        <StatusChip tone="warning" size="sm">
                          Draft
                        </StatusChip>
                      ) : (
                        <StatusChip tone="success" size="sm" dot>
                          Live
                        </StatusChip>
                      )}
                    </button>
                  </li>
                )
              })
            })}
          </ul>
        )}
      </Panel>
      {q.isPending ? (
        <Panel>
          <PanelSkeleton lines={8} />
        </Panel>
      ) : selection ? (
        <TemplateEditor
          key={`${selection.item.template.id}-${selection.view}`}
          item={selection.item}
          view={selection.view}
          onSelect={onSelect}
        />
      ) : (
        <Panel className="p-8 text-center text-sm text-muted-foreground">No templates yet — create one to get started.</Panel>
      )}
      {creating ? <NewTemplateDialog list={q.data ?? []} onClose={() => setCreating(false)} onCreated={onSelect} /> : null}
    </div>
  )
  return frame(actions, body)
}

function OptionChips({ item }: { item: ChecklistItem }) {
  if (item.input === "free_text") return <span className="text-[13px] text-muted-foreground">Any text is sent for AI review</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.options.map((o) => (
        <span
          key={o.label}
          className={cn(
            "inline-flex h-7 items-center rounded-md border px-2 text-xs font-semibold",
            o.label === item.defaultOption
              ? "border-primary bg-primary-soft/60 text-primary"
              : o.abnormal
                ? "border-transparent bg-abnormal-soft text-abnormal"
                : "border-transparent bg-muted text-foreground"
          )}
        >
          {o.label}
        </span>
      ))}
    </div>
  )
}

function TemplateEditor({ item, view, onSelect }: { item: TemplateListItem; view: View; onSelect: (id: string) => void }) {
  const t = item.template
  const version = t.versions.find((v) => v.status === view) as ChecklistTemplateVersion
  const live = t.versions.find((v) => v.status === "live")
  const editable = view === "draft"
  const [editing, setEditing] = useState<{ item: ChecklistItem | null } | null>(null)
  const [itemError, setItemError] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [preview, setPreview] = useState(false)
  const [confirm, setConfirm] = useState<"discard" | "publish" | null>(null)

  const saveItems = useServiceMutation((items: ChecklistItem[]) => saveDraftItems(t.id, items), {
    silentError: true,
    onSuccess: () => setEditing(null),
    onError: (e) => setItemError(errorMessage(e)),
  })
  const quickSave = useServiceMutation((items: ChecklistItem[]) => saveDraftItems(t.id, items))
  const discard = useServiceMutation(() => discardDraft(t.id), {
    success: `${t.name} draft discarded`,
    onSuccess: () => {
      setConfirm(null)
      onSelect(`${t.id}@live`)
    },
  })
  const publish = useServiceMutation(() => publishDraft(t.id), {
    success: (v) => `${t.name} v${v} is live`,
    onSuccess: () => {
      setConfirm(null)
      onSelect(`${t.id}@live`)
    },
  })
  const draftFromLive = useServiceMutation(() => createDraft(t.id), {
    success: `Draft created from v${live?.version ?? ""}`,
    onSuccess: () => onSelect(t.id),
  })

  const items = version.items
  const sections = Array.from(new Set(items.map((i) => i.section)))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    // Keep items inside their section's group: adopt the section of the target neighbour.
    next.splice(to, 0, { ...moved, section: items[to].section })
    quickSave.mutate(next)
  }
  const title = t.kind === "daily" ? `${t.name} inspection` : t.name

  return (
    <Panel className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <StatusChip tone={editable ? "warning" : "success"} size="sm" dot={!editable}>
              v{version.version} {editable ? "draft" : "live"}
            </StatusChip>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {editable
              ? live
                ? `Based on v${live.version}`
                : "New template"
              : `Published ${version.publishedAt ? fmtDayMonth(version.publishedAt) : "—"}`}{" "}
            · {t.sessions} · {itemCount(items)} items
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreview(true)}>
            Preview on mobile
          </Button>
          {!editable ? (
            item.draft !== null ? (
              <Button onClick={() => onSelect(t.id)}>Open v{item.draft} draft</Button>
            ) : (
              <Button loading={draftFromLive.isPending} onClick={() => draftFromLive.mutate()}>
                <Pencil /> Edit as new draft
              </Button>
            )
          ) : null}
        </div>
      </div>

      {editable ? (
        <div className="mx-5 mb-4 flex items-start gap-3 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Publishing applies to new inspections only.{" "}
          {live ? `Inspections already recorded keep v${live.version}.` : "No inspections use this template yet."}
        </div>
      ) : null}

      <TableScroll>
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="border-y border-border bg-subtle">
            <tr className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              <th className="w-12" aria-label="Reorder" />
              <th className="h-10 px-3 text-left">Item</th>
              <th className="px-3 text-left">Input</th>
              <th className="px-3 text-left">
                Options · <span className="text-primary">Default</span> · <span className="text-abnormal">Abnormal</span>
              </th>
              <th className="px-3 pr-5 text-left">Note if abnormal</th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section}>
              <tr className="border-b border-border bg-subtle/70">
                <th colSpan={5} scope="colgroup" className="eyebrow h-9 px-5 text-left">
                  {section}
                </th>
              </tr>
              {items.map((it, index) =>
                it.section !== section ? null : (
                  <tr
                    key={it.id}
                    draggable={editable}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => {
                      if (dragIndex === null) return
                      e.preventDefault()
                      setOverIndex(index)
                    }}
                    onDragEnd={() => {
                      setDragIndex(null)
                      setOverIndex(null)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragIndex !== null) move(dragIndex, index)
                      setDragIndex(null)
                      setOverIndex(null)
                    }}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      it.changeNote && editable && "bg-selected shadow-[inset_3px_0_0_var(--primary)]",
                      overIndex === index && dragIndex !== index && "outline-2 -outline-offset-2 outline-primary/40",
                      dragIndex === index && "opacity-50"
                    )}
                  >
                    <td className="px-2 align-middle">
                      {editable ? (
                        <div className="flex items-center">
                          <GripVertical className="size-4 cursor-grab text-muted-foreground" aria-hidden />
                          <span className="flex flex-col">
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              onClick={() => move(index, index - 1)}
                              disabled={index === 0}
                              aria-label={`Move ${it.label} up`}
                            >
                              <ArrowUp className="size-3" />
                            </button>
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              onClick={() => move(index, index + 1)}
                              disabled={index === items.length - 1}
                              aria-label={`Move ${it.label} down`}
                            >
                              <ArrowDown className="size-3" />
                            </button>
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-[280px] px-3 py-3.5">
                      {editable ? (
                        <button
                          type="button"
                          className="text-left font-semibold text-foreground hover:underline focus-visible:underline focus-visible:outline-none"
                          onClick={() => {
                            setItemError(null)
                            setEditing({ item: it })
                          }}
                        >
                          {it.label}
                        </button>
                      ) : (
                        <span className="font-semibold">{it.label}</span>
                      )}
                      {it.changeNote && editable ? (
                        <StatusChip tone="info" size="sm" className="ml-2">
                          Changed
                        </StatusChip>
                      ) : null}
                      {it.rows.length ? <p className="text-xs text-muted-foreground">{it.rows.length} rows</p> : null}
                      {it.changeNote && editable ? <p className="text-xs text-muted-foreground">{it.changeNote}</p> : null}
                    </td>
                    <td className="px-3 whitespace-nowrap text-muted-foreground">{INPUT_LABEL[it.input]}</td>
                    <td className="px-3 py-3">
                      <OptionChips item={it} />
                    </td>
                    <td className="px-3 pr-5">
                      {it.input === "free_text" || (it.input === "single" && !it.options.some((o) => o.abnormal)) ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Switch
                          checked={it.noteIfAbnormal}
                          disabled={!editable || quickSave.isPending}
                          aria-label={`Note required if ${it.label} is abnormal`}
                          onCheckedChange={(c) => quickSave.mutate(items.map((x) => (x.id === it.id ? { ...x, noteIfAbnormal: c } : x)))}
                        />
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          ))}
        </table>
      </TableScroll>

      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <Button
            variant="link"
            onClick={() => {
              setItemError(null)
              setEditing({ item: null })
            }}
          >
            <Plus /> Add item
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirm("discard")} disabled={!live}>
              Discard draft
            </Button>
            <Button onClick={() => setConfirm("publish")}>Publish v{version.version}</Button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <TemplateItemDialog
          item={editing.item}
          sections={sections}
          saving={saveItems.isPending}
          serverError={itemError}
          onClose={() => setEditing(null)}
          onSave={(saved) => {
            setItemError(null)
            saveItems.mutate(editing.item ? items.map((x) => (x.id === saved.id ? saved : x)) : [...items, saved])
          }}
          onDelete={editing.item ? () => saveItems.mutate(items.filter((x) => x.id !== editing.item?.id)) : undefined}
        />
      ) : null}
      <MobilePreviewDialog open={preview} onOpenChange={setPreview} title={title} items={items} />
      <ConfirmDialog
        open={confirm === "discard"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Discard ${t.name} v${version.version} draft?`}
        description={`All draft changes are lost. v${live?.version ?? ""} stays live.`}
        confirmLabel="Discard draft"
        destructive
        loading={discard.isPending}
        onConfirm={() => discard.mutate()}
      />
      <ConfirmDialog
        open={confirm === "publish"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Publish ${t.name} v${version.version}?`}
        description={`New inspections will use v${version.version} immediately on mobile and web.${live ? ` Inspections already recorded keep v${live.version}.` : ""} The change is audited.`}
        confirmLabel={`Publish v${version.version}`}
        loading={publish.isPending}
        onConfirm={() => publish.mutate()}
      />
    </Panel>
  )
}

const newSchema = z.object({
  name: z.string().trim().min(1, "Enter a template name."),
  kind: z.enum(["daily", "arrival"]),
  appliesTo: z.string(),
  copyFrom: z.string(),
})
type NewValues = z.infer<typeof newSchema>

function NewTemplateDialog({
  list,
  onClose,
  onCreated,
}: {
  list: TemplateListItem[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const form = useForm<NewValues>({
    resolver: zodResolver(newSchema),
    defaultValues: { name: "", kind: "daily", appliesTo: "", copyFrom: "none" },
  })
  const [formError, setFormError] = useState<string | null>(null)
  const create = useServiceMutation((v: NewValues) => createTemplate({ ...v, copyFrom: v.copyFrom === "none" ? null : v.copyFrom }), {
    success: (_, v) => `${v.name} v1 draft created`,
    silentError: true,
    onSuccess: (id) => {
      onCreated(id)
      onClose()
    },
    onError: (e) => setFormError(applyApiError(form, e, ["name"])),
  })
  const errors = form.formState.errors
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="New checklist template"
      description="Starts as a v1 draft. Assign it to a species after publishing."
      onSubmit={form.handleSubmit((v) => create.mutate(v))}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create draft
          </Button>
        </>
      }
    >
      <FormError message={formError} />
      <Field label="Name" required htmlFor="nt-name" error={errors.name?.message} hint="e.g. Rabbit · daily">
        <Input id="nt-name" aria-invalid={Boolean(errors.name) || undefined} {...form.register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind" htmlFor="nt-kind">
          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="nt-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily inspection (AM/PM)</SelectItem>
                  <SelectItem value="arrival">Arrival exam</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Applies to" htmlFor="nt-applies" hint="e.g. Other species">
          <Input id="nt-applies" {...form.register("appliesTo")} />
        </Field>
      </div>
      <Field label="Copy items from" htmlFor="nt-copy">
        <Controller
          control={form.control}
          name="copyFrom"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="nt-copy" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Start empty</SelectItem>
                {list
                  .filter((t) => t.live !== null)
                  .map((t) => (
                    <SelectItem key={t.template.id} value={t.template.id}>
                      {t.template.name} v{t.live}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
    </FormDialog>
  )
}
