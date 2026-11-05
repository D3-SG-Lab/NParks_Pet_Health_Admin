"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ChevronRight } from "lucide-react"

import { AiSummaryCard } from "@/components/common/ai-card"
import { AnimalAvatar } from "@/components/common/avatars"
import { DateTimePicker } from "@/components/forms/date-picker"
import { Field } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ROLE_LABEL } from "@/config/rbac"
import { todayISO } from "@/lib/clock"
import { isApiError } from "@/lib/errors"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import { assignFollowUp, listAssignees, type UnwellRow } from "@/services/dashboard"
import type { Role } from "@/types/domain"

const schema = z.object({
  assigneeId: z.string().min(1, "Pick who should do this."),
  action: z.string().trim().min(3, "Describe the follow-up action.").max(120, "Keep the action under 120 characters."),
  dueAt: z.string().min(1, "Pick a due date and time."),
})
type FormValues = z.infer<typeof schema>

/** Right panel of the dashboard (p.1): animal header, AI 30-day summary, "Assign follow-up". */
export function FollowUpPanel({
  row,
  canAssign,
  className,
  onAssigned,
}: {
  row: UnwellRow
  canAssign: boolean
  className?: string
  onAssigned?: () => void
}) {
  const router = useRouter()
  const { animal } = row
  const assignees = useQuery({ queryKey: ["assignees", animal.id], queryFn: () => listAssignees(animal.id) })
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { assigneeId: row.assigneeId ?? "", action: "", dueAt: "" },
  })

  const mutation = useServiceMutation((v: FormValues) => assignFollowUp(animal.id, v), {
    success: (_d, v) => `Follow-up assigned to ${assignees.data?.find((a) => a.id === v.assigneeId)?.name ?? "assignee"}`,
    silentError: false,
    onSuccess: () => {
      form.reset({ assigneeId: form.getValues("assigneeId"), action: "", dueAt: "" })
      onAssigned?.()
    },
    onError: (e) => {
      if (isApiError(e) && e.field && ["assigneeId", "action", "dueAt"].includes(e.field))
        form.setError(e.field as keyof FormValues, { message: e.message })
    },
  })

  const errors = form.formState.errors
  return (
    <div className={cn("space-y-5", className)}>
      <div className="flex items-start gap-3">
        <AnimalAvatar name={animal.name} speciesId={animal.speciesId} size="lg" className="size-12 rounded-xl text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{animal.name}</p>
          <p className="text-[13px] text-muted-foreground">
            {animal.kennelCode} · {row.speciesName} · Day {row.stay.day} of {row.stay.total}
          </p>
        </div>
        <Link
          href={row.caseId ? `/cases?id=${row.caseId}` : `/animals/${animal.id}`}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-1 text-[13px] font-semibold text-primary hover:underline"
        >
          {row.caseId ? "Open case" : "Open record"} <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      <AiSummaryCard summary={row.summary} onCite={() => router.push(`/animals/${animal.id}`)} />

      {canAssign ? (
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate className="space-y-4">
          <h3 className="text-[15px] font-semibold">Assign follow-up</h3>
          <Field label="Assign to" required error={errors.assigneeId?.message} htmlFor="fu-assignee">
            <Controller
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="fu-assignee" className="w-full" aria-invalid={Boolean(errors.assigneeId)}>
                    <SelectValue placeholder={assignees.isPending ? "Loading…" : "Choose a person"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(assignees.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} <span className="text-muted-foreground">· {ROLE_LABEL[u.role as Role]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Action" required error={errors.action?.message} htmlFor="fu-action">
            <Input
              id="fu-action"
              placeholder="e.g. Recheck stool at PM inspection"
              aria-invalid={Boolean(errors.action)}
              {...form.register("action")}
            />
          </Field>
          <Field label="Due" required error={errors.dueAt?.message} htmlFor="fu-due">
            <Controller
              control={form.control}
              name="dueAt"
              render={({ field }) => (
                <DateTimePicker
                  id="fu-due"
                  ariaLabel="Due"
                  value={field.value}
                  onChange={field.onChange}
                  min={todayISO()}
                  invalid={Boolean(errors.dueAt)}
                />
              )}
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={mutation.isPending}>
            Assign follow-up
          </Button>
          <p className="text-center text-xs text-muted-foreground">Assignee is notified by push and email · change is audited</p>
        </form>
      ) : (
        <p className="rounded-xl border border-border bg-subtle px-4 py-3 text-sm text-muted-foreground">
          Your role can view this animal but can’t assign follow-ups.
        </p>
      )}
    </div>
  )
}
