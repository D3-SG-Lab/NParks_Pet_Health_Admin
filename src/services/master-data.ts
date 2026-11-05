/**
 * Master data API (BE-008, FE-023): kennels & rooms, species, checklist
 * templates, symptom taxonomy, AQC glossary and notification rules.
 * "Editable without a deployment · every change is audited."
 */
import { addDays, nowISO, todayISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import type { Db } from "@/lib/mock/db"
import type {
  Animal,
  BodySystemId,
  ChecklistItem,
  ChecklistTemplate,
  GlossaryCategory,
  GlossaryTerm,
  Kennel,
  KennelBlock,
  KennelStatus,
  KennelType,
  NotificationRule,
  Sign,
  Species,
} from "@/types/domain"

import { appendAudit, clone, currentUser, delay, getDb, nextId, requirePermission, write } from "./core"

export const KENNEL_TYPES: KennelType[] = ["Cattery suite", "Dog run · small", "Dog run · medium", "Dog run · large", "Isolation room"]
export const KENNEL_STATUS_LABEL: Record<KennelStatus, string> = {
  in_service: "In service",
  cleaning: "Cleaning",
  out_of_service: "Out of service",
}
export const GLOSSARY_CATEGORIES: GlossaryCategory[] = ["Location", "Care", "Abbreviation", "Clinical"]

function admin(what: string) {
  return requirePermission("admin", { what })
}

function occupant(db: Db, code: string): Animal | undefined {
  return db.animals.find((a) => a.stayStatus !== "released" && a.kennelCode === code)
}

// ---------------------------------------------------------------------------
// Kennels & rooms
// ---------------------------------------------------------------------------

export interface BlockSummary {
  block: KennelBlock
  kennels: number
  inUse: number
  /** One entry per kennel for the occupancy bar. */
  occupancy: ("in_use" | "vacant" | "unavailable")[]
}

export interface KennelRow {
  kennel: Kennel
  occupant: Animal | null
  contractorScope: string[]
}

export async function listKennelBlocks(): Promise<BlockSummary[]> {
  await delay()
  admin("Master data")
  const db = getDb()
  return db.kennelBlocks.map((block) => {
    const kennels = db.kennels
      .filter((k) => k.blockCode === block.code)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    const occupancy = kennels.map(
      (k) => (occupant(db, k.code) ? "in_use" : k.status === "in_service" ? "vacant" : "unavailable") as BlockSummary["occupancy"][number]
    )
    return { block: clone(block), kennels: kennels.length, inUse: occupancy.filter((o) => o === "in_use").length, occupancy }
  })
}

export async function listKennels(blockCode: string): Promise<{ rows: KennelRow[]; contractors: { name: string; disabled: boolean }[] }> {
  await delay()
  admin("Master data")
  const db = getDb()
  const rows = db.kennels
    .filter((k) => k.blockCode === blockCode)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((k) => ({ kennel: clone(k), occupant: clone(occupant(db, k.code) ?? null), contractorScope: [] as string[] }))
  const contractors = db.users
    .filter((u) => u.role === "contractor" && u.kennelScope.includes(blockCode))
    .map((u) => ({ name: u.name, disabled: u.status === "disabled" }))
  return { rows, contractors }
}

export async function createBlock(input: { code: string; name: string; kind: KennelBlock["kind"] }): Promise<void> {
  await delay()
  const actor = admin("Add kennel block")
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z]{2,4}\d{0,2}$/.test(code)) throw new ApiError("VALIDATION", "Use 2–4 letters and an optional number, e.g. KC4.", "code")
  write((db) => {
    if (db.kennelBlocks.some((b) => b.code === code)) throw new ApiError("CONFLICT", `Block ${code} already exists.`, "code")
    const block = { code, name: input.name.trim() || `Kennel block ${code.replace(/\D/g, "")}`, kind: input.kind }
    db.kennelBlocks.push(block)
    appendAudit(db, actor, {
      action: "Kennel block created",
      entityType: "KennelBlock",
      entityId: code,
      entityLabel: block.name,
      after: block,
    })
  })
}

export interface KennelInput {
  code: string
  blockCode: string
  type: KennelType
  speciesAllowed: string[]
  status: KennelStatus
  availableFrom: string | null
}

function validateKennel(input: KennelInput) {
  if (!/^[A-Z]{2,4}\d{0,2}-\d{1,2}$/.test(input.code)) throw new ApiError("VALIDATION", "Code must look like KC2-7.", "code")
  if (!input.code.startsWith(`${input.blockCode}-`)) throw new ApiError("VALIDATION", `Code must start with ${input.blockCode}-.`, "code")
  if (input.speciesAllowed.length === 0) throw new ApiError("VALIDATION", "Allow at least one species.", "speciesAllowed")
  if (input.status === "cleaning" && !input.availableFrom)
    throw new ApiError("VALIDATION", "Set the date cleaning finishes.", "availableFrom")
}

export async function suggestKennelCode(blockCode: string): Promise<string> {
  const db = getDb()
  const nums = db.kennels.filter((k) => k.blockCode === blockCode).map((k) => Number(k.code.split("-")[1]))
  return `${blockCode}-${(nums.length ? Math.max(...nums) : 0) + 1}`
}

export async function createKennel(input: KennelInput): Promise<void> {
  await delay()
  const actor = admin("Add kennel")
  validateKennel(input)
  write((db) => {
    if (db.kennels.some((k) => k.code === input.code)) throw new ApiError("CONFLICT", `${input.code} already exists.`, "code")
    const kennel: Kennel = { ...input, availableFrom: input.status === "cleaning" ? input.availableFrom : null }
    db.kennels.push(kennel)
    appendAudit(db, actor, {
      action: "Kennel created",
      entityType: "Kennel",
      entityId: kennel.code,
      entityLabel: kennel.code,
      after: { type: kennel.type, species: kennel.speciesAllowed, status: KENNEL_STATUS_LABEL[kennel.status] },
    })
  })
}

export async function updateKennel(originalCode: string, input: KennelInput): Promise<void> {
  await delay()
  const actor = admin("Edit kennel")
  validateKennel(input)
  write((db) => {
    const k = db.kennels.find((x) => x.code === originalCode)
    if (!k) throw new ApiError("NOT_FOUND", "Kennel not found.")
    const occ = occupant(db, originalCode)
    if (occ && input.code !== originalCode) throw new ApiError("CONFLICT", "Code is locked while an animal is assigned.", "code")
    if (occ && input.status !== "in_service")
      throw new ApiError("CONFLICT", `${occ.name} is in this kennel — move or release the animal first.`, "status")
    if (occ && !input.speciesAllowed.includes(occ.speciesId))
      throw new ApiError("CONFLICT", `${occ.name}'s species must stay allowed while assigned.`, "speciesAllowed")
    if (input.code !== originalCode && db.kennels.some((x) => x.code === input.code))
      throw new ApiError("CONFLICT", `${input.code} already exists.`, "code")
    const before = { code: k.code, type: k.type, species: k.speciesAllowed, status: KENNEL_STATUS_LABEL[k.status] }
    Object.assign(k, { ...input, availableFrom: input.status === "cleaning" ? input.availableFrom : null })
    appendAudit(db, actor, {
      action: "Kennel updated",
      entityType: "Kennel",
      entityId: k.code,
      entityLabel: k.code,
      before,
      after: { code: k.code, type: k.type, species: k.speciesAllowed, status: KENNEL_STATUS_LABEL[k.status] },
    })
  })
}

/** CSV columns: code,type,species (semicolon separated ids),status */
export async function importKennels(rows: string[][]): Promise<{ created: number; updated: number; errors: string[] }> {
  await delay()
  const actor = admin("Import kennels")
  const errors: string[] = []
  let created = 0
  let updated = 0
  write((db) => {
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? []
    const body = header.includes("code") ? rows.slice(1) : rows
    const idx = (name: string, fallback: number) => (header.includes(name) ? header.indexOf(name) : fallback)
    for (const [i, r] of body.entries()) {
      const code = (r[idx("code", 0)] ?? "").trim().toUpperCase()
      const type = (r[idx("type", 1)] ?? "").trim() as KennelType
      const species = (r[idx("species", 2)] ?? "")
        .split(/[;|]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
      const statusRaw = (r[idx("status", 3)] ?? "in_service").trim().toLowerCase().replace(/\s+/g, "_")
      const status = (["in_service", "cleaning", "out_of_service"].includes(statusRaw) ? statusRaw : "in_service") as KennelStatus
      const blockCode = code.split("-")[0]
      if (!/^[A-Z]{2,4}\d{0,2}-\d{1,2}$/.test(code)) {
        errors.push(`Row ${i + 1}: invalid code “${code}”`)
        continue
      }
      if (!KENNEL_TYPES.includes(type)) {
        errors.push(`Row ${i + 1}: unknown type “${type}”`)
        continue
      }
      if (!db.kennelBlocks.some((b) => b.code === blockCode)) {
        errors.push(`Row ${i + 1}: block ${blockCode} doesn't exist`)
        continue
      }
      const validSpecies = species.filter((s) => db.species.some((x) => x.id === s))
      if (validSpecies.length === 0) {
        errors.push(`Row ${i + 1}: no valid species`)
        continue
      }
      const existing = db.kennels.find((k) => k.code === code)
      if (existing) {
        if (occupant(db, code) && status !== "in_service") {
          errors.push(`Row ${i + 1}: ${code} is occupied`)
          continue
        }
        Object.assign(existing, { type, speciesAllowed: validSpecies, status })
        updated++
      } else {
        db.kennels.push({
          code,
          blockCode,
          type,
          speciesAllowed: validSpecies,
          status,
          availableFrom: status === "cleaning" ? addDays(todayISO(), 1) : null,
        })
        created++
      }
    }
    appendAudit(db, actor, {
      action: "Kennels imported",
      entityType: "Kennel",
      entityId: "import",
      entityLabel: `CSV · ${created + updated} rows`,
      after: { created, updated, errors: errors.length },
    })
  })
  return { created, updated, errors }
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

export interface SpeciesRow {
  species: Species
  templateName: string
  templateVersion: number | null
  activeAnimals: number
}

export async function listSpecies(): Promise<SpeciesRow[]> {
  await delay()
  admin("Master data")
  const db = getDb()
  return db.species.map((s) => {
    const tpl = db.templates.find((t) => t.id === s.checklistTemplateId)
    const live = tpl?.versions.find((v) => v.status === "live")
    return {
      species: clone(s),
      templateName: tpl?.name ?? "—",
      templateVersion: live?.version ?? null,
      activeAnimals: db.animals.filter((a) => a.speciesId === s.id && a.stayStatus !== "released").length,
    }
  })
}

export type SpeciesInput = Omit<Species, "id">

export async function saveSpecies(id: string | null, input: SpeciesInput): Promise<void> {
  await delay()
  const actor = admin(id ? "Edit species" : "Add species")
  if (!input.name.trim()) throw new ApiError("VALIDATION", "Enter the species name.", "name")
  if (!(input.defaultStayDays >= 1 && input.defaultStayDays <= 180))
    throw new ApiError("VALIDATION", "Default stay must be 1–180 days.", "defaultStayDays")
  if (input.kennelTypes.length === 0) throw new ApiError("VALIDATION", "Pick at least one kennel type.", "kennelTypes")
  write((db) => {
    if (db.species.some((s) => s.name.toLowerCase() === input.name.trim().toLowerCase() && s.id !== id))
      throw new ApiError("CONFLICT", "A species with this name already exists.", "name")
    if (!db.templates.some((t) => t.id === input.checklistTemplateId))
      throw new ApiError("VALIDATION", "Pick an inspection checklist.", "checklistTemplateId")
    if (id) {
      const s = db.species.find((x) => x.id === id)
      if (!s) throw new ApiError("NOT_FOUND", "Species not found.")
      const before = clone(s)
      Object.assign(s, { ...input, name: input.name.trim(), description: input.description.trim() })
      appendAudit(db, actor, {
        action: "Species updated",
        entityType: "Species",
        entityId: s.id,
        entityLabel: s.name,
        before: { ...before },
        after: { ...s },
      })
    } else {
      const s: Species = {
        id: input.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-"),
        ...input,
        name: input.name.trim(),
        description: input.description.trim(),
      }
      db.species.push(s)
      appendAudit(db, actor, { action: "Species created", entityType: "Species", entityId: s.id, entityLabel: s.name, after: { ...s } })
    }
  })
}

export async function setSpeciesEnabled(id: string, enabled: boolean): Promise<void> {
  await delay(160)
  const actor = admin("Enable species")
  write((db) => {
    const s = db.species.find((x) => x.id === id)
    if (!s) throw new ApiError("NOT_FOUND", "Species not found.")
    s.enabled = enabled
    appendAudit(db, actor, {
      action: enabled ? "Species enabled" : "Species disabled",
      entityType: "Species",
      entityId: s.id,
      entityLabel: s.name,
      before: { enabled: !enabled },
      after: { enabled },
    })
  })
}

// ---------------------------------------------------------------------------
// Checklist templates — publishing applies to new inspections only (BE-008)
// ---------------------------------------------------------------------------

export interface TemplateListItem {
  template: ChecklistTemplate
  live: number | null
  liveSince: string | null
  draft: number | null
  draftUpdatedAt: string | null
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  await delay()
  admin("Master data")
  const db = getDb()
  return db.templates.map((t) => {
    const live = t.versions.find((v) => v.status === "live")
    const draft = t.versions.find((v) => v.status === "draft")
    return {
      template: clone(t),
      live: live?.version ?? null,
      liveSince: live?.publishedAt ?? null,
      draft: draft?.version ?? null,
      draftUpdatedAt: draft?.updatedAt ?? null,
    }
  })
}

function tplOr404(db: Db, id: string) {
  const t = db.templates.find((x) => x.id === id)
  if (!t) throw new ApiError("NOT_FOUND", "Template not found.")
  return t
}

export async function createTemplate(input: {
  name: string
  kind: ChecklistTemplate["kind"]
  appliesTo: string
  copyFrom: string | null
}): Promise<string> {
  await delay()
  const actor = admin("New checklist template")
  if (!input.name.trim()) throw new ApiError("VALIDATION", "Enter a template name.", "name")
  return write((db) => {
    if (db.templates.some((t) => t.name.toLowerCase() === input.name.trim().toLowerCase()))
      throw new ApiError("CONFLICT", "A template with this name already exists.", "name")
    const source = input.copyFrom ? db.templates.find((t) => t.id === input.copyFrom) : undefined
    const sourceItems = source?.versions.find((v) => v.status === "live")?.items ?? []
    const id = `tpl-${nextId(db, "id")}`
    const t: ChecklistTemplate = {
      id,
      name: input.name.trim(),
      kind: input.kind,
      appliesTo: input.appliesTo.trim() || "—",
      sessions: input.kind === "arrival" ? "On arrival" : "AM and PM sessions",
      versions: [
        {
          version: 1,
          status: "draft",
          items: clone(sourceItems).map((i) => ({ ...i, changeNote: null })),
          publishedAt: null,
          updatedAt: nowISO(),
        },
      ],
    }
    db.templates.push(t)
    appendAudit(db, actor, {
      action: "Checklist template created",
      entityType: "ChecklistTemplate",
      entityId: id,
      entityLabel: `${t.name} v1 draft`,
      after: { name: t.name, copiedFrom: source?.name ?? null },
    })
    return id
  })
}

export async function createDraft(id: string): Promise<void> {
  await delay()
  const actor = admin("Edit checklist template")
  write((db) => {
    const t = tplOr404(db, id)
    if (t.versions.some((v) => v.status === "draft")) throw new ApiError("CONFLICT", "A draft already exists.")
    const live = t.versions.find((v) => v.status === "live")
    const next = Math.max(...t.versions.map((v) => v.version)) + 1
    t.versions.push({
      version: next,
      status: "draft",
      items: clone(live?.items ?? []).map((i) => ({ ...i, changeNote: null })),
      publishedAt: null,
      updatedAt: nowISO(),
    })
    appendAudit(db, actor, {
      action: "Checklist draft created",
      entityType: "ChecklistTemplate",
      entityId: id,
      entityLabel: `${t.name} v${next} draft`,
      after: { basedOn: live?.version ?? null },
    })
  })
}

export function validateItems(items: ChecklistItem[]) {
  for (const i of items) {
    if (!i.label.trim()) throw new ApiError("VALIDATION", "Every item needs a label.", "items")
    if (i.input !== "free_text" && i.options.length < 2)
      throw new ApiError("VALIDATION", `“${i.label}” needs at least two options.`, "items")
    if (i.input !== "free_text" && i.defaultOption && !i.options.some((o) => o.label === i.defaultOption))
      throw new ApiError("VALIDATION", `“${i.label}” default must be one of its options.`, "items")
    if (i.input !== "free_text" && i.defaultOption && i.options.find((o) => o.label === i.defaultOption)?.abnormal)
      throw new ApiError("VALIDATION", `“${i.label}” default must be a normal option so healthy animals take a few taps.`, "items")
    if (new Set(i.options.map((o) => o.label.toLowerCase())).size !== i.options.length)
      throw new ApiError("VALIDATION", `“${i.label}” has duplicate options.`, "items")
  }
}

export async function saveDraftItems(id: string, items: ChecklistItem[]): Promise<void> {
  await delay(200)
  const actor = admin("Edit checklist template")
  validateItems(items)
  write((db) => {
    const t = tplOr404(db, id)
    const draft = t.versions.find((v) => v.status === "draft")
    if (!draft) throw new ApiError("CONFLICT", "Create a draft before editing.")
    const live = t.versions.find((v) => v.status === "live")
    // Mark what changed compared with the live version.
    draft.items = items.map((i) => {
      const liveItem = live?.items.find((x) => x.id === i.id)
      if (!liveItem) return { ...i, changeNote: "New item" }
      const added = i.options.filter((o) => !liveItem.options.some((x) => x.label === o.label)).map((o) => `“${o.label}”`)
      const removed = liveItem.options.filter((o) => !i.options.some((x) => x.label === o.label)).map((o) => `“${o.label}”`)
      const notes = [
        added.length ? `Added ${added.join(", ")}` : null,
        removed.length ? `Removed ${removed.join(", ")}` : null,
        liveItem.label !== i.label ? "Renamed" : null,
        liveItem.noteIfAbnormal !== i.noteIfAbnormal ? "Note rule changed" : null,
        liveItem.defaultOption !== i.defaultOption ? "Default changed" : null,
      ].filter(Boolean)
      return { ...i, changeNote: notes.length ? notes.join(" · ") : null }
    })
    draft.updatedAt = nowISO()
    appendAudit(db, actor, {
      action: "Checklist template edited",
      entityType: "ChecklistTemplate",
      entityId: id,
      entityLabel: `${t.name} v${draft.version} draft`,
      after: { items: draft.items.length, changed: draft.items.filter((i) => i.changeNote).map((i) => `${i.label}: ${i.changeNote}`) },
    })
  })
}

export async function discardDraft(id: string): Promise<void> {
  await delay()
  const actor = admin("Discard checklist draft")
  write((db) => {
    const t = tplOr404(db, id)
    const draft = t.versions.find((v) => v.status === "draft")
    if (!draft) throw new ApiError("CONFLICT", "There is no draft to discard.")
    if (!t.versions.some((v) => v.status !== "draft"))
      throw new ApiError("CONFLICT", "A template's only version can't be discarded — publish it first.")
    t.versions = t.versions.filter((v) => v !== draft)
    appendAudit(db, actor, {
      action: "Checklist draft discarded",
      entityType: "ChecklistTemplate",
      entityId: id,
      entityLabel: `${t.name} v${draft.version} draft`,
    })
  })
}

export async function publishDraft(id: string): Promise<number> {
  await delay()
  const actor = admin("Publish checklist template")
  return write((db) => {
    const t = tplOr404(db, id)
    const draft = t.versions.find((v) => v.status === "draft")
    if (!draft) throw new ApiError("CONFLICT", "There is no draft to publish.")
    validateItems(draft.items)
    if (draft.items.length === 0) throw new ApiError("VALIDATION", "Add at least one item before publishing.")
    const live = t.versions.find((v) => v.status === "live")
    if (live) live.status = "retired"
    draft.status = "live"
    draft.publishedAt = nowISO()
    draft.items = draft.items.map((i) => ({ ...i, changeNote: null }))
    appendAudit(db, actor, {
      action: "Checklist template published",
      entityType: "ChecklistTemplate",
      entityId: id,
      entityLabel: `${t.name} v${draft.version}`,
      before: { live: live?.version ?? null },
      after: { live: draft.version, note: "Applies to new inspections only" },
    })
    return draft.version
  })
}

// ---------------------------------------------------------------------------
// Symptom taxonomy (AI-003)
// ---------------------------------------------------------------------------

export interface SignRow {
  sign: Sign
  observations30d: number
}

function bumpTaxonomy(db: Db) {
  const [major, minor] = db.settings.taxonomyVersion.replace("v", "").split(".").map(Number)
  db.settings.taxonomyVersion = `v${major}.${minor + 1}`
}

export async function listTaxonomy(): Promise<{
  systems: { id: BodySystemId; name: string; count: number }[]
  signs: SignRow[]
  version: string
}> {
  await delay()
  admin("Master data")
  const db = getDb()
  const since = addDays(todayISO(), -30)
  const counts = new Map<string, number>()
  for (const o of db.observations) {
    if (o.createdAt.slice(0, 10) < since) continue
    for (const s of o.ai?.signs ?? []) counts.set(s.code, (counts.get(s.code) ?? 0) + 1)
  }
  for (const c of db.cases) {
    if (c.openedAt.slice(0, 10) < since) continue
    for (const code of c.signCodes) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  return {
    systems: db.bodySystems.map((b) => ({ id: b.id, name: b.name, count: db.signs.filter((s) => s.bodySystem === b.id).length })),
    signs: db.signs.map((s) => ({ sign: clone(s), observations30d: counts.get(s.code) ?? 0 })),
    version: db.settings.taxonomyVersion,
  }
}

export interface SignInput {
  bodySystem: BodySystemId
  name: string
  synonyms: string[]
  relatedWindowDays: number
  active: boolean
}

export async function saveSign(code: string | null, input: SignInput): Promise<string> {
  await delay()
  const actor = admin(code ? "Edit sign" : "Add sign")
  if (!input.name.trim()) throw new ApiError("VALIDATION", "Enter the sign name.", "name")
  if (!(input.relatedWindowDays >= 1 && input.relatedWindowDays <= 90))
    throw new ApiError("VALIDATION", "Related window must be 1–90 days.", "relatedWindowDays")
  return write((db) => {
    const synonyms = Array.from(new Set(input.synonyms.map((s) => s.trim().toLowerCase()).filter(Boolean)))
    if (
      db.signs.some((s) => s.name.toLowerCase() === input.name.trim().toLowerCase() && s.bodySystem === input.bodySystem && s.code !== code)
    )
      throw new ApiError("CONFLICT", "This sign already exists in the body system.", "name")
    if (code) {
      const s = db.signs.find((x) => x.code === code)
      if (!s) throw new ApiError("NOT_FOUND", "Sign not found.")
      const before = clone(s)
      Object.assign(s, { ...input, name: input.name.trim(), synonyms, bodySystem: s.bodySystem })
      bumpTaxonomy(db)
      appendAudit(db, actor, {
        action: "Symptom sign updated",
        entityType: "Sign",
        entityId: s.code,
        entityLabel: `${s.code} ${s.name}`,
        before: { ...before },
        after: { ...s, taxonomy: db.settings.taxonomyVersion },
      })
      return s.code
    }
    const prefix = db.bodySystems.find((b) => b.id === input.bodySystem)?.codePrefix ?? "XX"
    const nums = db.signs.filter((s) => s.code.startsWith(`${prefix}-`)).map((s) => Number(s.code.split("-")[1]))
    const newCode = `${prefix}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`
    const sign: Sign = { code: newCode, ...input, name: input.name.trim(), synonyms }
    db.signs.push(sign)
    bumpTaxonomy(db)
    appendAudit(db, actor, {
      action: "Symptom sign created",
      entityType: "Sign",
      entityId: newCode,
      entityLabel: `${newCode} ${sign.name}`,
      after: { ...sign, taxonomy: db.settings.taxonomyVersion },
    })
    return newCode
  })
}

export async function setSignActive(code: string, active: boolean): Promise<void> {
  await delay(160)
  const actor = admin("Edit sign")
  write((db) => {
    const s = db.signs.find((x) => x.code === code)
    if (!s) throw new ApiError("NOT_FOUND", "Sign not found.")
    s.active = active
    bumpTaxonomy(db)
    appendAudit(db, actor, {
      action: active ? "Symptom sign activated" : "Symptom sign deactivated",
      entityType: "Sign",
      entityId: code,
      entityLabel: `${code} ${s.name}`,
      before: { active: !active },
      after: { active, taxonomy: db.settings.taxonomyVersion },
    })
  })
}

// ---------------------------------------------------------------------------
// AQC glossary — picked up by the AI worker on its next run
// ---------------------------------------------------------------------------

export async function listGlossary(params: { search?: string; category?: GlossaryCategory | "all"; page?: number; pageSize?: number }) {
  await delay()
  admin("Master data")
  const db = getDb()
  const q = (params.search ?? "").trim().toLowerCase()
  const filtered = db.glossary
    .filter((g) => !params.category || params.category === "all" || g.category === params.category)
    .filter((g) => !q || g.term.toLowerCase().includes(q) || g.meaning.toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.term.localeCompare(b.term))
  const pageSize = params.pageSize ?? 7
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Math.max(1, params.page ?? 1), pages)
  return {
    terms: clone(filtered.slice((page - 1) * pageSize, page * pageSize)),
    total: filtered.length,
    totalAll: db.glossary.length,
    page,
    pages,
  }
}

export type GlossaryInput = Omit<GlossaryTerm, "id" | "updatedAt">

export async function saveGlossaryTerm(id: string | null, input: GlossaryInput): Promise<void> {
  await delay()
  const actor = admin(id ? "Edit glossary term" : "Add glossary term")
  if (!input.term.trim()) throw new ApiError("VALIDATION", "Enter the term.", "term")
  if (!input.meaning.trim()) throw new ApiError("VALIDATION", "Enter the meaning.", "meaning")
  write((db) => {
    if (db.glossary.some((g) => g.term.toLowerCase() === input.term.trim().toLowerCase() && g.id !== id))
      throw new ApiError("CONFLICT", "This term already exists.", "term")
    if (id) {
      const g = db.glossary.find((x) => x.id === id)
      if (!g) throw new ApiError("NOT_FOUND", "Term not found.")
      const before = { term: g.term, meaning: g.meaning, category: g.category, example: g.example }
      Object.assign(g, {
        term: input.term.trim(),
        meaning: input.meaning.trim(),
        category: input.category,
        example: input.example.trim(),
        updatedAt: nowISO(),
      })
      appendAudit(db, actor, {
        action: "Glossary term updated",
        entityType: "GlossaryTerm",
        entityId: g.id,
        entityLabel: g.term,
        before,
        after: { term: g.term, meaning: g.meaning, category: g.category, example: g.example },
      })
    } else {
      const g: GlossaryTerm = {
        id: `g-${nextId(db, "id")}`,
        term: input.term.trim(),
        meaning: input.meaning.trim(),
        category: input.category,
        example: input.example.trim(),
        updatedAt: nowISO(),
      }
      db.glossary.push(g)
      appendAudit(db, actor, {
        action: "Glossary term created",
        entityType: "GlossaryTerm",
        entityId: g.id,
        entityLabel: g.term,
        after: { term: g.term, meaning: g.meaning, category: g.category },
      })
    }
  })
}

export async function deleteGlossaryTerm(id: string): Promise<void> {
  await delay()
  const actor = admin("Delete glossary term")
  write((db) => {
    const g = db.glossary.find((x) => x.id === id)
    if (!g) throw new ApiError("NOT_FOUND", "Term not found.")
    db.glossary = db.glossary.filter((x) => x.id !== id)
    appendAudit(db, actor, {
      action: "Glossary term deleted",
      entityType: "GlossaryTerm",
      entityId: id,
      entityLabel: g.term,
      before: { term: g.term, meaning: g.meaning, category: g.category },
    })
  })
}

/** CSV columns: term,meaning,category,example */
export async function importGlossary(rows: string[][]): Promise<{ created: number; updated: number; errors: string[] }> {
  await delay()
  const actor = admin("Import glossary")
  const errors: string[] = []
  let created = 0
  let updated = 0
  write((db) => {
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? []
    const body = header.includes("term") ? rows.slice(1) : rows
    for (const [i, r] of body.entries()) {
      const [term = "", meaning = "", categoryRaw = "", example = ""] = r.map((c) => c.trim())
      const category = GLOSSARY_CATEGORIES.find((c) => c.toLowerCase() === categoryRaw.toLowerCase())
      if (!term || !meaning) {
        errors.push(`Row ${i + 1}: term and meaning are required`)
        continue
      }
      if (!category) {
        errors.push(`Row ${i + 1}: unknown category “${categoryRaw}”`)
        continue
      }
      const existing = db.glossary.find((g) => g.term.toLowerCase() === term.toLowerCase())
      if (existing) {
        Object.assign(existing, { meaning, category, example, updatedAt: nowISO() })
        updated++
      } else {
        db.glossary.push({ id: `g-${nextId(db, "id")}`, term, meaning, category, example, updatedAt: nowISO() })
        created++
      }
    }
    appendAudit(db, actor, {
      action: "Glossary imported",
      entityType: "GlossaryTerm",
      entityId: "import",
      entityLabel: `CSV · ${created + updated} rows`,
      after: { created, updated, errors: errors.length },
    })
  })
  return { created, updated, errors }
}

// ---------------------------------------------------------------------------
// Notification rules (BE-022, BE-025)
// ---------------------------------------------------------------------------

export async function listNotificationRules(): Promise<NotificationRule[]> {
  await delay()
  admin("Master data")
  return clone(getDb().notificationRules)
}

export type NotificationRuleInput = Omit<NotificationRule, "id">

export async function saveNotificationRule(id: string | null, input: NotificationRuleInput): Promise<string> {
  await delay()
  const actor = admin(id ? "Edit notification rule" : "Add notification rule")
  if (!input.name.trim()) throw new ApiError("VALIDATION", "Enter the rule name.", "name")
  if (!input.recipients.trim()) throw new ApiError("VALIDATION", "Enter the recipients.", "recipients")
  if (!input.channels.push && !input.channels.email) throw new ApiError("VALIDATION", "Pick at least one channel.", "channels")
  if (input.event === "follow_up_overdue") {
    if (!input.escalateAfter || input.escalateAfter < 1)
      throw new ApiError("VALIDATION", "Escalate after must be at least 1.", "escalateAfter")
    if (!input.escalateTo) throw new ApiError("VALIDATION", "Pick who to escalate to.", "escalateTo")
  }
  return write((db) => {
    if (id) {
      const r = db.notificationRules.find((x) => x.id === id)
      if (!r) throw new ApiError("NOT_FOUND", "Rule not found.")
      const before = clone(r)
      const timing =
        input.event === "follow_up_overdue" && input.escalateAfter
          ? `${input.escalateAfter} ${input.escalateUnit === "minutes past due" ? "min" : "h"} after due`
          : input.timing
      Object.assign(r, { ...input, timing })
      appendAudit(db, actor, {
        action: "Notification rule updated",
        entityType: "NotificationRule",
        entityId: r.id,
        entityLabel: r.name,
        before: { ...before },
        after: { ...r },
      })
      return r.id
    }
    const r: NotificationRule = { id: `nr-${nextId(db, "id")}`, ...input }
    db.notificationRules.push(r)
    appendAudit(db, actor, {
      action: "Notification rule created",
      entityType: "NotificationRule",
      entityId: r.id,
      entityLabel: r.name,
      after: { ...r },
    })
    return r.id
  })
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  await delay(160)
  const actor = admin("Edit notification rule")
  write((db) => {
    const r = db.notificationRules.find((x) => x.id === id)
    if (!r) throw new ApiError("NOT_FOUND", "Rule not found.")
    r.enabled = enabled
    appendAudit(db, actor, {
      action: enabled ? "Notification rule enabled" : "Notification rule disabled",
      entityType: "NotificationRule",
      entityId: r.id,
      entityLabel: r.name,
      before: { enabled: !enabled },
      after: { enabled },
    })
  })
}

export const RULE_PLACEHOLDERS = ["{kennel}", "{pet}", "{action}", "{due}", "{case}"]

export function renderRulePreview(template: string): string {
  return template
    .replace("{kennel}", "KC3-2")
    .replace("{pet}", "Teddy")
    .replace("{action}", "Recheck right hind leg")
    .replace("{due}", "09:00")
    .replace("{case}", "C-0135")
}

export async function sendTestNotification(input: NotificationRuleInput): Promise<void> {
  await delay(400)
  const db = getDb()
  const actor = currentUser(db)
  admin("Send test notification")
  write((d) => {
    const rule = { ...input, enabled: true }
    d.notifications.unshift({
      id: `nt-${nextId(d, "id")}`,
      userId: actor.id,
      title: `Test · ${rule.name} · KC3-2 Teddy`,
      body: renderRulePreview(rule.template),
      at: nowISO(),
      read: false,
      href: "/cases?id=C-0135",
    })
    appendAudit(d, actor, {
      action: "Test notification sent",
      entityType: "NotificationRule",
      entityId: rule.name,
      entityLabel: rule.name,
      after: { channels: rule.channels },
    })
  })
}
