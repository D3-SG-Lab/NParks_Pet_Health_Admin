import { describe, expect, it } from "vitest"

import { todayISO } from "@/lib/clock"
import { getDb } from "@/lib/mock/db"
import { useSessionStore } from "@/stores/session-store"
import { signInAs } from "@/test/utils"
import type { InspectionResult } from "@/types/domain"

import { recordInspection } from "./inspections"
import {
  createKennel,
  createTemplate,
  discardDraft,
  importGlossary,
  listKennelBlocks,
  listTaxonomy,
  publishDraft,
  saveSign,
  updateKennel,
} from "./master-data"

const ADMIN = "u-wong-s"

const normalResults: InspectionResult[] = ["Mentation", "Skin / coat", "Food", "Stool", "Urine"].map((label) => ({
  itemId: label.toLowerCase(),
  label,
  value:
    label === "Mentation" ? "Responsive" : label === "Food" ? "Full" : label === "Stool" ? "Firm" : label === "Urine" ? "Yes" : "Normal",
  abnormal: false,
  note: "",
}))

describe("master data — kennels (BE-008)", () => {
  it("locks the kennel code while an animal is assigned", async () => {
    signInAs(ADMIN)
    await expect(
      updateKennel("KC2-2", {
        code: "KC2-9",
        blockCode: "KC2",
        type: "Dog run · small",
        speciesAllowed: ["dog", "other"],
        status: "in_service",
        availableFrom: null,
      })
    ).rejects.toMatchObject({ code: "CONFLICT", field: "code" })
  })

  it("blocks taking an occupied kennel out of service", async () => {
    signInAs(ADMIN)
    await expect(
      updateKennel("KC2-2", {
        code: "KC2-2",
        blockCode: "KC2",
        type: "Dog run · small",
        speciesAllowed: ["dog", "other"],
        status: "out_of_service",
        availableFrom: null,
      })
    ).rejects.toMatchObject({ code: "CONFLICT", field: "status" })
  })

  it("creates a kennel, rejects duplicates and audits the change", async () => {
    signInAs(ADMIN)
    const before = getDb().audit.length
    await createKennel({
      code: "KC1-7",
      blockCode: "KC1",
      type: "Cattery suite",
      speciesAllowed: ["cat"],
      status: "in_service",
      availableFrom: null,
    })
    expect(getDb().kennels.some((k) => k.code === "KC1-7")).toBe(true)
    expect(getDb().audit.at(-1)?.action).toBe("Kennel created")
    expect(getDb().audit.length).toBe(before + 1)
    await expect(
      createKennel({
        code: "KC1-7",
        blockCode: "KC1",
        type: "Cattery suite",
        speciesAllowed: ["cat"],
        status: "in_service",
        availableFrom: null,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("master data — checklist templates", () => {
  it("publishing a draft retires the previous live version; new inspections use it, recorded ones keep theirs", async () => {
    signInAs(ADMIN)
    const v = await publishDraft("tpl-dog")
    expect(v).toBe(4)
    const tpl = getDb().templates.find((t) => t.id === "tpl-dog")!
    expect(tpl.versions.find((x) => x.version === 3)?.status).toBe("retired")
    expect(tpl.versions.find((x) => x.version === 4)?.status).toBe("live")
    expect(tpl.versions.some((x) => x.status === "draft")).toBe(false)
    // Already-recorded inspections keep v3.
    expect(
      getDb().inspections.find((i) => i.animalId === "a-yangyang" && i.date === todayISO() && i.session === "AM")?.templateVersion
    ).toBe(3)

    // A new inspection (recorded by an officer) uses v4.
    useSessionStore.getState().setSession("u-tan-j", "2026-10-21T08:42:00")
    const { inspection } = await recordInspection({
      animalId: "a-rex",
      date: todayISO(),
      session: "PM",
      results: normalResults,
      otherFindings: "",
    })
    expect(inspection.templateId).toBe("tpl-dog")
    expect(inspection.templateVersion).toBe(4)
  })

  it("discards a draft but refuses to discard a template's only version", async () => {
    signInAs(ADMIN)
    await discardDraft("tpl-dog")
    expect(
      getDb()
        .templates.find((t) => t.id === "tpl-dog")!
        .versions.some((v) => v.status === "draft")
    ).toBe(false)
    const id = await createTemplate({ name: "Rabbit · daily", kind: "daily", appliesTo: "Rabbits", copyFrom: "tpl-general" })
    expect(getDb().templates.find((t) => t.id === id)!.versions[0].items.length).toBeGreaterThan(0)
    await expect(discardDraft(id)).rejects.toMatchObject({ code: "CONFLICT" })
  })
})

describe("master data — taxonomy & glossary", () => {
  it("generates the next sign code and bumps the taxonomy version", async () => {
    signInAs(ADMIN)
    const code = await saveSign(null, {
      bodySystem: "gastrointestinal",
      name: "Hiccups",
      synonyms: ["Hiccup", " hic "],
      relatedWindowDays: 7,
      active: true,
    })
    expect(code).toBe("GI-009")
    const t = await listTaxonomy()
    expect(t.version).toBe("v1.3")
    expect(t.signs.find((s) => s.sign.code === "GI-009")?.sign.synonyms).toEqual(["hiccup", "hic"])
  })

  it("imports glossary rows: creates, updates and reports invalid rows", async () => {
    signInAs(ADMIN)
    const total = getDb().glossary.length
    const r = await importGlossary([
      ["term", "meaning", "category", "example"],
      ["BAR", "Bright, alert and responsive", "Abbreviation", "BAR today"],
      ["kennel cough", "Infectious tracheobronchitis", "Clinical", "honking cough"],
      ["", "missing term", "Care", ""],
      ["x-ray", "Radiograph", "Imaging", ""],
    ])
    expect(r).toEqual({ created: 1, updated: 1, errors: [expect.stringContaining("Row 3"), expect.stringContaining("Imaging")] })
    expect(getDb().glossary.length).toBe(total + 1)
    expect(getDb().glossary.find((g) => g.term === "BAR")?.meaning).toBe("Bright, alert and responsive")
  })
})

describe("master data — access (BE-005)", () => {
  it("returns 403 for non-admins and audits the attempt", async () => {
    signInAs("u-koh-m")
    await expect(listKennelBlocks()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 })
    const last = getDb().audit.at(-1)
    expect(last?.action).toBe("Access denied")
    expect(last?.userId).toBe("u-koh-m")
  })
})
