/**
 * In-browser mock database (local mock persistence).
 *
 * The real system is a NestJS + PostgreSQL API (BE-001/BE-002). Until it is
 * available, the service layer in `src/services` reads and writes this store,
 * which is persisted to localStorage so data survives reloads. UI code must
 * never import this module directly — always go through `src/services`.
 */
import { APP_CONFIG } from "@/config/app"
import type {
  Animal,
  AppNotification,
  AppSettings,
  ArrivalExam,
  AuditEvent,
  BodySystem,
  ChecklistTemplate,
  GlossaryTerm,
  HealthCase,
  Inspection,
  Kennel,
  KennelBlock,
  MedicationAdministration,
  MedicationSchedule,
  NotificationRule,
  Observation,
  Sign,
  Species,
  User,
} from "@/types/domain"

import { buildSeed } from "./seed"

export interface Db {
  version: number
  /** Increments on every write — used to detect changes from other tabs. */
  revision: number
  users: User[]
  kennelBlocks: KennelBlock[]
  kennels: Kennel[]
  species: Species[]
  templates: ChecklistTemplate[]
  bodySystems: BodySystem[]
  signs: Sign[]
  glossary: GlossaryTerm[]
  notificationRules: NotificationRule[]
  animals: Animal[]
  arrivalExams: ArrivalExam[]
  inspections: Inspection[]
  observations: Observation[]
  cases: HealthCase[]
  medicationSchedules: MedicationSchedule[]
  medicationAdministrations: MedicationAdministration[]
  notifications: AppNotification[]
  audit: AuditEvent[]
  settings: AppSettings
  counters: { observation: number; case: number; event: number; id: number }
}

const KEY = `${APP_CONFIG.storageKey}-v${APP_CONFIG.storageVersion}`

let cache: Db | null = null

function load(): Db {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Db
        if (parsed.version === APP_CONFIG.storageVersion) return parsed
      }
    } catch {
      // Corrupt or blocked storage — fall back to a fresh seed.
    }
  }
  return buildSeed()
}

function persist(db: Db): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

/** Current database snapshot (lazy-loaded). Treat as read-only outside `write`. */
export function getDb(): Db {
  if (!cache) {
    cache = load()
    persist(cache)
  }
  return cache
}

/** Applies a mutation and persists. Returns the mutator's result. */
export function write<T>(mutator: (db: Db) => T): T {
  const db = getDb()
  const result = mutator(db)
  db.revision += 1
  persist(db)
  return result
}

/** Generates the next sequential id for a counter. */
export function nextId(db: Db, kind: keyof Db["counters"]): number {
  db.counters[kind] += 1
  return db.counters[kind]
}

/** Re-reads storage (after another tab wrote). Returns true if data changed. */
export function reloadFromStorage(): boolean {
  if (typeof window === "undefined") return false
  const before = cache?.revision ?? -1
  cache = load()
  return cache.revision !== before
}

/** Drops all local changes and restores the seed data set. */
export function resetDb(): void {
  cache = buildSeed()
  persist(cache)
}

export const STORAGE_KEY = KEY
