/**
 * Observations on the real API: media upload via `POST /media/presign` + PUT to
 * the presigned URL, then `POST /observations`, then `GET /observations/{id}`
 * until AI processing is `ready`. The API does not return the AI result
 * (match, signs, routing), the review queue or triage actions; those stay on
 * the mock data.
 */
import axios from "axios"

import { fromUtc, nowISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import type { Animal, Observation } from "@/types/domain"

import { animalsApi, mediaApi, observationsApi } from "../api/api-client"
import type { ObservationDto, ObservationMediaInput } from "../api/types"
import type { NewObservationInput, ObservationResult } from "../observations"
import { STAY_SPECIES, STAYING_STATUS, numericId, staffRef, toAnimal } from "./mappers"

const PRESIGN_BATCH = 5 // "Maximum 5 items per request."
const POLL_MS = 1_500
const POLL_TRIES = 6

export function toObservation(dto: ObservationDto): Observation {
  const at = fromUtc(dto.submittedAt) ?? dto.submittedAt
  const stay = dto.stayId ? String(dto.stayId) : null
  return {
    id: String(dto.id),
    text: dto.text,
    reportedAnimalId: stay,
    animalId: stay,
    createdAt: at,
    createdBy: staffRef(dto.submittedBy),
    source: "web",
    media: dto.media.map((m) => ({ id: `m-${m.id}`, kind: m.mediaKind, caption: m.mediaKey, at, byUserId: staffRef(dto.submittedBy) })),
    aiStatus: "processing",
    ai: null,
    routedAction: null,
    caseId: null,
    triagedBy: null,
    triagedAt: null,
    triageNote: null,
    skippedCount: 0,
  }
}

async function uploadMedia(files: { kind: "photo" | "video"; file: File }[]): Promise<ObservationMediaInput[]> {
  const out: ObservationMediaInput[] = []
  for (let i = 0; i < files.length; i += PRESIGN_BATCH) {
    const batch = files.slice(i, i + PRESIGN_BATCH)
    const { items } = await mediaApi.presign({
      items: batch.map((f) => ({
        mediaKind: f.kind,
        context: "observation",
        filename: f.file.name,
        contentType: f.file.type || "application/octet-stream",
      })),
    })
    await Promise.all(
      items.map(async (item, j) => {
        try {
          // Straight to object storage — no API token on this request.
          await axios.put(item.uploadUrl, batch[j].file, { headers: { "Content-Type": batch[j].file.type } })
        } catch {
          throw new ApiError("SERVER", `Uploading ${batch[j].file.name} failed. Remove it or try again.`)
        }
      })
    )
    items.forEach((item, j) => out.push({ mediaKind: batch[j].kind, mediaKey: item.mediaKey, durationSec: null, sortOrder: i + j }))
  }
  return out
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function createObservation(input: NewObservationInput): Promise<ObservationResult> {
  const text = input.text.trim()
  if (text.length < 3) throw new ApiError("VALIDATION", "Describe what you saw (at least 3 characters).", "text")
  const files = input.media.filter((m): m is typeof m & { file: File } => Boolean(m.file))
  const media = await uploadMedia(files.map((m) => ({ kind: m.kind, file: m.file })))
  let dto = await observationsApi.submit({
    stayId: input.animalId ? numericId(input.animalId, "animal") : null,
    text,
    media,
  })
  // AI processing runs on the server; wait briefly for it to finish.
  for (let i = 0; i < POLL_TRIES && dto.status === "processing"; i++) {
    await wait(POLL_MS)
    try {
      dto = await observationsApi.get(dto.id)
    } catch {
      break
    }
  }
  const status =
    dto.status === "processing"
      ? "Still processing on the server."
      : dto.aiUnavailable
        ? "Saved — AI analysis was unavailable."
        : `AI processing finished${dto.readyAt ? ` at ${(fromUtc(dto.readyAt) ?? nowISO()).slice(11, 16)}` : ""}.`
  return {
    observation: toObservation(dto),
    canConfirm: false,
    notice: `${status} The API doesn’t return the AI match or routing suggestion yet, so confirmation isn’t available here.`,
  }
}

export async function getObservation(id: string): Promise<Observation> {
  return toObservation(await observationsApi.get(numericId(id, "observation")))
}

export async function searchActiveAnimals(query: string): Promise<{ animal: Animal; speciesName: string }[]> {
  const q = query.trim()
  const rows = await animalsApi.list({ status: STAYING_STATUS, search: q || undefined })
  return rows
    .sort((a, b) => a.kennelCode.localeCompare(b.kennelCode, undefined, { numeric: true }))
    .slice(0, 8)
    .map((d) => {
      const animal = toAnimal(d)
      return { animal, speciesName: STAY_SPECIES.find((s) => s.id === animal.speciesId)?.name ?? d.species }
    })
}
