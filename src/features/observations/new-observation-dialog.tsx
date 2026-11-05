"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Camera, CircleCheck, Film, ImageIcon, Loader2, Paperclip, Sparkles, TriangleAlert, X } from "lucide-react"

import { Field, FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { errorMessage } from "@/lib/errors"
import { percent } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { createObservation, type ObservationResult } from "@/services/observations"

import { AiConfirmation } from "./ai-confirmation"
import { AnimalPicker } from "./animal-picker"

const MAX_IMAGE = 10 * 1024 * 1024
const MAX_VIDEO = 100 * 1024 * 1024

const schema = z.object({
  animalId: z.string().nullable(),
  text: z
    .string()
    .trim()
    .min(3, "Describe what you saw (at least 3 characters).")
    .max(1000, "Keep the description under 1,000 characters."),
})
type FormValues = z.infer<typeof schema>

interface Attachment {
  id: string
  kind: "photo" | "video"
  caption: string
}

interface NewObservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultAnimalId?: string | null
}

/** New Health Observation (FE-010) → AI processing → AI Confirmation (FE-012). */
export function NewObservationDialog({ open, onOpenChange, defaultAnimalId = null }: NewObservationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto rounded-2xl p-0 sm:max-w-[600px]">
        {open ? (
          <ObservationFlow key={defaultAnimalId ?? "none"} defaultAnimalId={defaultAnimalId} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ObservationFlow({ defaultAnimalId, onClose }: { defaultAnimalId: string | null; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [result, setResult] = useState<ObservationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { animalId: defaultAnimalId, text: "" } })
  const animalId = useWatch({ control: form.control, name: "animalId" })

  const create = useServiceMutation(
    (v: FormValues) =>
      createObservation({ text: v.text, animalId: v.animalId, media: attachments.map(({ kind, caption }) => ({ kind, caption })) }),
    {
      silentError: true,
      onSuccess: (r) => setResult(r),
      onError: (e) => setError(errorMessage(e)),
    }
  )

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const next: Attachment[] = []
    const errors: string[] = []
    for (const f of Array.from(files)) {
      const video = f.type.startsWith("video/")
      const image = f.type.startsWith("image/")
      if (!video && !image) errors.push(`${f.name}: only photos and videos are accepted`)
      else if (image && f.size > MAX_IMAGE) errors.push(`${f.name}: images must be 10 MB or less`)
      else if (video && f.size > MAX_VIDEO) errors.push(`${f.name}: videos must be 100 MB or less`)
      else next.push({ id: `${f.name}-${f.size}-${f.lastModified}`, kind: video ? "video" : "photo", caption: f.name })
    }
    setAttachments((list) => [...list, ...next.filter((n) => !list.some((x) => x.id === n.id))].slice(0, 8))
    setFileError(errors.length ? errors.join(" · ") : null)
    if (fileRef.current) fileRef.current.value = ""
  }

  // --- Result views -------------------------------------------------------
  if (result) {
    const o = result.observation
    const header = (
      <DialogHeader className="border-b border-border px-6 pt-6 pb-4 text-left">
        <DialogTitle className="text-lg">Observation {o.id}</DialogTitle>
        <DialogDescription>“{o.text}”</DialogDescription>
      </DialogHeader>
    )
    if (o.aiStatus === "awaiting_confirmation" && result.canConfirm) {
      return (
        <>
          {header}
          <div className="px-6 py-5">
            <AiConfirmation observation={o} onDone={onClose} />
          </div>
        </>
      )
    }
    const review = o.aiStatus === "needs_review"
    return (
      <>
        {header}
        <div className="space-y-4 px-6 py-6">
          {review ? (
            <div className="flex gap-3 rounded-xl border border-warning-border bg-warning-soft p-4 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Review required</p>
                <p className="mt-0.5">
                  {o.ai?.reviewReason === "low_confidence"
                    ? `The AI's best match scored ${percent(o.ai.confidence)}, below the confidence threshold.`
                    : "The AI couldn't match this observation to an animal."}{" "}
                  It has been saved and placed in the review queue for an officer to route manually.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 rounded-xl border border-success-border bg-success-tile p-4 text-sm text-success">
              <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Sent for AI routing — an officer will confirm</p>
                <p className="mt-0.5 text-foreground/80">
                  The observation is saved. An officer confirms the AI suggestion before it reaches a case.
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            {review ? (
              <Button variant="outline" asChild>
                <Link href={`/review?id=${o.id}`} onClick={onClose}>
                  Open review queue
                </Link>
              </Button>
            ) : null}
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </>
    )
  }

  if (create.isPending) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="status" aria-live="polite">
        <span className="inline-flex size-12 items-center justify-center rounded-xl bg-ai-soft text-ai">
          <Sparkles className="size-6 animate-pulse" aria-hidden />
        </span>
        <p className="text-base font-semibold">AI is analysing…</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Matching the animal, extracting clinical signs and suggesting a routing. The observation is already saved.
        </p>
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }

  // --- Form -----------------------------------------------------------------
  return (
    <form
      onSubmit={form.handleSubmit((v) => {
        setError(null)
        create.mutate(v)
      })}
      noValidate
    >
      <DialogHeader className="border-b border-border px-6 pt-6 pb-4 text-left">
        <DialogTitle className="text-lg">New health observation</DialogTitle>
        <DialogDescription>Describe what you saw. AI suggests the animal and routing; an officer confirms.</DialogDescription>
      </DialogHeader>
      <div className="space-y-5 px-6 py-5">
        <Field label="Animal" hint={animalId ? undefined : "Optional — leave empty to let the AI match the animal from your description."}>
          <AnimalPicker value={animalId} onChange={(id) => form.setValue("animalId", id)} />
        </Field>
        <Field label="What did you see?" htmlFor="obs-text" required error={form.formState.errors.text?.message}>
          <Textarea
            id="obs-text"
            rows={4}
            placeholder="e.g. KC2-2 Yang Yang soft stool again, ate about half of lunch."
            aria-invalid={Boolean(form.formState.errors.text)}
            {...form.register("text")}
          />
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-semibold">Photos & videos</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="sr-only"
            id="obs-files"
            onChange={(e) => addFiles(e.target.files)}
          />
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-subtle px-2.5 py-1.5 text-xs"
              >
                {a.kind === "video" ? <Film className="size-3.5" /> : <ImageIcon className="size-3.5" />}
                <span className="max-w-[180px] truncate">{a.caption}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((l) => l.filter((x) => x.id !== a.id))}
                  aria-label={`Remove ${a.caption}`}
                  className="rounded p-0.5 hover:bg-border"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Paperclip /> Attach
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="sm:hidden">
              <Camera /> Camera
            </Button>
          </div>
          {fileError ? (
            <p className="text-[13px] text-destructive">{fileError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Images up to 10 MB, videos up to 100 MB. Submission also works with text alone.</p>
          )}
        </div>
        <FormError message={error} />
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">
          <Sparkles /> Submit for AI assistance
        </Button>
      </div>
    </form>
  )
}
