import { describe, expect, it } from "vitest"

import { getDb } from "@/lib/mock/db"
import { signInAs } from "@/test/utils"

import { assignFollowUp, clearMonitoring, getDashboard } from "./dashboard"

describe("dashboard service (BE-021)", () => {
  it("flags rows for filter chips", async () => {
    signInAs("u-lim-w")
    const d = await getDashboard()
    expect(d.filterCounts.needs_review).toBe(2)
    expect(
      d.rows
        .filter((r) => r.filters.includes("assigned_to_me"))
        .map((r) => r.animal.name)
        .sort()
    ).toEqual(["Milo", "Yang Yang"])
    expect(d.rows[0].summary.bullets.length).toBeGreaterThan(0)
  })

  it("assigns a follow-up to the animal's open case and notifies the assignee", async () => {
    signInAs("u-tan-j")
    const r = await assignFollowUp("a-oreo", { assigneeId: "u-lim-w", action: "Recheck appetite", dueAt: "2026-10-21T16:00:00" })
    expect(r.caseId).toBe("C-0143")
    const c = getDb().cases.find((x) => x.id === "C-0143")
    expect(c?.assigneeId).toBe("u-lim-w")
    expect(c?.followUps.at(-1)?.action).toBe("Recheck appetite")
    expect(getDb().notifications[0].userId).toBe("u-lim-w")
    expect(getDb().audit.at(-1)?.action).toBe("Follow-up assigned")
  })

  it("sets a monitoring follow-up for animals without a case", async () => {
    signInAs("u-tan-j")
    const r = await assignFollowUp("a-bella", { assigneeId: "u-ong-s", action: "Recheck appetite PM", dueAt: "2026-10-21T16:00:00" })
    expect(r.caseId).toBeNull()
    expect(getDb().animals.find((a) => a.id === "a-bella")).toMatchObject({
      monitoringAssigneeId: "u-ong-s",
      monitoringAction: "Recheck appetite PM",
    })
    await clearMonitoring("a-bella")
    expect((await getDashboard()).rows.some((x) => x.animal.id === "a-bella")).toBe(false)
  })

  it("rejects follow-ups from roles without case permission", async () => {
    signInAs("u-lee-k")
    await expect(
      assignFollowUp("a-oreo", { assigneeId: "u-lim-w", action: "x action", dueAt: "2026-10-21T16:00:00" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
