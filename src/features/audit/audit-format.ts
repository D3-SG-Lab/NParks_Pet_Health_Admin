import type { AuditEvent } from "@/types/domain"

/** Renders a before/after snapshot as `key: value` lines (design p.8). */
export function snapshotLines(value: Record<string, unknown> | null): string[] {
  if (!value) return []
  return Object.entries(value).map(([k, v]) => `${k}: ${v === undefined ? "null" : JSON.stringify(v)}`)
}

export const AUDIT_CSV_HEADERS = [
  "Event ID",
  "Time",
  "User",
  "Role",
  "IdP",
  "Action",
  "Entity",
  "Source",
  "Before",
  "After",
  "Prev hash",
  "Hash",
]

export function auditCsvRow(e: AuditEvent): (string | number | null)[] {
  return [
    e.id,
    e.at.replace("T", " "),
    e.userName,
    e.userRole,
    e.idp,
    e.action,
    e.entityLabel,
    e.source,
    e.before ? JSON.stringify(e.before) : "",
    e.after ? JSON.stringify(e.after) : "",
    e.prevHash,
    e.hash,
  ]
}

/** Link target for an event's entity, when one exists in the workbench. */
export function entityHref(e: AuditEvent): string | null {
  if (e.caseId) return `/cases?id=${e.caseId}`
  if (e.entityType === "Case") return `/cases?id=${e.entityId}`
  if (e.animalId) return `/animals/${e.animalId}`
  return null
}
