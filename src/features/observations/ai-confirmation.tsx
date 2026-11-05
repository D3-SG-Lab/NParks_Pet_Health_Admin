"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ImageIcon, PencilLine, Sparkles, X } from "lucide-react"

import { AnimalAvatar } from "@/components/common/avatars"
import { StatusChip, KennelCode } from "@/components/common/status-chip"
import { FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { percent } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { errorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { getAnimal } from "@/services/animals"
import { ROUTING_LABEL, caseOptionsForAnimal, confirmRouting } from "@/services/observations"
import type { ExtractedSign, Observation, RoutingAction } from "@/types/domain"

import { AnimalPicker } from "./animal-picker"

const ACTIONS: RoutingAction[] = ["timeline", "update_case", "new_case", "reopen_case"]

/** AI Confirmation (FE-012): matched animal, extracted signs, evidence and routing suggestion. */
export function AiConfirmation({ observation, onDone }: { observation: Observation; onDone: () => void }) {
  const router = useRouter()
  const ai = observation.ai
  const [mode, setMode] = useState<"review" | "correct">("review")
  const [animalId, setAnimalId] = useState<string | null>(ai?.matchedAnimalId ?? null)
  const [action, setAction] = useState<RoutingAction>(ai?.suggestedAction ?? "timeline")
  const [caseId, setCaseId] = useState<string | null>(ai?.suggestedCaseId ?? null)
  const [signs, setSigns] = useState<ExtractedSign[]>(ai?.signs ?? [])
  const [error, setError] = useState<string | null>(null)

  const animalQ = useQuery({ queryKey: ["animal", animalId], queryFn: () => getAnimal(animalId as string), enabled: Boolean(animalId) })
  const casesQ = useQuery({
    queryKey: ["case-options", animalId],
    queryFn: () => caseOptionsForAnimal(animalId as string),
    enabled: Boolean(animalId),
  })
  const open = casesQ.data?.open ?? []
  const reopenable = casesQ.data?.reopenable ?? []

  const confirm = useServiceMutation(
    () =>
      confirmRouting(observation.id, {
        animalId: animalId as string,
        action,
        caseId: action === "update_case" || action === "reopen_case" ? caseId : null,
        signs,
      }),
    {
      silentError: true,
      success: (r) => (r.caseId ? `${observation.id} routed · case ${r.caseId}` : `${observation.id} added to the 30-day timeline`),
      successAction: (r) => (r.caseId ? { label: "View case", onClick: () => router.push(`/cases?id=${r.caseId}`) } : undefined),
      onSuccess: () => onDone(),
      onError: (e) => setError(errorMessage(e)),
    }
  )

  const chooseAnimal = (id: string | null) => {
    setAnimalId(id)
    setCaseId(null)
    setAction(signs.length ? "new_case" : "timeline")
  }
  const chooseAction = (a: RoutingAction) => {
    setAction(a)
    if (a === "update_case") setCaseId(open[0]?.id ?? null)
    else if (a === "reopen_case") setCaseId(reopenable[0]?.id ?? null)
    else setCaseId(null)
  }

  const available = (a: RoutingAction) => (a === "update_case" ? open.length > 0 : a === "reopen_case" ? reopenable.length > 0 : true)
  const needsCase = action === "update_case" || action === "reopen_case"
  const canConfirm = Boolean(animalId) && (!needsCase || Boolean(caseId))
  const confidence = ai?.confidence ?? 0
  const animal = animalQ.data?.row

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-ai-border bg-ai-soft p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ai">
            <Sparkles className="size-4" aria-hidden /> AI analysis
          </p>
          <span className="text-xs text-muted-foreground">
            prompt {ai?.promptVersion} · {ai?.latencySec} s
          </span>
        </div>
        <p className="mt-1 text-xs text-ai/80">{ai?.rationale}</p>
      </div>

      {mode === "correct" ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">
            Animal<span className="text-destructive">*</span>
          </p>
          <AnimalPicker value={animalId} onChange={chooseAnimal} />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-primary bg-selected p-3">
          {animal ? (
            <>
              <AnimalAvatar name={animal.animal.name} speciesId={animal.animal.speciesId} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <KennelCode code={animal.animal.kennelCode} /> {animal.animal.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {animal.speciesName} · {animal.animal.sex} · Day {animal.stay.day} of {animal.stay.total}
                </p>
              </div>
            </>
          ) : (
            <p className="flex-1 text-sm text-muted-foreground">{animalQ.isPending ? "Loading animal…" : "No animal selected"}</p>
          )}
          <span className="text-right">
            <span className={cn("block text-sm font-semibold tabular-nums", confidence >= 0.8 ? "text-success" : "text-warning")}>
              {percent(confidence)}
            </span>
            <span className="block text-[11px] text-muted-foreground">confidence</span>
          </span>
        </div>
      )}

      <div className="space-y-2">
        <p className="eyebrow">Extracted signs</p>
        {signs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clinical signs extracted.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {signs.map((s) => (
              <StatusChip key={s.code} tone="abnormal">
                {s.label}
                {mode === "correct" ? (
                  <button
                    type="button"
                    onClick={() => setSigns((list) => list.filter((x) => x.code !== s.code))}
                    aria-label={`Remove ${s.label}`}
                    className="-mr-1 rounded-full p-0.5 hover:bg-abnormal/10"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </StatusChip>
            ))}
          </div>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="size-3.5" aria-hidden /> {observation.media.length} evidence item{observation.media.length === 1 ? "" : "s"}{" "}
          linked
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">
          Routing{mode === "review" ? " suggestion" : ""}
          <span className="text-destructive">*</span>
        </legend>
        {mode === "review" ? (
          <div className="rounded-xl border border-border bg-subtle px-4 py-3 text-sm">
            <span className="font-semibold">{ROUTING_LABEL[action]}</span>
            {caseId ? <span className="font-mono"> · {caseId}</span> : null}
            <span className="block text-xs text-muted-foreground">
              Add to the 30-day timeline{action === "timeline" ? " only" : " and route to the case"}.
            </span>
          </div>
        ) : (
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            {ACTIONS.map((a) => {
              const enabled = Boolean(animalId) && available(a)
              return (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={action === a}
                  disabled={!enabled}
                  onClick={() => chooseAction(a)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50",
                    action === a
                      ? "border-primary bg-selected shadow-[0_0_0_1px_var(--primary)]"
                      : "border-border hover:border-border-strong"
                  )}
                >
                  <span className="block font-semibold">{ROUTING_LABEL[a]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {a === "update_case"
                      ? open.length
                        ? `${open.length} open`
                        : "None open for this animal"
                      : a === "reopen_case"
                        ? reopenable.length
                          ? "Closed within 14 days"
                          : "None closed recently"
                        : a === "new_case"
                          ? "Opens a new health case"
                          : "Record on the timeline, no case"}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {mode === "correct" && needsCase ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {(action === "update_case" ? open : reopenable).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCaseId(c.id)}
                aria-pressed={caseId === c.id}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-left text-xs",
                  caseId === c.id ? "border-primary bg-selected" : "border-border"
                )}
              >
                <span className="font-mono font-semibold">{c.id}</span> · {c.title}
              </button>
            ))}
          </div>
        ) : null}
      </fieldset>

      <FormError message={error} />

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" asChild>
          <Link href={`/review?id=${observation.id}`} onClick={onDone}>
            Leave for review queue
          </Link>
        </Button>
        {mode === "review" ? (
          <Button variant="outline" onClick={() => setMode("correct")}>
            <PencilLine /> Correct
          </Button>
        ) : null}
        <Button onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={!canConfirm}>
          Confirm & route
        </Button>
      </div>
    </div>
  )
}
