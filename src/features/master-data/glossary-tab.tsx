"use client"

import { useState, useSyncExternalStore } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, X } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { AiNote } from "@/components/common/ai-card"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { SearchInput } from "@/components/common/filters"
import { StatusChip, type ChipTone } from "@/components/common/status-chip"
import { EmptyState, QueryError } from "@/components/common/states"
import { Panel } from "@/components/common/surfaces"
import { Field, FormError } from "@/components/forms/field"
import { Pagination, Table, TableFooter, TableScroll, TableSkeletonRows, Td, Th, THead, Tr } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useDebounced } from "@/hooks/use-debounced"
import { fmtDayMonth } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { GLOSSARY_CATEGORIES, deleteGlossaryTerm, importGlossary, listGlossary, saveGlossaryTerm } from "@/services/master-data"
import type { GlossaryCategory, GlossaryTerm } from "@/types/domain"

import type { FrameRenderer } from "./master-data-screen"
import { CsvImportButton, applyApiError } from "./shared"

const CATEGORY_TONE: Record<GlossaryCategory, ChipTone> = {
  Location: "info",
  Care: "success",
  Abbreviation: "neutral",
  Clinical: "abnormal",
}

const LG_QUERY = "(min-width: 1024px)"
function useIsLarge(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(LG_QUERY)
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => window.matchMedia(LG_QUERY).matches,
    () => true
  )
}

type Editing = { term: GlossaryTerm | null } | null

export function GlossaryTab({ frame }: { frame: FrameRenderer }) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<GlossaryCategory | "all">("all")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Editing>(null)
  const large = useIsLarge()
  const debounced = useDebounced(search, 250)
  const q = useQuery({
    queryKey: ["master", "glossary", debounced, category, page],
    queryFn: () => listGlossary({ search: debounced, category, page }),
    placeholderData: keepPreviousData,
  })

  const actions = (
    <>
      <CsvImportButton
        templateName="glossary-template.csv"
        templateHeaders={["term", "meaning", "category", "example"]}
        templateRows={[["run", "Outdoor exercise area attached to a dog kennel", "Location", "loose stool in run"]]}
        onImport={importGlossary}
      />
      <Button onClick={() => setEditing({ term: null })}>
        <Plus /> Add term
      </Button>
    </>
  )
  if (q.error) return frame(actions, <QueryError error={q.error} onRetry={() => q.refetch()} />)

  const editor = editing ? <TermEditor key={editing.term?.id ?? "new"} term={editing.term} onClose={() => setEditing(null)} /> : null

  const body = (
    <div className={editing && large ? "grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]" : ""}>
      <Panel className="min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
          <h2 className="text-base font-semibold">
            Glossary <span className="font-normal text-muted-foreground">· {q.data?.totalAll ?? "…"} terms</span>
          </h2>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v)
                setPage(1)
              }}
              placeholder="Filter terms"
              className="min-w-0 flex-1 sm:w-60 sm:flex-none"
            />
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v as GlossaryCategory | "all")
                setPage(1)
              }}
            >
              <SelectTrigger className="w-44" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {GLOSSARY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <TableScroll>
          <Table className="min-w-[720px]">
            <THead>
              <tr>
                <Th>Term</Th>
                <Th>Meaning</Th>
                <Th>Category</Th>
                <Th>Updated</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </THead>
            <tbody>
              {q.isPending ? (
                <TableSkeletonRows rows={7} cols={5} />
              ) : q.data.terms.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon="search"
                      title="No terms match"
                      description="Try another word or category."
                      action={
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSearch("")
                            setCategory("all")
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                q.data.terms.map((g) => {
                  const selected = editing?.term?.id === g.id
                  return (
                    <Tr key={g.id} selected={selected}>
                      <Td>
                        <span className="inline-flex rounded-md border border-border bg-subtle px-2 py-1 font-mono text-[13px] font-semibold whitespace-nowrap">
                          {g.term}
                        </span>
                      </Td>
                      <Td className="max-w-[420px] py-3">
                        <p>{g.meaning}</p>
                        {g.example && selected ? <p className="mt-0.5 text-xs text-muted-foreground italic">“{g.example}…”</p> : null}
                      </Td>
                      <Td>
                        <StatusChip tone={CATEGORY_TONE[g.category]} size="sm">
                          {g.category}
                        </StatusChip>
                      </Td>
                      <Td className="font-mono text-[13px] text-muted-foreground">{fmtDayMonth(g.updatedAt)}</Td>
                      <Td align="right">
                        <Button variant="outline" size="sm" onClick={() => setEditing({ term: g })} aria-label={`Edit ${g.term}`}>
                          Edit
                        </Button>
                      </Td>
                    </Tr>
                  )
                })
              )}
            </tbody>
          </Table>
        </TableScroll>
        {q.data ? (
          <TableFooter>
            <span>
              Showing {q.data.terms.length} of {q.data.total}
            </span>
            <Pagination page={q.data.page} pages={q.data.pages} onPage={setPage} />
          </TableFooter>
        ) : null}
      </Panel>
      {large && editor ? <Panel className="self-start">{editor}</Panel> : null}
      {!large ? (
        <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
          <SheetContent side="right" className="w-full max-w-md overflow-y-auto p-0 sm:max-w-md" showCloseButton={false}>
            <SheetTitle className="sr-only">{editing?.term ? "Edit term" : "Add term"}</SheetTitle>
            <SheetDescription className="sr-only">Glossary term used by the AI worker</SheetDescription>
            {editor}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
  return frame(actions, body)
}

const schema = z.object({
  term: z.string().trim().min(1, "Enter the term."),
  meaning: z.string().trim().min(1, "Enter the meaning."),
  category: z.enum(["Location", "Care", "Abbreviation", "Clinical"]),
  example: z.string(),
})
type Values = z.infer<typeof schema>

function TermEditor({ term, onClose }: { term: GlossaryTerm | null; onClose: () => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: term
      ? { term: term.term, meaning: term.meaning, category: term.category, example: term.example }
      : { term: "", meaning: "", category: "Clinical", example: "" },
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const save = useServiceMutation((v: Values) => saveGlossaryTerm(term?.id ?? null, v), {
    success: (_, v) => (term ? `“${v.term}” saved` : `“${v.term}” added`),
    silentError: true,
    onSuccess: onClose,
    onError: (e) => setFormError(applyApiError(form, e, ["term", "meaning", "category", "example"])),
  })
  const del = useServiceMutation(() => deleteGlossaryTerm(term?.id ?? ""), { success: `“${term?.term}” deleted`, onSuccess: onClose })
  const errors = form.formState.errors

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((v) => {
        setFormError(null)
        save.mutate(v)
      })}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">{term ? "Edit term" : "Add term"}</h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close editor">
          <X />
        </Button>
      </div>
      <div className="space-y-4 px-5 py-5">
        <FormError message={formError} />
        <Field label="Term" required htmlFor="gl-term" error={errors.term?.message}>
          <Input id="gl-term" className="font-mono" aria-invalid={Boolean(errors.term) || undefined} {...form.register("term")} />
        </Field>
        <Field label="Meaning" required htmlFor="gl-meaning" error={errors.meaning?.message}>
          <Textarea id="gl-meaning" rows={3} aria-invalid={Boolean(errors.meaning) || undefined} {...form.register("meaning")} />
        </Field>
        <Field label="Category" htmlFor="gl-category">
          <Controller
            control={form.control}
            name="category"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="gl-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GLOSSARY_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field label="Example phrase" htmlFor="gl-example" hint="Used in the AI evaluation set (AI-008)">
          <Input id="gl-example" {...form.register("example")} />
        </Field>
        <AiNote>The AI worker picks up glossary changes on its next run.</AiNote>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
        {term ? (
          <Button type="button" variant="destructive-outline" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${term?.term}”?`}
        description="The AI worker stops using this term on its next run. The deletion is audited."
        confirmLabel="Delete term"
        destructive
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </form>
  )
}
