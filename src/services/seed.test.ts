import { describe, expect, it } from "vitest"

import { getDb } from "@/lib/mock/db"
import { verifyChain } from "@/lib/mock/audit-chain"
import { signInAs } from "@/test/utils"

import { getDashboard } from "./dashboard"
import { listReviewQueue } from "./observations"
import { getSessionBoard } from "./inspections"
import { listDueToday } from "./medication"

describe("seed data (BE-003)", () => {
  it("builds a consistent data set with an intact audit hash chain", () => {
    signInAs("u-tan-j")
    const db = getDb()
    expect(db.animals.filter((a) => a.stayStatus !== "released")).toHaveLength(17)
    expect(new Set(db.animals.filter((a) => a.stayStatus !== "released").map((a) => a.microchip)).size).toBe(17)
    expect(verifyChain(db.audit).ok).toBe(true)
    expect(db.audit.length).toBeGreaterThan(150)
  })

  it("matches the design reference counts", async () => {
    signInAs("u-tan-j")
    const d = await getDashboard()
    expect(d.counts.activeAnimals).toBe(17)
    expect(d.counts.openCases).toBe(5)
    expect(d.counts.needsReview).toBe(3)
    expect(d.rows.map((r) => r.animal.name)).toEqual(expect.arrayContaining(["Yang Yang", "Oreo", "Milo", "Nala", "Teddy", "Bella"]))
    const q = await listReviewQueue()
    expect(q.items.map((i) => i.observation.id)).toEqual(["O-3390", "O-3398", "O-3402"])
    const board = await getSessionBoard("2026-10-21", "AM")
    expect(board.totals.abnormal).toBe(3)
    const meds = await listDueToday()
    expect(meds.counts.all).toBe(9)
    expect(meds.counts.overdue).toBe(1)
  })
})
