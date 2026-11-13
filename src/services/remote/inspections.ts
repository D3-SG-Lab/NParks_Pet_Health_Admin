/**
 * Daily inspections on the real API. The API lists inspections per animal stay
 * only, so the session board loads kennels + staying animals and then each
 * animal's inspections for the day. Recorded inspections can't be edited (no
 * update endpoint).
 */
import { SESSIONS } from "@/config/app"
import { todayISO } from "@/lib/clock"
import { ApiError, isApiError } from "@/lib/errors"
import { fmtTime } from "@/lib/format"
import type { Session } from "@/types/domain"

import { animalsApi, inspectionsApi, referenceApi } from "../api/api-client"
import type { DailyInspectionDto } from "../api/types"
import type { BoardBlock, BoardTile, InspectionForm, RecordInspectionInput, SessionBoard } from "../inspections"
import type { Inspection } from "@/types/domain"
import {
  API_TEMPLATE_NAME,
  API_TEMPLATE_VERSION,
  apiChecklistItems,
  blocksOf,
  checkFromInspections,
  numericId,
  staffLabel,
  toAnimal,
  toInspection,
  toInspectionRequest,
  toKennel,
  unknownCheck,
} from "./mappers"

export async function getSessionBoard(date: string, session: Session): Promise<SessionBoard & { notices: string[] }> {
  const [kennels, staying] = await Promise.all([referenceApi.kennels(), animalsApi.list({ status: "staying" })])
  const byKennel = new Map(staying.map((s) => [s.kennelId, s]))
  const loads = await Promise.allSettled(staying.map((s) => inspectionsApi.list(s.id, date)))
  const inspections = new Map<number, DailyInspectionDto[]>()
  let failed = 0
  loads.forEach((r, i) => {
    if (r.status === "fulfilled") inspections.set(staying[i].id, r.value)
    else failed++
  })

  const blocks: BoardBlock[] = []
  let completed = 0
  let expected = 0
  let stillDue = 0
  let abnormal = 0
  const overdueList: string[] = []
  for (const block of blocksOf(kennels)) {
    const tiles: BoardTile[] = kennels
      .filter((k) => k.block === block.code)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .map((k) => {
        const kennel = toKennel(k)
        const stay = byKennel.get(k.id)
        if (!stay || stay.arrivalDate > date) {
          return { kennel, animal: null, check: null, label: k.isActive ? "Vacant" : "Out of service", inspectorName: null }
        }
        const animal = toAnimal(stay)
        const dtos = inspections.get(stay.id)
        if (!dtos) return { kennel, animal, check: unknownCheck(session), label: "Couldn’t load", inspectorName: null }
        const insps = dtos.map((d) => toInspection(d, k.code))
        const check = checkFromInspections(animal, insps, date, session)
        const dto = dtos.find((d) => d.session === session)
        const insp = insps.find((i) => i.session === session)
        let label = "Due"
        if (check.state === "done") label = `${fmtTime(check.at!)} · normal`
        else if (check.state === "abnormal") {
          const abn = insp?.results.filter((r) => r.abnormal) ?? []
          label =
            abn.length === 1 && ["Stool", "Food"].includes(abn[0].label)
              ? `${fmtTime(check.at!)} · ${abn[0].label.toLowerCase()} ${abn[0].value.toLowerCase()}`
              : `${fmtTime(check.at!)} · ${check.abnormalCount} abnormal`
        } else if (check.state === "overdue") label = `Overdue · due ${SESSIONS[session].due}`
        return { kennel, animal, check, label, inspectorName: dto ? staffLabel(dto.recordedBy) : null }
      })
    const relevant = tiles.filter((t) => t.check && t.check.state !== "not_applicable")
    const done = relevant.filter((t) => t.check!.state === "done" || t.check!.state === "abnormal").length
    completed += done
    expected += relevant.length
    stillDue += relevant.filter((t) => t.check!.state === "due" || t.check!.state === "overdue").length
    abnormal += relevant.filter((t) => t.check!.state === "abnormal").length
    for (const t of relevant.filter((x) => x.check!.state === "overdue")) overdueList.push(`${t.kennel.code} ${t.animal!.name}`)
    // Contractor assignments per block are not available from the API.
    blocks.push({ block, tiles, done, expected: relevant.length, vacant: tiles.filter((t) => !t.animal).length, assignedTo: [] })
  }
  return {
    date,
    session,
    closes: SESSIONS[session].closes,
    blocks,
    totals: { completed, expected, stillDue, overdue: overdueList.length, overdueList, abnormal },
    notices: failed ? [`Inspections couldn’t be loaded for ${failed} animal${failed === 1 ? "" : "s"} (shown as “Couldn’t load”).`] : [],
  }
}

export async function getInspectionForm(animalId: string, date: string, session: Session): Promise<InspectionForm> {
  const stayId = numericId(animalId, "animal")
  const [stay, list] = await Promise.all([animalsApi.get(stayId), inspectionsApi.list(stayId, date)])
  const dto = list.find((d) => d.session === session)
  return {
    animal: toAnimal(stay),
    templateName: API_TEMPLATE_NAME,
    templateVersion: API_TEMPLATE_VERSION,
    items: apiChecklistItems(),
    existing: dto ? toInspection(dto, stay.kennelCode) : null,
    readOnlyReason: dto ? "Recorded inspections can’t be edited — the API has no update endpoint." : null,
  }
}

export async function recordInspection(
  input: RecordInspectionInput
): Promise<{ inspection: Inspection; observationId: string | null; edited: boolean }> {
  const stayId = numericId(input.animalId, "animal")
  if (input.date > todayISO()) throw new ApiError("VALIDATION", "Inspections can't be recorded for a future date.", "date")
  try {
    const dto = await inspectionsApi.submit(stayId, toInspectionRequest(input))
    const stay = await animalsApi.get(stayId).catch(() => null)
    // The API routes abnormal findings to AI itself and returns no observation id.
    return { inspection: toInspection(dto, stay?.kennelCode ?? ""), observationId: null, edited: false }
  } catch (e) {
    if (isApiError(e) && e.status === 409) throw new ApiError("CONFLICT", e.message, undefined, 409)
    throw e
  }
}
