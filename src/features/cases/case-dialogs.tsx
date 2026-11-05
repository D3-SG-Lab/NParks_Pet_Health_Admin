"use client"

import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { FolderOpen, FolderX } from "lucide-react"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { Field } from "@/components/forms/field"
import { Textarea } from "@/components/ui/textarea"
import { useServiceMutation } from "@/lib/query"
import { CLOSE_REASON_LABEL, closeCase, reopenCase } from "@/services/cases"
import type { CloseReason } from "@/types/domain"

import { RadioCards } from "./radio-cards"

const closeSchema = z.object({
  reason: z.enum(["resolved", "released", "duplicate", "other"], { message: "Pick a closure reason." }),
  note: z.string().trim().min(3, "Add a closing note (at least 3 characters)."),
})
type CloseValues = z.infer<typeof closeSchema>

const REASONS: CloseReason[] = ["resolved", "released", "duplicate", "other"]

/** "Close case C-0142?" dialog — Admin_Design.pdf p.17 (FE-016 "Close requires a reason"). */
export function CloseCaseDialog({
  open,
  onOpenChange,
  caseId,
  animalName,
  theme,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  caseId: string
  animalName: string
  theme: string
}) {
  const form = useForm<CloseValues>({ resolver: zodResolver(closeSchema), defaultValues: { reason: "resolved", note: "" } })
  const mutation = useServiceMutation((v: CloseValues) => closeCase(caseId, v.reason, v.note), {
    success: `Case ${caseId} closed`,
    onSuccess: () => {
      form.reset()
      onOpenChange(false)
    },
  })
  const reason = useWatch({ control: form.control, name: "reason" })
  const errors = form.formState.errors

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) form.reset()
        onOpenChange(o)
      }}
      title={`Close case ${caseId}?`}
      description={`${animalName} · ${theme}. The case can be reopened later; the closure is audited.`}
      icon={<FolderX className="size-5" />}
      destructive
      confirmLabel="Close case"
      loading={mutation.isPending}
      onConfirm={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <form className="space-y-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
        <Field label="Closure reason" required error={errors.reason?.message}>
          <RadioCards
            ariaLabel="Closure reason"
            value={reason}
            onChange={(v) => form.setValue("reason", v, { shouldValidate: true })}
            options={REASONS.map((r) => ({ value: r, label: CLOSE_REASON_LABEL[r] }))}
          />
        </Field>
        <Field label="Closing note" required htmlFor="close-note" error={errors.note?.message}>
          <Textarea
            id="close-note"
            rows={3}
            placeholder="e.g. Stool firm for 3 consecutive inspections; appetite full since 23/10."
            aria-invalid={Boolean(errors.note) || undefined}
            {...form.register("note")}
          />
        </Field>
      </form>
    </ConfirmDialog>
  )
}

const reopenSchema = z.object({ note: z.string().trim().max(500, "Keep the reason under 500 characters.") })
type ReopenValues = z.infer<typeof reopenSchema>

/** Manual reopen (FE-016) — earlier history stays linked. */
export function ReopenCaseDialog({ open, onOpenChange, caseId }: { open: boolean; onOpenChange: (open: boolean) => void; caseId: string }) {
  const form = useForm<ReopenValues>({ resolver: zodResolver(reopenSchema), defaultValues: { note: "" } })
  const mutation = useServiceMutation((v: ReopenValues) => reopenCase(caseId, v.note), {
    success: `Case ${caseId} reopened`,
    onSuccess: () => {
      form.reset()
      onOpenChange(false)
    },
  })
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) form.reset()
        onOpenChange(o)
      }}
      title={`Reopen case ${caseId}?`}
      description="The case returns to Open with its full earlier history. Reopening is audited and the assignee is notified."
      icon={<FolderOpen className="size-5" />}
      confirmLabel="Reopen case"
      loading={mutation.isPending}
      onConfirm={form.handleSubmit((v) => mutation.mutate(v))}
    >
      <Field label="Reason (optional)" htmlFor="reopen-note" error={form.formState.errors.note?.message}>
        <Textarea id="reopen-note" rows={3} placeholder="Why is the case being reopened?" {...form.register("note")} />
      </Field>
    </ConfirmDialog>
  )
}
