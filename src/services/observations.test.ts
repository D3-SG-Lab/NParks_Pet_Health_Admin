import { describe, expect, it } from "vitest"

import { isApiError } from "@/lib/errors"
import { getDb } from "@/lib/mock/db"
import { signInAs } from "@/test/utils"

import { analyzeObservation } from "./ai-engine"
import { confirmRouting, createObservation, listReviewQueue, skipReviewItem, triageObservation } from "./observations"

async function codeOf(p: Promise<unknown>) {
  try {
    await p
    return null
  } catch (e) {
    return isApiError(e) ? e.code : "UNKNOWN"
  }
}

describe("AI matching & routing suggestion (AI-002..AI-004)", () => {
  it("matches kennel code + name with high confidence and suggests updating the open case", () => {
    signInAs("u-tan-j")
    const r = analyzeObservation(getDb(), "KC2-2 Yang Yang soft stool again this morning", null)
    expect(r.matchedAnimalId).toBe("a-yangyang")
    expect(r.confidence).toBeGreaterThanOrEqual(0.9)
    expect(r.signs.map((s) => s.code)).toContain("GI-001")
    expect(r.suggestedAction).toBe("update_case")
    expect(r.suggestedCaseId).toBe("C-0142")
    expect(r.reviewReason).toBeNull()
  })

  it("sends vague descriptions to the review queue", () => {
    signInAs("u-tan-j")
    const r = analyzeObservation(getDb(), "Small brown dog in KC2 corner run scratching right ear", null)
    expect(r.matchedAnimalId).toBeNull()
    expect(r.reviewReason).toBe("no_match")
    expect(r.candidates.length).toBeGreaterThan(0)
  })
})

describe("case rules engine & review queue (BE-018, BE-019)", () => {
  it("triage to a new case removes the item from the queue and records the decision", async () => {
    signInAs("u-tan-j")
    const { caseId } = await triageObservation("O-3402", {
      animalId: "a-coco",
      action: "new_case",
      caseId: null,
      note: "Coco is the only small brown dog in KC2",
    })
    expect(caseId).toMatch(/^C-\d{4}$/)
    const c = getDb().cases.find((x) => x.id === caseId)!
    expect(c.animalId).toBe("a-coco")
    expect(c.observationIds).toEqual(["O-3402"])
    expect(c.evidence).toHaveLength(2)
    const q = await listReviewQueue()
    expect(q.items.map((i) => i.observation.id)).not.toContain("O-3402")
    const ev = getDb()
      .audit.filter((e) => e.action === "Review queue triaged")
      .at(-1)!
    expect(ev.after).toMatchObject({ aiDecision: "new_case", note: "Coco is the only small brown dog in KC2" })
  })

  it("updates an open case and refuses a case of another animal (409)", async () => {
    signInAs("u-tan-j")
    expect(await codeOf(triageObservation("O-3398", { animalId: "a-luna", action: "update_case", caseId: "C-0142" }))).toBe("CONFLICT")
    await triageObservation("O-3398", { animalId: "a-luna", action: "timeline", caseId: null })
    expect(getDb().observations.find((o) => o.id === "O-3398")?.routedAction).toBe("timeline")
    expect(await codeOf(triageObservation("O-3398", { animalId: "a-luna", action: "timeline", caseId: null }))).toBe("CONFLICT")
  })

  it("reopens a recently closed case and keeps earlier data linked", async () => {
    signInAs("u-tan-j")
    await triageObservation("O-3390", { animalId: "a-max", action: "reopen_case", caseId: "C-0120" })
    const c = getDb().cases.find((x) => x.id === "C-0120")!
    expect(c.status).toBe("open")
    expect(c.reopenedAt).not.toBeNull()
    expect(c.observationIds).toEqual(["O-3310", "O-3390"])
  })

  it("skip moves an item to the end of the queue", async () => {
    signInAs("u-tan-j")
    await skipReviewItem("O-3390")
    const q = await listReviewQueue("oldest")
    expect(q.items.at(-1)?.observation.id).toBe("O-3390")
  })

  it("contractors cannot confirm routing", async () => {
    signInAs("u-lee-k")
    expect(await codeOf(confirmRouting("O-3402", { animalId: "a-coco", action: "timeline", caseId: null }))).toBe("FORBIDDEN")
  })

  it("creates an observation, runs AI and awaits confirmation when confident", async () => {
    signInAs("u-tan-j")
    const r = await createObservation({
      text: "KC1-2 Oreo vomited again after breakfast",
      animalId: null,
      media: [{ kind: "photo", caption: "" }],
    })
    expect(r.observation.aiStatus).toBe("awaiting_confirmation")
    expect(r.canConfirm).toBe(true)
    expect(r.observation.ai?.suggestedAction).toBe("update_case")
    const { caseId } = await confirmRouting(r.observation.id, { animalId: "a-oreo", action: "update_case", caseId: "C-0143" })
    expect(caseId).toBe("C-0143")
  })
})
