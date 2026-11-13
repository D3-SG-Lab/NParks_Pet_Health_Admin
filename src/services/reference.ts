/** Lookup data for pickers and filters (species, kennels, users, signs). */
import { COUNTRIES } from "@/config/countries"
import type { BodySystem, ChecklistTemplate, Kennel, KennelBlock, Sign, Species, User } from "@/types/domain"

import { referenceApi } from "./api/api-client"
import { isApiMode } from "./api/config"
import { canSeeKennel, clone, currentUser, delay, getDb } from "./core"
import { STAY_SPECIES, blocksOf, toKennel } from "./remote/mappers"

export interface ReferenceData {
  species: Species[]
  blocks: KennelBlock[]
  kennels: Kennel[]
  users: Pick<User, "id" | "name" | "role" | "idp" | "status" | "kennelScope">[]
  bodySystems: BodySystem[]
  signs: Sign[]
  templates: Pick<ChecklistTemplate, "id" | "name" | "kind">[]
  settings: { aiConfidenceThreshold: number; promptVersion: string; taxonomyVersion: string; sessionIdleMinutes: number }
}

export async function getReferenceData(): Promise<ReferenceData> {
  await delay(60)
  const db = getDb()
  const user = currentUser(db)
  // API mode: species are the stay enum (Dog | Cat | Other) and kennels come from
  // `GET /kennels`; the API applies kennel scope itself. The rest stays local.
  const apiKennels = isApiMode() ? await referenceApi.kennels() : null
  return clone({
    species: apiKennels ? STAY_SPECIES : db.species,
    blocks: apiKennels
      ? blocksOf(apiKennels)
      : db.kennelBlocks.filter((b) => user.role !== "contractor" || user.kennelScope.includes(b.code)),
    kennels: apiKennels ? apiKennels.map(toKennel) : db.kennels.filter((k) => canSeeKennel(user, k.code)),
    users: db.users.map(({ id, name, role, idp, status, kennelScope }) => ({ id, name, role, idp, status, kennelScope })),
    bodySystems: db.bodySystems,
    signs: db.signs,
    templates: db.templates.map(({ id, name, kind }) => ({ id, name, kind })),
    settings: db.settings,
  })
}

/** Country of origin options. API mode: `GET /countries?isActive=true` (value = ISO code). */
export async function listCountries(): Promise<{ code: string; name: string }[]> {
  if (isApiMode()) {
    const list = await referenceApi.countries(true)
    return list.map(({ code, name }) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))
  }
  await delay(40)
  return COUNTRIES.map((name) => ({ code: name, name }))
}
