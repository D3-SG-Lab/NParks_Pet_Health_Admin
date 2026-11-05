"use client"

import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { z } from "zod"

import { StatusChip } from "@/components/common/status-chip"
import { SectionLabel } from "@/components/common/surfaces"
import { DateTimePicker } from "@/components/forms/date-picker"
import { Field } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { todayISO } from "@/lib/clock"
import { fmtDayMonth } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import { addFollowUp, setFollowUpDone, type CaseDetail } from "@/services/cases"
import { listAssignees } from "@/services/dashboard"

import { dueLabel } from "./case-helpers"

const schema = z.object({
  action: z.string().trim().min(3, "Describe the follow-up action."),
  assigneeId: z.string().min(1, "Pick an assignee."),
  dueAt: z.string().min(16, "Pick a due date and time."),
})
type Values = z.infer<typeof schema>

function AddFollowUpForm({ detail, onDone }: { detail: CaseDetail; onDone: () => void }) {
  const assignees = useQuery({ queryKey: ["assignees", detail.animal.id], queryFn: () => listAssignees(detail.animal.id) })
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { action: "", assigneeId: detail.case.assigneeId ?? "", dueAt: `${todayISO()}T16:00:00` },
  })
  const mutation = useServiceMutation((v: Values) => addFollowUp(detail.case.id, v), {
    success: (_d, v) => `Follow-up assigned to ${assignees.data?.find((a) => a.id === v.assigneeId)?.name ?? "assignee"}`,
    onSuccess: onDone,
  })
  const errors = form.formState.errors
  const assigneeId = useWatch({ control: form.control, name: "assigneeId" })
  const dueAt = useWatch({ control: form.control, name: "dueAt" })
  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
      className="mt-3 space-y-3 rounded-xl border border-border bg-subtle p-3"
      noValidate
    >
      <Field label="Action" required htmlFor="fu-action" error={errors.action?.message}>
        <Input
          id="fu-action"
          autoFocus
          placeholder="e.g. Recheck stool at PM inspection"
          aria-invalid={Boolean(errors.action) || undefined}
          {...form.register("action")}
        />
      </Field>
      <Field label="Assign to" required error={errors.assigneeId?.message}>
        <Select value={assigneeId} onValueChange={(v) => form.setValue("assigneeId", v, { shouldValidate: true })}>
          <SelectTrigger className="w-full" aria-label="Assign to" aria-invalid={Boolean(errors.assigneeId) || undefined}>
            <SelectValue placeholder={assignees.isPending ? "Loading…" : "Pick an assignee"} />
          </SelectTrigger>
          <SelectContent>
            {(assignees.data ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Due" required error={errors.dueAt?.message}>
        <DateTimePicker
          value={dueAt}
          min={todayISO()}
          ariaLabel="Due"
          invalid={Boolean(errors.dueAt)}
          onChange={(v) => form.setValue("dueAt", v, { shouldValidate: true })}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={mutation.isPending}>
          Add follow-up
        </Button>
      </div>
    </form>
  )
}

/** FOLLOW-UP ACTIONS column of the case detail (p.4). */
export function FollowUps({ detail, canEdit }: { detail: CaseDetail; canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  const toggle = useServiceMutation((v: { id: string; done: boolean }) => setFollowUpDone(detail.case.id, v.id, v.done), {
    success: (_d, v) => (v.done ? "Follow-up marked done" : "Follow-up reopened"),
  })
  const closed = detail.case.status === "closed"

  return (
    <div>
      <SectionLabel>Follow-up actions</SectionLabel>
      {detail.followUps.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No follow-up actions yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {detail.followUps.map((f) => (
            <li key={f.id} className="flex items-start gap-3 py-3">
              <Checkbox
                className="mt-0.5 size-[18px]"
                checked={f.done}
                disabled={!canEdit || closed || toggle.isPending}
                onCheckedChange={(v) => toggle.mutate({ id: f.id, done: v === true })}
                aria-label={`${f.done ? "Reopen" : "Complete"}: ${f.action}`}
              />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", f.done ? "text-muted-foreground line-through" : "text-foreground")}>{f.action}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.assigneeName}</p>
              </div>
              {f.done ? (
                <span className="font-mono text-xs text-muted-foreground">{f.doneAt ? fmtDayMonth(f.doneAt) : ""}</span>
              ) : (
                <StatusChip size="sm" tone="danger" outline={f.overdue}>
                  {f.overdue ? `Overdue · ${dueLabel(f.dueAt)}` : `Due ${dueLabel(f.dueAt)}`}
                </StatusChip>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !closed ? (
        adding ? (
          <AddFollowUpForm detail={detail} onDone={() => setAdding(false)} />
        ) : (
          <Button variant="link" size="sm" className="mt-1 h-8 gap-1.5 text-primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add follow-up action
          </Button>
        )
      ) : null}
    </div>
  )
}
