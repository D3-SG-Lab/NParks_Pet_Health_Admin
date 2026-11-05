"use client"

import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Clock3 } from "lucide-react"

import { Segmented } from "@/components/common/filters"
import { KennelCode } from "@/components/common/status-chip"
import { Field, FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useUser } from "@/hooks/use-session"
import { errorMessage } from "@/lib/errors"
import { useServiceMutation } from "@/lib/query"
import { recordDose, type DueRow } from "@/services/medication"

const schema = z.object({
  doseTime: z.string().min(1, "Pick the dose."),
  remarks: z.string().max(200, "Keep remarks under 200 characters."),
})
type Values = z.infer<typeof schema>

function DoseForm({ row, onClose }: { row: DueRow; onClose: () => void }) {
  const user = useUser()
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { doseTime: row.pendingTime ?? row.pendingTimes[0] ?? "", remarks: "" },
  })
  const save = useServiceMutation((v: Values) => recordDose(row.schedule.id, v.doseTime, v.remarks), {
    silentError: true,
    success: (adm) => `${row.schedule.item} ${row.schedule.dose} recorded for ${row.animal.name} at ${adm.at.slice(11, 16)}`,
    onSuccess: onClose,
  })
  const s = row.schedule
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
      <div className="rounded-xl border border-border bg-subtle px-4 py-3 text-sm">
        <p className="font-semibold">
          {s.item} · {s.dose}
          {s.site ? ` · ${s.site}` : ""}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {s.route} · {row.frequency}
        </p>
      </div>
      <Controller
        control={control}
        name="doseTime"
        render={({ field, fieldState }) => (
          <Field label="Dose" required error={fieldState.error?.message}>
            {row.pendingTimes.length > 1 ? (
              <Segmented
                ariaLabel="Dose time"
                value={field.value}
                onChange={field.onChange}
                options={row.pendingTimes.map((t) => ({ value: t, label: <span className="font-mono">{t}</span> }))}
              />
            ) : (
              <p className="font-mono text-sm font-semibold">{field.value} dose</p>
            )}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="remarks"
        render={({ field, fieldState }) => (
          <Field
            label="Remarks"
            htmlFor="dose-remarks"
            error={fieldState.error?.message}
            hint="Optional — e.g. took with food, partial dose"
          >
            <Textarea id="dose-remarks" {...field} placeholder="Optional" className="min-h-16" />
          </Field>
        )}
      />
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock3 className="size-3.5" aria-hidden /> Time and officer are captured automatically · {user.name}
      </p>
      {save.error ? <FormError message={errorMessage(save.error)} /> : null}
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Record dose
        </Button>
      </DialogFooter>
    </form>
  )
}

export function RecordDoseDialog({ row, onClose }: { row: DueRow | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-5 rounded-2xl p-6 sm:max-w-[460px]">
        {row ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="text-lg font-semibold">Record dose · {row.animal.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                <KennelCode code={row.animal.kennelCode} /> Double-recording the same dose is blocked.
              </DialogDescription>
            </DialogHeader>
            <DoseForm key={row.schedule.id} row={row} onClose={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
