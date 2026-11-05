import { describe, expect, it } from "vitest"

import { getDb } from "@/lib/mock/db"
import { signInAs } from "@/test/utils"

import { createSchedule, listDueToday, recordDose, stopSchedule, type ScheduleInput } from "./medication"

const base: ScheduleInput = {
  animalId: "a-yangyang",
  item: "Kaolin suspension",
  dose: "2 mL",
  route: "Oral",
  site: "",
  frequency: "2x",
  doseTimes: ["08:00", "20:00"],
  startDate: "2026-10-21",
  endDate: "2026-10-25",
  caseId: "C-0142",
}

describe("medication (BE-015)", () => {
  it("lists due and overdue doses for today", async () => {
    signInAs("u-tan-j")
    const { rows, counts } = await listDueToday("all")
    expect(counts.all).toBe(9)
    const earDrops = rows.find((r) => r.schedule.id === "ms-01")
    expect(earDrops?.status).toBe("overdue")
    const probiotic = rows.find((r) => r.schedule.id === "ms-04")
    expect(probiotic?.status).toBe("partial")
    expect(probiotic?.pendingTimes).toEqual(["20:00"])
  })

  it("captures time and officer automatically and blocks double-recording (409)", async () => {
    signInAs("u-tan-j")
    const adm = await recordDose("ms-01", "07:00", "")
    expect(adm.byUserId).toBe("u-tan-j")
    expect(adm.date).toBe("2026-10-21")
    await expect(recordDose("ms-01", "07:00", "")).rejects.toMatchObject({ code: "CONFLICT" })
    // seeded dose already given by J. Tan at 07:52
    await expect(recordDose("ms-04", "08:00", "")).rejects.toMatchObject({ status: 409 })
    expect(
      getDb()
        .audit.filter((e) => e.action === "Medication administered")
        .at(-1)?.entityLabel
    ).toBe("KC2-2 · Ear drops")
  })

  it("validates schedules: end before start and dose-time count", async () => {
    signInAs("u-tan-j")
    await expect(createSchedule({ ...base, endDate: "2026-10-19" })).rejects.toMatchObject({ code: "VALIDATION", field: "endDate" })
    await expect(createSchedule({ ...base, doseTimes: ["08:00"] })).rejects.toMatchObject({ code: "VALIDATION", field: "doseTimes" })
    await expect(createSchedule({ ...base, frequency: "custom", doseTimes: ["08:00", "08:00"] })).rejects.toMatchObject({
      field: "doseTimes",
    })
    const s = await createSchedule(base)
    expect(s.caseId).toBe("C-0142")
    const { counts } = await listDueToday("all")
    expect(counts.all).toBe(10)
    await stopSchedule(s.id, "course completed")
    expect((await listDueToday("all")).counts.all).toBe(9)
  })

  it("restricts contractors to their kennel scope", async () => {
    signInAs("u-ong-s") // KC3
    await expect(recordDose("ms-01", "07:00", "")).rejects.toMatchObject({ code: "FORBIDDEN" })
    const { rows } = await listDueToday("all")
    expect(rows.every((r) => r.animal.kennelCode.startsWith("KC3"))).toBe(true)
  })

  it("does not let auditors record doses", async () => {
    signInAs("u-lim-r")
    await expect(recordDose("ms-01", "07:00", "")).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
