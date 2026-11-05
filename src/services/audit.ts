/** Audit query, export & chain verification (BE-006, BE-023, FE-022). */
import { PAGE_SIZE } from "@/config/app"
import { nowISO } from "@/lib/clock"
import { verifyChain } from "@/lib/mock/audit-chain"
import type { AuditEvent } from "@/types/domain"

import { appendAudit, clone, delay, getDb, requirePermission, write } from "./core"

export interface AuditQuery {
  animal?: string // kennel code or name
  caseId?: string
  userId?: string // "all" | id | "system"
  from?: string // ISO datetime
  to?: string
  action?: string // "all" | action
  page?: number
  pageSize?: number
  sortDir?: "asc" | "desc"
}

export function auditMatches(e: AuditEvent, q: AuditQuery, animalIds: Set<string> | null): boolean {
  if (
    q.caseId &&
    !(
      e.caseId?.toLowerCase().includes(q.caseId.trim().toLowerCase()) ||
      (e.entityType === "Case" && e.entityId.toLowerCase().includes(q.caseId.trim().toLowerCase()))
    )
  )
    return false
  if (animalIds && !(e.animalId && animalIds.has(e.animalId))) return false
  if (q.userId && q.userId !== "all") {
    if (q.userId === "system" ? e.userId !== null : e.userId !== q.userId) return false
  }
  if (q.from && e.at < q.from) return false
  // A minute-precision upper bound ("23:59") includes the whole minute.
  if (q.to && e.at > (q.to.length <= 16 ? `${q.to}:59` : q.to.slice(0, 16) + ":59")) return false
  if (q.action && q.action !== "all" && e.action !== q.action) return false
  return true
}

function filterEvents(q: AuditQuery): AuditEvent[] {
  const db = getDb()
  let animalIds: Set<string> | null = null
  if (q.animal?.trim()) {
    const t = q.animal.trim().toLowerCase()
    animalIds = new Set(
      db.animals.filter((a) => a.name.toLowerCase().includes(t) || a.kennelCode.toLowerCase().includes(t)).map((a) => a.id)
    )
  }
  const out = db.audit.filter((e) => auditMatches(e, q, animalIds))
  return q.sortDir === "asc" ? out : out.slice().reverse()
}

export async function queryAudit(q: AuditQuery) {
  await delay()
  requirePermission("audit", { what: "Audit log" })
  const db = getDb()
  const all = filterEvents(q)
  const pageSize = q.pageSize ?? PAGE_SIZE
  const pages = Math.max(1, Math.ceil(all.length / pageSize))
  const page = Math.min(Math.max(1, q.page ?? 1), pages)
  const actions = Array.from(new Set(db.audit.map((e) => e.action))).sort()
  const users = db.users.map((u) => ({ id: u.id, name: u.name }))
  return { events: clone(all.slice((page - 1) * pageSize, page * pageSize)), total: all.length, page, pages, pageSize, actions, users }
}

export async function getAuditEvent(id: string): Promise<AuditEvent | null> {
  await delay(80)
  requirePermission("audit", { what: "Audit log" })
  return clone(getDb().audit.find((e) => e.id === id) ?? null)
}

/** Returns all matching rows for CSV export and records the export itself (BE-023). */
export async function exportAudit(q: AuditQuery): Promise<AuditEvent[]> {
  await delay()
  const actor = requirePermission("audit", { what: "Audit export" })
  const rows = filterEvents({ ...q, page: 1 })
  write((db) =>
    appendAudit(db, actor, {
      action: "Audit export",
      entityType: "AuditLog",
      entityId: "export",
      entityLabel: `CSV · ${rows.length} rows`,
      after: {
        format: "CSV",
        rows: rows.length,
        filters: {
          animal: q.animal || null,
          case: q.caseId || null,
          user: q.userId ?? "all",
          from: q.from ?? null,
          to: q.to ?? null,
          action: q.action ?? "all",
        },
      },
    })
  )
  return clone(rows)
}

export interface ChainStatus {
  ok: boolean
  brokenAt: string | null
  checked: number
  verifiedAt: string
}

let lastVerification: ChainStatus | null = null

/** Hash chain verification job (BE-006). */
export async function verifyAuditChain(): Promise<ChainStatus> {
  await delay(400)
  requirePermission("audit", { what: "Verify audit chain" })
  const r = verifyChain(getDb().audit)
  lastVerification = { ...r, verifiedAt: nowISO() }
  return lastVerification
}

export async function getChainStatus(): Promise<ChainStatus> {
  if (lastVerification && lastVerification.checked === getDb().audit.length) return lastVerification
  return verifyAuditChain()
}
