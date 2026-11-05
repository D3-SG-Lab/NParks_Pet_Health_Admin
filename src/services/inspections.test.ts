import { describe, expect, it } from "vitest"

import { getDb } from "@/lib/mock/db"
import { signInAs } from "@/test/utils"
import type { InspectionResult } from "@/types/domain"

import { getInspectionForm, getSessionBoard, recordInspection, remindAssignees } from "./inspections"

const TODAY = "2026-10-21"

function results(overrides: Record<string, string> = {}): InspectionResult[] {
  const rows: [string, string, string, string[]][] = [
    ["mentation", "Mentation", "Responsive", []],
    ["body", "Skin / coat", "Normal", ["Abnormal"]],
    ["body", "Ears", "Normal", ["Abnormal"]],
    ["cardio", "Cardiorespiratory", "Normal", ["Abnormal"]],
    ["food", "Food", "Full", ["Half", "Little", "None"]],
    ["stool", "Stool", "Firm", ["Soft", "Loose", "None"]],
    ["urine", "Urine", "Yes", ["No"]],
  ]
  return rows.map(([itemId, label, def, abnormal]) => {
    const value = overrides[label] ?? def
    return { itemId, label, value, abnormal: abnormal.includes(value), note: "" }
  })
}

describe("daily inspections (BE-011)", () => {
  it("loads the live checklist for the animal's species", async () => {
    signInAs("u-tan-j")
    const form = await getInspectionForm("a-lucky", TODAY, "AM")
    expect(form.templateName).toBe("Dog · daily")
    expect(form.templateVersion).toBe(3)
    expect(form.existing).toBeNull()
  })

  it("allows one AM and one PM per animal per day — a second save edits and is audited", async () => {
    signInAs("u-tan-j")
    const first = await recordInspection({ animalId: "a-lucky", date: TODAY, session: "AM", results: results(), otherFindings: "" })
    expect(first.edited).toBe(false)
    const second = await recordInspection({ animalId: "a-lucky", date: TODAY, session: "AM", results: results(), otherFindings: "" })
    expect(second.edited).toBe(true)
    expect(second.inspection.id).toBe(first.inspection.id)
    const db = getDb()
    expect(db.inspections.filter((i) => i.animalId === "a-lucky" && i.date === TODAY && i.session === "AM")).toHaveLength(1)
    expect(db.audit.at(-1)?.action).toBe("Inspection edited")
    // PM is a separate inspection
    const pm = await recordInspection({ animalId: "a-lucky", date: TODAY, session: "PM", results: results(), otherFindings: "" })
    expect(pm.edited).toBe(false)
  })

  it("sends abnormal findings for AI routing", async () => {
    signInAs("u-tan-j")
    const r = await recordInspection({
      animalId: "a-lucky",
      date: TODAY,
      session: "AM",
      results: results({ Stool: "Soft" }),
      otherFindings: "",
    })
    expect(r.observationId).not.toBeNull()
    const obs = getDb().observations.find((o) => o.id === r.observationId)
    expect(obs?.reportedAnimalId).toBe("a-lucky")
    expect(["awaiting_confirmation", "needs_review"]).toContain(obs?.aiStatus)
    expect(obs?.ai?.signs.map((s) => s.code)).toContain("GI-001")
  })

  it("requires a note for abnormal Normal/Abnormal rows", async () => {
    signInAs("u-tan-j")
    await expect(
      recordInspection({ animalId: "a-lucky", date: TODAY, session: "AM", results: results({ Ears: "Abnormal" }), otherFindings: "" })
    ).rejects.toMatchObject({ code: "VALIDATION" })
  })

  it("rejects contractors outside their kennel scope with 403 (audited)", async () => {
    signInAs("u-ong-s") // KC3 only
    await expect(
      recordInspection({ animalId: "a-lucky", date: TODAY, session: "AM", results: results(), otherFindings: "" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(getDb().audit.at(-1)?.action).toBe("Access denied")
    // …but can record within scope
    const ok = await recordInspection({ animalId: "a-bella", date: TODAY, session: "AM", results: results(), otherFindings: "" })
    expect(ok.inspection.byUserId).toBe("u-ong-s")
  })

  it("blocks inspections before the arrival exam", async () => {
    signInAs("u-tan-j")
    await expect(
      recordInspection({ animalId: "a-kiko", date: TODAY, session: "AM", results: results(), otherFindings: "" })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("scopes the session board and reminds contractors for due animals", async () => {
    signInAs("u-ong-s")
    const board = await getSessionBoard(TODAY, "AM")
    expect(board.blocks.map((b) => b.block.code)).toEqual(["KC3"])
    signInAs("u-tan-j")
    const r = await remindAssignees(TODAY, "AM")
    expect(r.kennels).toBeGreaterThan(0)
    expect(r.notified).toBeGreaterThan(0)
    expect(getDb().notifications.some((n) => n.userId === "u-lee-k" && n.title.startsWith("AM checks due"))).toBe(true)
  })
})
