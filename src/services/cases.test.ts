import { describe, expect, it } from "vitest"

import { isApiError } from "@/lib/errors"
import { getDb } from "@/lib/mock/db"
import { signInAs } from "@/test/utils"

import { addFollowUp, closeCase, getCase, listCases, reopenCase, setCaseStatus } from "./cases"

async function codeOf(p: Promise<unknown>) {
  try {
    await p
    return null
  } catch (e) {
    return isApiError(e) ? e.code : "UNKNOWN"
  }
}

describe("case management (BE-017)", () => {
  it("rejects invalid status transitions with 409", async () => {
    signInAs("u-tan-j")
    expect(await codeOf(setCaseStatus("C-0120", "needs_review"))).toBe("CONFLICT")
    expect(await codeOf(closeCase("C-0120", "resolved", "again"))).toBe("CONFLICT")
  })

  it("requires a closing note", async () => {
    signInAs("u-tan-j")
    expect(await codeOf(closeCase("C-0139", "resolved", "   "))).toBe("VALIDATION")
  })

  it("closes with a reason and reopens keeping the full history", async () => {
    signInAs("u-tan-j")
    const before = await getCase("C-0139")
    await closeCase("C-0139", "resolved", "Cough resolved, nasal discharge cleared.")
    const closed = getDb().cases.find((c) => c.id === "C-0139")!
    expect(closed.status).toBe("closed")
    expect(closed.closeReason).toBe("resolved")
    await reopenCase("C-0139", "Coughing again")
    const after = await getCase("C-0139")
    expect(after.case.status).toBe("open")
    expect(after.case.reopenedAt).not.toBeNull()
    expect(after.case.observationIds).toEqual(before.case.observationIds)
    expect(after.notes.some((n) => n.text.includes("Coughing again"))).toBe(true)
    const actions = getDb()
      .audit.filter((e) => e.caseId === "C-0139")
      .map((e) => e.action)
    expect(actions).toEqual(expect.arrayContaining(["Case closed", "Case reopened", "Case note added"]))
  })

  it("only officer-IdP clinical roles can close; denial is audited (BE-005)", async () => {
    signInAs("u-lee-k")
    expect(await codeOf(closeCase("C-0142", "resolved", "done"))).toBe("FORBIDDEN")
    expect(getDb().audit.at(-1)?.action).toBe("Access denied")
  })

  it("adding a follow-up to an unassigned case assigns it", async () => {
    signInAs("u-tan-j")
    await addFollowUp("C-0143", { action: "Triage vomiting", dueAt: "2026-10-21T12:00:00", assigneeId: "u-lim-w" })
    const c = getDb().cases.find((x) => x.id === "C-0143")!
    expect(c.assigneeId).toBe("u-lim-w")
    expect(c.followUps.at(-1)?.action).toBe("Triage vomiting")
  })

  it("filters the list and counts", async () => {
    signInAs("u-tan-j")
    const r = await listCases({ filter: "needs_review" })
    expect(r.items.map((i) => i.case.id).sort()).toEqual(["C-0142", "C-0143"])
    expect(r.counts.open).toBe(5)
    const s = await listCases({ filter: "all", search: "teddy" })
    expect(s.items.map((i) => i.case.id)).toEqual(["C-0135"])
  })
})
