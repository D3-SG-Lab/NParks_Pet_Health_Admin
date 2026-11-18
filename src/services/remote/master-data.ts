/**
 * Master data on the real API: pet species (list / create / active status) and
 * kennels (read only). Kennel blocks are derived from the kennels' `block`.
 * Templates, taxonomy, glossary and notification rules have no endpoint.
 */
import { ApiError, isApiError } from "@/lib/errors"
import type { Species } from "@/types/domain"

import { animalsApi, masterDataApi, referenceApi } from "../api/api-client"
import type { AnimalStayDto } from "../api/types"
import type { BlockSummary, KennelRow, SpeciesRow } from "../master-data"
import { blocksOf, numericId, STAYING_STATUS, toAnimal, toKennel } from "./mappers"

/** Occupancy comes from `GET /animals`; if the account can't read stays (403), it is left out. */
async function stayingAnimals(): Promise<AnimalStayDto[] | null> {
  try {
    return await animalsApi.list({ status: STAYING_STATUS })
  } catch (e) {
    if (isApiError(e) && (e.status === 403 || e.status === 401)) return null
    throw e
  }
}

const OCCUPANCY_NOTICE = "Kennel occupancy isn’t shown: this account can’t read animal stays."

export async function listKennelBlocks(): Promise<BlockSummary[] & { notices?: string[] }> {
  const [kennels, staying] = await Promise.all([referenceApi.kennels(), stayingAnimals()])
  const occupied = new Set((staying ?? []).map((s) => s.kennelId))
  const result: BlockSummary[] & { notices?: string[] } = blocksOf(kennels).map((block) => {
    const list = kennels.filter((k) => k.block === block.code).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    const occupancy = list.map(
      (k) => (occupied.has(k.id) ? "in_use" : k.isActive ? "vacant" : "unavailable") as BlockSummary["occupancy"][number]
    )
    return { block, kennels: list.length, inUse: occupancy.filter((o) => o === "in_use").length, occupancy }
  })
  result.notices = staying ? [] : [OCCUPANCY_NOTICE]
  return result
}

export async function listKennels(
  blockCode: string
): Promise<{ rows: KennelRow[]; contractors: { name: string; disabled: boolean }[]; notices: string[] }> {
  const [kennels, staying] = await Promise.all([referenceApi.kennels(), stayingAnimals()])
  const byKennel = new Map((staying ?? []).map((s) => [s.kennelId, s]))
  const rows = kennels
    .filter((k) => k.block === blockCode)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((k) => {
      const stay = byKennel.get(k.id)
      return { kennel: toKennel(k), occupant: stay ? toAnimal(stay) : null, contractorScope: [] as string[] }
    })
  // Contractor kennel scopes are not available from the API.
  return { rows, contractors: [], notices: staying ? [] : [OCCUPANCY_NOTICE] }
}

function toSpecies(dto: { id: number; name: string; isActive: boolean }): Species {
  return {
    id: String(dto.id),
    name: dto.name,
    description: "",
    checklistTemplateId: "",
    defaultStayDays: 0,
    kennelTypes: [],
    enabled: dto.isActive,
  }
}

export async function listSpecies(): Promise<SpeciesRow[]> {
  const list = await masterDataApi.listSpecies()
  return list
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((dto) => ({ species: toSpecies(dto), templateName: "—", templateVersion: null, activeAnimals: 0 }))
}

/** `POST /master-data/species` takes only a name; there is no update endpoint. */
export async function createSpecies(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new ApiError("VALIDATION", "Enter the species name.", "name")
  try {
    await masterDataApi.createSpecies(trimmed)
  } catch (e) {
    if (isApiError(e) && e.status === 409) throw new ApiError("CONFLICT", e.message, "name", 409)
    throw e
  }
}

export async function setSpeciesEnabled(id: string, enabled: boolean): Promise<void> {
  await masterDataApi.updateSpeciesStatus(numericId(id, "species"), enabled)
}
