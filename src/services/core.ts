/**
 * Shared plumbing for the mock service layer: latency, current actor,
 * authorisation guards (BE-005), audit writes (BE-006) and notifications (BE-022).
 *
 * Every exported service function is async and returns plain cloned data so it
 * can be swapped for a real HTTP client (see `src/services/http.ts`) later.
 */
import { APP_CONFIG } from "@/config/app"
import { ROLE_LABEL, roleHas } from "@/config/rbac"
import { ApiError } from "@/lib/errors"
import { nowISO } from "@/lib/clock"
import { chainEvent, type AuditInput } from "@/lib/mock/audit-chain"
import { getDb, nextId, write, type Db } from "@/lib/mock/db"
import { getSessionUserId } from "@/stores/session-store"
import type { Animal, AuditSource, NotificationEvent, Permission, User } from "@/types/domain"

export { getDb, write, nextId }
export type { Db }

export function delay(ms: number = APP_CONFIG.mockLatencyMs): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function uid(prefix: string): string {
  const db = getDb()
  return `${prefix}-${nextId(db, "id")}`
}

// ---------------------------------------------------------------------------
// Actor & authorisation
// ---------------------------------------------------------------------------

export function currentUser(db: Db = getDb()): User {
  const id = getSessionUserId()
  const user = id ? db.users.find((u) => u.id === id) : undefined
  if (!user) throw new ApiError("UNAUTHENTICATED", "Your session has ended. Please sign in again.")
  if (user.status === "disabled") throw new ApiError("UNAUTHENTICATED", "Your account has been disabled.")
  return user
}

export function idpLabel(user: User): string {
  return user.idp === "officer" ? "Officer IdP" : "Contractor IdP"
}

/** Officer-IdP clinical roles see all kennels; contractors see their kennel scope only. */
export function canSeeKennel(user: User, kennelCode: string): boolean {
  if (user.role !== "contractor") return true
  const block = kennelCode.split("-")[0]
  return user.kennelScope.includes(block)
}

export function canSeeAnimal(user: User, animal: Animal): boolean {
  return canSeeKennel(user, animal.kennelCode)
}

export function hasPermission(user: User, permission: Permission): boolean {
  return roleHas(user.role, permission)
}

/**
 * Throws 403 and records the denied attempt in the audit log
 * ("Out-of-scope access returns 403 and is audited", BE-005).
 */
export function requirePermission(permission: Permission, opts: { kennelCode?: string; what?: string } = {}): User {
  const db = getDb()
  const user = currentUser(db)
  const allowed = hasPermission(user, permission) && (!opts.kennelCode || canSeeKennel(user, opts.kennelCode))
  if (!allowed) {
    write((d) =>
      appendAudit(d, user, {
        action: "Access denied",
        entityType: "Permission",
        entityId: permission,
        entityLabel: opts.what ?? permission,
        after: { permission, kennel: opts.kennelCode ?? null, status: 403 },
      })
    )
    throw new ApiError(
      "FORBIDDEN",
      opts.kennelCode && hasPermission(user, permission)
        ? `${opts.kennelCode} is outside your kennel scope.`
        : "You don't have permission to do this."
    )
  }
  return user
}

export function requireAnimalAccess(animal: Animal): User {
  const db = getDb()
  const user = currentUser(db)
  if (!canSeeAnimal(user, animal)) {
    write((d) =>
      appendAudit(d, user, {
        action: "Access denied",
        entityType: "Animal",
        entityId: animal.id,
        entityLabel: `${animal.kennelCode} · ${animal.name}`,
        animalId: animal.id,
        after: { status: 403, reason: "kennel scope" },
      })
    )
    throw new ApiError("FORBIDDEN", `${animal.kennelCode} is outside your kennel scope.`)
  }
  return user
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditWrite {
  action: string
  entityType: string
  entityId: string
  entityLabel: string
  animalId?: string | null
  caseId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  source?: AuditSource
  at?: string
}

/** Appends an event to the hash-chained, append-only audit log. */
export function appendAudit(db: Db, actor: User | null, w: AuditWrite): void {
  const input: AuditInput = {
    at: w.at ?? nowISO(),
    userId: actor?.id ?? null,
    userName: actor?.name ?? "AI worker",
    userRole: actor ? ROLE_LABEL[actor.role] : "System",
    idp: actor ? idpLabel(actor) : "System",
    action: w.action,
    entityType: w.entityType,
    entityId: w.entityId,
    entityLabel: w.entityLabel,
    animalId: w.animalId ?? null,
    caseId: w.caseId ?? null,
    source: w.source ?? (actor ? "Web workbench" : "AI worker"),
    before: w.before ?? null,
    after: w.after ?? null,
  }
  const n = nextId(db, "event")
  db.audit.push(chainEvent(input, db.audit[db.audit.length - 1], n))
}

// ---------------------------------------------------------------------------
// Notifications (in-app mirror of push/email, filtered by role & scope)
// ---------------------------------------------------------------------------

export function notify(
  db: Db,
  event: NotificationEvent,
  recipientIds: (string | null | undefined)[],
  title: string,
  body: string,
  href: string | null
): void {
  const rule = db.notificationRules.find((r) => r.event === event)
  if (rule && !rule.enabled) return
  const at = nowISO()
  const unique = Array.from(new Set(recipientIds.filter((x): x is string => Boolean(x))))
  for (const userId of unique) {
    const u = db.users.find((x) => x.id === userId)
    if (!u || u.status === "disabled") continue
    db.notifications.unshift({ id: `nt-${nextId(db, "id")}`, userId, title, body, at, read: false, href })
  }
}

export function vets(db: Db): User[] {
  return db.users.filter((u) => u.role === "vet" && u.status !== "disabled")
}

export function supervisors(db: Db): User[] {
  return db.users.filter((u) => u.role === "supervisor" && u.status !== "disabled")
}

export function userName(db: Db, id: string | null | undefined): string {
  if (!id) return "Unassigned"
  return db.users.find((u) => u.id === id)?.name ?? "Unknown user"
}
