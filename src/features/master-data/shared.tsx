"use client"

import { useRef, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, Download, Upload } from "lucide-react"
import type { FieldValues, Path, UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { downloadCsv, parseCsv, readFileText } from "@/lib/csv"
import { errorMessage, isApiError } from "@/lib/errors"
import { cn } from "@/lib/utils"

/**
 * Maps a service ApiError onto a react-hook-form field when `error.field`
 * matches a form field; otherwise returns the message for a FormError banner.
 */
export function applyApiError<T extends FieldValues>(form: UseFormReturn<T>, error: unknown, fields: readonly string[]): string | null {
  if (isApiError(error) && error.field && fields.includes(error.field)) {
    form.setError(error.field as Path<T>, { type: "server", message: error.message })
    return null
  }
  return errorMessage(error)
}

/** Dialog shell used by every master-data form (title, description, scrollable body, footer). */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  onSubmit,
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer: ReactNode
  onSubmit: () => void
  wide?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[92vh] gap-0 overflow-hidden rounded-2xl p-0", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="flex max-h-[92vh] flex-col"
        >
          <DialogHeader className="border-b border-border px-6 pt-5 pb-4 text-left">
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="thin-scroll flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
          <DialogFooter className="mx-0 mb-0 rounded-b-2xl px-6 py-4">{footer}</DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Checkbox multi-select in a popover (species allowed, kennel types). */
export function MultiSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  id?: string
  options: { value: string; label: string }[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
  invalid?: boolean
}) {
  const labels = options.filter((o) => value.includes(o.value)).map((o) => o.label)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          data-invalid={invalid || undefined}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm shadow-[0_1px_1px_rgb(20_35_42/0.03)] outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 data-invalid:border-destructive",
            labels.length === 0 && "text-muted-foreground"
          )}
        >
          <span className="truncate">{labels.length ? labels.join(", ") : placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[220px] p-1.5">
        {options.map((o) => {
          const checked = value.includes(o.value)
          return (
            <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-muted">
              <Checkbox checked={checked} onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))} />
              {o.label}
            </label>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

interface ImportResult {
  created: number
  updated: number
  errors: string[]
}

/**
 * "Import CSV" button: picks a .csv file, parses it and calls the import
 * service. Shows a result toast and an error list dialog when rows fail.
 */
export function CsvImportButton({
  label = "Import CSV",
  templateName,
  templateHeaders,
  templateRows,
  onImport,
}: {
  label?: string
  templateName: string
  templateHeaders: string[]
  templateRows: string[][]
  onImport: (rows: string[][]) => Promise<ImportResult>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const rows = parseCsv(await readFileText(file))
      if (rows.length === 0) throw new Error("The file is empty.")
      const r = await onImport(rows)
      await qc.invalidateQueries()
      if (r.errors.length) setResult(r)
      else toast.success(`Imported ${r.created + r.updated} rows · ${r.created} new, ${r.updated} updated`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Button variant="outline" loading={busy} onClick={() => inputRef.current?.click()}>
        {busy ? null : <Upload />} {label}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Download CSV template"
        title="Download CSV template"
        onClick={() => downloadCsv(templateName, templateHeaders, templateRows)}
      >
        <Download />
      </Button>
      <Dialog open={result !== null} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Import finished with errors</DialogTitle>
            <DialogDescription>
              {result
                ? `${result.created} new and ${result.updated} updated rows were saved. ${result.errors.length} row${result.errors.length === 1 ? "" : "s"} could not be imported:`
                : null}
            </DialogDescription>
          </DialogHeader>
          <ul className="thin-scroll max-h-60 space-y-1.5 overflow-y-auto rounded-lg border border-destructive-border bg-destructive-tile p-3 text-sm text-destructive">
            {result?.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Blue info banner ("Species names are also passed to the AI worker…"). */
export function InfoBanner({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-info-border bg-info-soft px-4 py-3 text-sm font-medium text-info">
      {icon}
      <span>{children}</span>
    </div>
  )
}

/** Code tile in the blocks list ("KC2"; isolation ward tinted red). */
export function BlockTile({ code, isolation }: { code: string; isolation?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 min-w-10 shrink-0 items-center justify-center rounded-lg border px-1.5 font-mono text-xs font-semibold",
        isolation ? "border-destructive-border bg-destructive-soft text-destructive" : "border-border bg-subtle text-foreground"
      )}
    >
      {code}
    </span>
  )
}
