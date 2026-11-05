import { describe, expect, it } from "vitest"

import { getDb } from "@/lib/mock/db"
import { addDays, todayISO } from "@/lib/clock"
import { signInAs } from "@/test/utils"

import {
  availableKennels,
  completeArrivalExam,
  createArrival,
  getAnimal,
  getTimeline,
  globalSearch,
  listAnimals,
  releaseAnimal,
  updateAnimal,
} from "./animals"

const base = () => ({
  name: "Bao",
  speciesId: "dog",
  breed: "Pug",
  sex: "M" as const,
  dateOfBirth: "2022-01-05",
  origin: "Japan",
  microchip: "900123456789999",
  kennelCode: "ISO-1",
  releaseDate: addDays(todayISO(), 30),
})

describe("animals service (BE-009 / BE-010)", () => {
  it("lists active animals with tab counts and searches by microchip", async () => {
    signInAs("u-tan-j")
    const r = await listAnimals({ tab: "active" })
    expect(r.total).toBe(17)
    expect(r.rows).toHaveLength(10)
    expect(r.tabCounts.released).toBe(6)
    const mc = await listAnimals({ tab: "active", search: "0901" })
    expect(mc.rows.map((x) => x.animal.name)).toEqual(["Yang Yang"])
  })

  it("scopes contractors to their kennel blocks and returns 403 out of scope", async () => {
    signInAs("u-ong-s") // KC3 only
    const r = await listAnimals({ tab: "active", pageSize: 50 })
    expect(r.rows.every((x) => x.animal.kennelCode.startsWith("KC3"))).toBe(true)
    await expect(getAnimal("a-yangyang")).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(getDb().audit.at(-1)?.action).toBe("Access denied")
  })

  it("rejects a microchip already used by an active stay", async () => {
    signInAs("u-tan-j")
    await expect(createArrival({ ...base(), microchip: "900123456780901" })).rejects.toMatchObject({ code: "CONFLICT", field: "microchip" })
  })

  it("creates an arrival, hides the kennel from the picker and completes the exam", async () => {
    signInAs("u-tan-j")
    const a = await createArrival(base())
    expect(a.stayStatus).toBe("arriving")
    expect((await availableKennels("dog")).some((k) => k.code === "ISO-1")).toBe(false)
    const r = await completeArrivalExam(a.id, {
      vetId: "u-lim-w",
      weightKg: 7.2,
      mentation: "Alert",
      findings: [
        { system: "Eyes", normal: true, note: "" },
        { system: "Ears", normal: false, note: "red left ear, scratching" },
      ],
      notes: "",
    })
    expect(r.animal.stayStatus).toBe("active")
    expect(r.observationIds).toHaveLength(1)
  })

  it("requires a note for abnormal exam findings", async () => {
    signInAs("u-tan-j")
    const a = await createArrival(base())
    await expect(
      completeArrivalExam(a.id, {
        vetId: "u-lim-w",
        weightKg: 5,
        mentation: "Calm",
        findings: [{ system: "Ears", normal: false, note: " " }],
        notes: "",
      })
    ).rejects.toMatchObject({ code: "VALIDATION" })
  })

  it("blocks arrivals for contractors (role permission)", async () => {
    signInAs("u-lee-k")
    await expect(createArrival(base())).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("audits profile edits with before/after", async () => {
    signInAs("u-tan-j")
    await updateAnimal("a-rex", { origin: "Thailand" })
    const ev = getDb().audit.at(-1)
    expect(ev?.action).toBe("Animal profile updated")
    expect(ev?.before).toEqual({ origin: "Malaysia" })
  })

  it("release closes open cases, stops medication and drops out of monitoring", async () => {
    signInAs("u-tan-j")
    await releaseAnimal("a-yangyang", "Collected by owner")
    const db = getDb()
    expect(db.animals.find((a) => a.id === "a-yangyang")?.stayStatus).toBe("released")
    expect(db.cases.find((c) => c.id === "C-0142")).toMatchObject({ status: "closed", closeReason: "released" })
    expect(db.medicationSchedules.filter((s) => s.animalId === "a-yangyang" && s.endDate >= todayISO()).every((s) => s.stoppedAt)).toBe(
      true
    )
    await expect(releaseAnimal("a-yangyang", "")).rejects.toMatchObject({ code: "CONFLICT" })
  })

  it("filters and paginates the timeline (BE-020)", async () => {
    signInAs("u-tan-j")
    const all = await getTimeline("a-yangyang", { limit: 7 })
    expect(all.entries).toHaveLength(7)
    expect(all.total).toBeGreaterThan(7)
    const obs = await getTimeline("a-yangyang", { type: "observation", limit: 50 })
    expect(obs.entries.every((e) => e.type === "observation")).toBe(true)
  })

  it("global search finds animals and cases", async () => {
    signInAs("u-tan-j")
    const r = await globalSearch("C-0142")
    expect(r[0]).toMatchObject({ kind: "case", href: "/cases?id=C-0142" })
    expect((await globalSearch("KC2-2"))[0]).toMatchObject({ kind: "animal", id: "a-yangyang" })
  })
})
