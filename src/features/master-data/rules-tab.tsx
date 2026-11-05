"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, ShieldPlus } from "lucide-react"
import { Controller, useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { StatusChip } from "@/components/common/status-chip"
import { EmptyState, PanelSkeleton, QueryError } from "@/components/common/states"
import { Panel, PanelHeader } from "@/components/common/surfaces"
import { Field, FormError } from "@/components/forms/field"
import { Table, TableScroll, TableSkeletonRows, Td, Th, THead, Tr } from "@/components/tables/data-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { APP_CONFIG } from "@/config/app"
import { errorMessage } from "@/lib/errors"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import {
  RULE_PLACEHOLDERS,
  listNotificationRules,
  renderRulePreview,
  saveNotificationRule,
  sendTestNotification,
  setRuleEnabled,
  type NotificationRuleInput,
} from "@/services/master-data"
import type { NotificationEvent, NotificationRule } from "@/types/domain"

import type { FrameRenderer } from "./master-data-screen"
import { applyApiError } from "./shared"

const EVENT_LABEL: Record<NotificationEvent, string> = {
  case_created: "New case created",
  case_reopened: "Case reopened",
  case_assigned: "Case assigned to you",
  follow_up_overdue: "Follow-up overdue",
  checks_due: "Checks due",
  observation_needs_review: "Observation needs review",
  daily_digest: "Daily digest",
}
const ESCALATE_TO = ["Supervisors (all kennels)", "Supervisors (same kennel block)", "Vets"]

function ChannelChip({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold",
        on ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground line-through"
      )}
    >
      {label}
    </span>
  )
}

export function RulesTab({ frame }: { frame: FrameRenderer }) {
  const q = useQuery({ queryKey: ["master", "rules"], queryFn: listNotificationRules })
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null)
  const toggle = useServiceMutation(({ id, enabled }: { id: string; enabled: boolean }) => setRuleEnabled(id, enabled), {
    success: (_, v) => (v.enabled ? "Rule turned on" : "Rule turned off"),
  })

  const actions = (
    <Button onClick={() => setSelectedId("new")}>
      <Plus /> Add rule
    </Button>
  )
  if (q.error) return frame(actions, <QueryError error={q.error} onRetry={() => q.refetch()} />)

  const rules = q.data ?? []
  const effectiveId = selectedId ?? rules.find((r) => r.event === "follow_up_overdue")?.id ?? rules[0]?.id ?? null
  const selected = effectiveId === "new" ? null : (rules.find((r) => r.id === effectiveId) ?? null)

  const body = (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <Panel className="min-w-0 self-start overflow-hidden">
        <PanelHeader
          title="Rules"
          actions={<span className="text-xs text-muted-foreground">Users only receive notifications for their role and kennel scope</span>}
        />
        <TableScroll>
          <Table className="min-w-[720px]">
            <THead>
              <tr>
                <Th>Event</Th>
                <Th>Recipients</Th>
                <Th>Channels</Th>
                <Th>Timing</Th>
                <Th align="center">On</Th>
              </tr>
            </THead>
            <tbody>
              {q.isPending ? (
                <TableSkeletonRows rows={6} cols={5} />
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState title="No notification rules" icon="search" />
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <Tr
                    key={r.id}
                    selected={r.id === effectiveId}
                    onClick={() => setSelectedId(r.id)}
                    className={cn(!r.enabled && "text-muted-foreground")}
                  >
                    <Td>
                      <button
                        type="button"
                        className={cn(
                          "text-left font-semibold hover:underline focus-visible:underline focus-visible:outline-none",
                          r.enabled ? "text-foreground" : "text-muted-foreground"
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedId(r.id)
                        }}
                      >
                        {r.name}
                      </button>
                      {r.subtitle ? <p className="text-xs text-muted-foreground">{r.subtitle}</p> : null}
                    </Td>
                    <Td>{r.recipients}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <ChannelChip label="Push" on={r.channels.push} />
                        <ChannelChip label="Email" on={r.channels.email} />
                      </div>
                    </Td>
                    <Td className="max-w-[180px]">{r.timing}</Td>
                    <Td align="center">
                      <span onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={r.enabled}
                          aria-label={`${r.name} on`}
                          onCheckedChange={(c) => toggle.mutate({ id: r.id, enabled: c })}
                        />
                      </span>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        </TableScroll>
      </Panel>
      <Panel className="self-start">
        {q.isPending ? (
          <PanelSkeleton lines={8} />
        ) : effectiveId ? (
          <RuleEditor key={effectiveId} rule={selected} onSaved={(id) => setSelectedId(id)} onCancel={() => setSelectedId(null)} />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Select a rule to edit it.</p>
        )}
      </Panel>
    </div>
  )
  return frame(actions, body)
}

const schema = z
  .object({
    event: z.enum([
      "case_created",
      "case_reopened",
      "case_assigned",
      "follow_up_overdue",
      "checks_due",
      "observation_needs_review",
      "daily_digest",
    ]),
    name: z.string().trim().min(1, "Enter the rule name."),
    recipients: z.string().trim().min(1, "Enter the recipients."),
    timing: z.string().trim(),
    push: z.boolean(),
    email: z.boolean(),
    enabled: z.boolean(),
    escalateAfter: z.number({ message: "Escalate after must be at least 1." }).nullable(),
    escalateUnit: z.enum(["hours past due", "minutes past due"]),
    escalateTo: z.string(),
    template: z.string().trim().min(1, "Enter the message."),
  })
  .superRefine((v, ctx) => {
    if (!v.push && !v.email) ctx.addIssue({ code: "custom", path: ["push"], message: "Pick at least one channel." })
    if (v.event === "follow_up_overdue") {
      if (!v.escalateAfter || Number.isNaN(v.escalateAfter) || v.escalateAfter < 1)
        ctx.addIssue({ code: "custom", path: ["escalateAfter"], message: "Escalate after must be at least 1." })
      if (!v.escalateTo) ctx.addIssue({ code: "custom", path: ["escalateTo"], message: "Pick who to escalate to." })
    } else if (!v.timing) ctx.addIssue({ code: "custom", path: ["timing"], message: "Enter when it is sent." })
  })
type Values = z.infer<typeof schema>

function toInput(v: Values, rule: NotificationRule | null): NotificationRuleInput {
  const escalation = v.event === "follow_up_overdue"
  return {
    event: v.event,
    name: v.name.trim(),
    subtitle: escalation ? "Escalation" : (rule?.subtitle ?? null),
    recipients: v.recipients.trim(),
    channels: { push: v.push, email: v.email },
    timing:
      escalation && v.escalateAfter
        ? `${v.escalateAfter} ${v.escalateUnit === "minutes past due" ? "min" : "h"} after due`
        : v.timing.trim(),
    enabled: v.enabled,
    escalateAfter: escalation ? v.escalateAfter : null,
    escalateUnit: escalation ? v.escalateUnit : null,
    escalateTo: escalation ? v.escalateTo : null,
    template: v.template.trim(),
  }
}

function RuleEditor({ rule, onSaved, onCancel }: { rule: NotificationRule | null; onSaved: (id: string) => void; onCancel: () => void }) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: rule
      ? {
          event: rule.event,
          name: rule.name,
          recipients: rule.recipients,
          timing: rule.timing,
          push: rule.channels.push,
          email: rule.channels.email,
          enabled: rule.enabled,
          escalateAfter: rule.escalateAfter,
          escalateUnit: rule.escalateUnit ?? "hours past due",
          escalateTo: rule.escalateTo ?? "",
          template: rule.template,
        }
      : {
          event: "case_created",
          name: "",
          recipients: "",
          timing: "Immediately",
          push: true,
          email: false,
          enabled: true,
          escalateAfter: 2,
          escalateUnit: "hours past due",
          escalateTo: ESCALATE_TO[0],
          template: "{kennel} {pet}: {action}",
        },
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const qc = useQueryClient()
  const [event, name, template, enabled] = useWatch({ control: form.control, name: ["event", "name", "template", "enabled"] })
  const save = useServiceMutation((v: Values) => saveNotificationRule(rule?.id ?? null, toInput(v, rule)), {
    success: (_, v) => `${v.name} saved`,
    silentError: true,
    onSuccess: (id) => onSaved(id),
    onError: (e) => setFormError(applyApiError(form, e, ["name", "recipients", "escalateAfter", "escalateTo"])),
  })
  const errors = form.formState.errors
  const escalation = event === "follow_up_overdue"

  const sendTest = form.handleSubmit(async (v) => {
    setTesting(true)
    try {
      await sendTestNotification(toInput(v, rule))
      await qc.invalidateQueries({ queryKey: ["notifications"] })
      toast.success("Test notification sent to you")
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setTesting(false)
    }
  })

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((v) => {
        setFormError(null)
        save.mutate(v)
      })}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="truncate text-base font-semibold">{rule ? rule.name : "New rule"}</h2>
        <StatusChip tone={enabled ? "success" : "neutral"} dot={enabled} size="sm">
          {enabled ? "On" : "Off"}
        </StatusChip>
      </div>
      <div className="space-y-4 px-5 py-5">
        <FormError message={formError} />
        {!rule ? (
          <Field label="Event" required htmlFor="nr-event">
            <Controller
              control={form.control}
              name="event"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v)
                    if (!form.getValues("name")) form.setValue("name", EVENT_LABEL[v as NotificationEvent])
                  }}
                >
                  <SelectTrigger id="nr-event" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(EVENT_LABEL) as NotificationEvent[]).map((e) => (
                      <SelectItem key={e} value={e}>
                        {EVENT_LABEL[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        ) : null}
        <Field label="Rule name" required htmlFor="nr-name" error={errors.name?.message}>
          <Input id="nr-name" aria-invalid={Boolean(errors.name) || undefined} {...form.register("name")} />
        </Field>
        {escalation ? (
          <>
            <Field label="Escalate after" required htmlFor="nr-after" error={errors.escalateAfter?.message}>
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                <Input
                  id="nr-after"
                  type="number"
                  min={1}
                  aria-invalid={Boolean(errors.escalateAfter) || undefined}
                  {...form.register("escalateAfter", { valueAsNumber: true })}
                />
                <Controller
                  control={form.control}
                  name="escalateUnit"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-label="Escalation unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours past due">hours past due</SelectItem>
                        <SelectItem value="minutes past due">minutes past due</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </Field>
            <Field label="Escalate to" required htmlFor="nr-to" error={errors.escalateTo?.message}>
              <Controller
                control={form.control}
                name="escalateTo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="nr-to" className="w-full">
                      <SelectValue placeholder="Pick recipients" />
                    </SelectTrigger>
                    <SelectContent>
                      {ESCALATE_TO.map((x) => (
                        <SelectItem key={x} value={x}>
                          {x}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="First notify" htmlFor="nr-recipients" error={errors.recipients?.message}>
              <Input id="nr-recipients" {...form.register("recipients")} />
            </Field>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Field label="Recipients" required htmlFor="nr-recipients" error={errors.recipients?.message}>
              <Input id="nr-recipients" aria-invalid={Boolean(errors.recipients) || undefined} {...form.register("recipients")} />
            </Field>
            <Field label="Timing" required htmlFor="nr-timing" error={errors.timing?.message}>
              <Input id="nr-timing" aria-invalid={Boolean(errors.timing) || undefined} {...form.register("timing")} />
            </Field>
          </div>
        )}
        <fieldset className="space-y-2.5">
          <legend className="mb-1 text-sm font-semibold">Channels</legend>
          <Controller
            control={form.control}
            name="push"
            render={({ field }) => (
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} /> Push (Notification Hubs)
              </label>
            )}
          />
          <Controller
            control={form.control}
            name="email"
            render={({ field }) => (
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} /> Email (Communication Services)
              </label>
            )}
          />
          {errors.push ? <p className="text-[13px] text-destructive">{errors.push.message}</p> : null}
        </fieldset>
        <Field
          label="Message"
          required
          htmlFor="nr-template"
          error={errors.template?.message}
          hint={`Placeholders: ${RULE_PLACEHOLDERS.join(", ")}`}
        >
          <Textarea id="nr-template" rows={2} {...form.register("template")} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold">Preview</p>
          <div className="flex gap-3 rounded-2xl border border-border bg-subtle p-3.5">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <ShieldPlus className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 text-sm">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{APP_CONFIG.name}</p>
              <p className="font-semibold">{name || "Rule"} · KC3-2 Teddy</p>
              <p className="text-muted-foreground">{renderRulePreview(template ?? "")}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Opens the case directly (deep link).</p>
        </div>
        <Controller
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <label className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-sm font-semibold">
              Rule is on
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        {!rule ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" variant="outline" loading={testing} onClick={sendTest}>
          Send test
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save rule
        </Button>
      </div>
    </form>
  )
}
