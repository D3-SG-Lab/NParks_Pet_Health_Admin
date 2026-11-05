import { describe, expect, it } from "vitest"

import { verifyChain } from "@/lib/mock/audit-chain"
import { getDb } from "@/lib/mock/db"
import { signInAs } from "@/test/utils"

import { exportAudit, queryAudit, verifyAuditChain } from "./audit"

describe("audit service (BE-006, BE-023)", () => {
  it("lets auditors and admins query", async () => {
    signInAs("u-lim-r")
    const r = await queryAudit({ caseId: "C-0142" })
    expect(r.total).toBeGreaterThan(0)
    expect(r.events.every((e) => e.caseId === "C-0142" || e.entityId === "C-0142")).toBe(true)
    signInAs("u-wong-s")
    await expect(queryAudit({})).resolves.toBeTruthy()
  })

  it("rejects officers with 403 and records the denied attempt", async () => {
    signInAs("u-tan-j")
    const before = getDb().audit.length
    await expect(queryAudit({})).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
    const db = getDb()
    expect(db.audit.length).toBe(before + 1)
    expect(db.audit.at(-1)).toMatchObject({ action: "Access denied", userId: "u-tan-j" })
    expect(verifyChain(db.audit).ok).toBe(true)
  })

  it("records the export itself as an audit event", async () => {
    signInAs("u-lim-r")
    const rows = await exportAudit({ action: "Login" })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((e) => e.action === "Login")).toBe(true)
    const last = getDb().audit.at(-1)
    expect(last).toMatchObject({ action: "Audit export", entityLabel: `CSV · ${rows.length} rows` })
  })

  it("filters by date range and user", async () => {
    signInAs("u-lim-r")
    const r = await queryAudit({ userId: "system", from: "2026-10-21T00:00:00", to: "2026-10-21T23:59:59", pageSize: 500 })
    expect(r.events.every((e) => e.userId === null && e.at.startsWith("2026-10-21"))).toBe(true)
  })

  it("verifies the hash chain and detects tampering", async () => {
    signInAs("u-lim-r")
    expect((await verifyAuditChain()).ok).toBe(true)
    const copy = structuredClone(getDb().audit)
    copy[10].after = { status: "tampered" }
    const r = verifyChain(copy)
    expect(r.ok).toBe(false)
    expect(r.brokenAt).toBe(copy[10].id)
  })
})
