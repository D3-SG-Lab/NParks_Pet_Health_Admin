import { sha256 } from "@/lib/hash"
import type { AuditEvent } from "@/types/domain"

export type AuditInput = Omit<AuditEvent, "id" | "seq" | "prevHash" | "hash">

export const GENESIS_HASH = "0".repeat(64)

/** Canonical content hashed for an event (everything except its own hash). */
function canonical(e: Omit<AuditEvent, "hash">): string {
  return JSON.stringify([
    e.id,
    e.seq,
    e.at,
    e.userId,
    e.userName,
    e.userRole,
    e.idp,
    e.action,
    e.entityType,
    e.entityId,
    e.entityLabel,
    e.animalId,
    e.caseId,
    e.source,
    e.before,
    e.after,
    e.prevHash,
  ])
}

export function formatEventId(n: number): string {
  return `EV-${String(n).padStart(7, "0")}`
}

/** Builds the next event in an append-only chain. */
export function chainEvent(input: AuditInput, prev: AuditEvent | undefined, n: number): AuditEvent {
  const base: Omit<AuditEvent, "hash"> = {
    ...input,
    id: formatEventId(n),
    seq: (prev?.seq ?? 0) + 1,
    prevHash: prev?.hash ?? GENESIS_HASH,
  }
  return { ...base, hash: sha256(canonical(base)) }
}

/**
 * Verifies the whole chain (BE-006 "Hash chain verification job passes").
 * Returns the first broken event id, or null when the chain is intact.
 */
export function verifyChain(events: AuditEvent[]): { ok: boolean; brokenAt: string | null; checked: number } {
  let prevHash = GENESIS_HASH
  for (const e of events) {
    const { hash, ...rest } = e
    if (e.prevHash !== prevHash || sha256(canonical(rest)) !== hash) {
      return { ok: false, brokenAt: e.id, checked: events.length }
    }
    prevHash = hash
  }
  return { ok: true, brokenAt: null, checked: events.length }
}
