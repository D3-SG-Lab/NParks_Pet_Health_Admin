/** Lookup data for pickers and filters (species, kennels, users, signs). */
import type { BodySystem, ChecklistTemplate, Kennel, KennelBlock, Sign, Species, User } from "@/types/domain"

import { canSeeKennel, clone, currentUser, delay, getDb } from "./core"

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
  return clone({
    species: db.species,
    blocks: db.kennelBlocks.filter((b) => user.role !== "contractor" || user.kennelScope.includes(b.code)),
    kennels: db.kennels.filter((k) => canSeeKennel(user, k.code)),
    users: db.users.map(({ id, name, role, idp, status, kennelScope }) => ({ id, name, role, idp, status, kennelScope })),
    bodySystems: db.bodySystems,
    signs: db.signs,
    templates: db.templates.map(({ id, name, kind }) => ({ id, name, kind })),
    settings: db.settings,
  })
}
