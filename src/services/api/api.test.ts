import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios"
import { afterEach, describe, expect, it, vi } from "vitest"

import { http, setSessionExpiredHandler } from "./axios-instance"
import { toApiError } from "./errors"
import { readClaims } from "./jwt"
import { clearTokens, getTokens, setTokens } from "./token-store"
import { isStaying, sexOf, STAYING_STATUS, toAnimal, toInspection, toInspectionRequest } from "../remote/mappers"
import type { AnimalStayDto, DailyInspectionDto } from "./types"

function axiosError(status: number, data: unknown, config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig): AxiosError {
  return new AxiosError("fail", "ERR", config, null, { status, statusText: "", headers: {}, config, data })
}

const jwt = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`

describe("toApiError", () => {
  it("reads the collection's { error } body", () => {
    const e = toApiError(axiosError(409, { error: "An active stay already exists for this microchip." }))
    expect(e).toMatchObject({ code: "CONFLICT", status: 409, message: "An active stay already exists for this microchip." })
  })

  it("prefers `message` when `error` is a machine code", () => {
    const e = toApiError(
      axiosError(409, { error: "MedicationError", kind: "already_recorded", message: "Dose already recorded for this slot." })
    )
    expect(e.message).toBe("Dose already recorded for this slot.")
  })

  it("maps ASP.NET ProblemDetails validation errors to a field", () => {
    const e = toApiError(
      axiosError(400, { title: "One or more validation errors occurred.", errors: { Microchip: ["The Microchip field is required."] } })
    )
    expect(e).toMatchObject({ code: "VALIDATION", field: "microchip", message: "The Microchip field is required." })
  })

  it("explains empty 404 and 5xx responses", () => {
    expect(toApiError(axiosError(404, ""), "The medication list").message).toBe(
      "The medication list is not available from the API (HTTP 404)."
    )
    expect(toApiError(axiosError(500, "")).message).toContain("HTTP 500")
  })

  it("flags network failures", () => {
    const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
    expect(toApiError(new AxiosError("Network Error", "ERR_NETWORK", config)).code).toBe("NETWORK")
  })
})

describe("readClaims", () => {
  it("reads the live token claims", () => {
    expect(readClaims(jwt({ sub: "1", user_type: "aqc_staff", role: "officer", exp: 1 }))).toMatchObject({
      sub: "1",
      userType: "aqc_staff",
      staffRole: "officer",
    })
    expect(readClaims(jwt({ sub: "4", user_type: "nparks_admin" })).staffRole).toBeNull()
  })
})

describe("mappers", () => {
  const stay: AnimalStayDto = {
    id: 7,
    name: "Buddy",
    kennelId: 1,
    kennelCode: "KC1-1",
    kennelBlock: "KC1",
    species: "Dog",
    sex: "Unknown",
    countryCode: "SG",
    countryName: "Singapore",
    microchip: "900082000123456",
    dateOfBirth: null,
    arrivalDate: "2026-11-01",
    releaseDate: null,
    status: "staying",
    createdBy: 5,
    createdAt: "2026-11-01T08:00:00Z",
    updatedAt: "2026-11-01T08:00:00Z",
  }

  it("maps a stay without inventing missing fields", () => {
    const a = toAnimal(stay, false)
    expect(a).toMatchObject({
      id: "7",
      speciesId: "dog",
      sex: "U",
      breed: "",
      releaseDate: "",
      stayStatus: "arriving",
      origin: "Singapore",
    })
    expect(toAnimal(stay).stayStatus).toBe("active")
    expect(toAnimal({ ...stay, status: "released", releaseDate: "2026-11-10" }).stayStatus).toBe("released")
    expect(sexOf("Female")).toBe("F")
  })

  it("treats the live API's active-monitoring status as staying", () => {
    expect(STAYING_STATUS).toBe("active-monitoring")
    expect(isStaying("active-monitoring")).toBe(true)
    expect(isStaying("staying")).toBe(true)
    expect(isStaying("released")).toBe(false)
    expect(isStaying("deceased")).toBe(false)
    const live = { ...stay, status: "active-monitoring" as const }
    expect(toAnimal(live).stayStatus).toBe("active")
    expect(toAnimal(live, false).stayStatus).toBe("arriving")
    expect(toAnimal({ ...stay, status: "deceased" }).stayStatus).toBe("released")
  })

  it("builds the inspection body with the API's fixed fields", () => {
    const body = toInspectionRequest({
      date: "2026-11-13",
      session: "PM",
      otherFindings: "Restless",
      results: [
        { itemId: "mentation", label: "Mentation", value: "Calm", abnormal: false, note: "" },
        { itemId: "body", label: "Eyes", value: "Abnormal", abnormal: true, note: "discharge" },
        { itemId: "cardio", label: "Cardiorespiratory", value: "Normal", abnormal: false, note: "" },
        { itemId: "food", label: "Food", value: "Half", abnormal: true, note: "" },
        { itemId: "stool", label: "Stool", value: "Watery", abnormal: true, note: "" },
        { itemId: "urine", label: "Urine", value: "Yes", abnormal: false, note: "" },
      ],
    })
    expect(body).toEqual({
      session: "PM",
      inspectionDate: "2026-11-13",
      mentation: "Calm",
      food: "Half",
      stool: "Watery",
      urine: "Yes",
      otherFindings: "Eyes: discharge\nRestless",
      systemFindings: [
        { system: "eyes", finding: "abnormal" },
        { system: "cardiorespiratory", finding: "normal" },
      ],
    })
  })

  it("counts abnormal answers when reading an inspection", () => {
    const dto: DailyInspectionDto = {
      id: 101,
      stayId: 7,
      inspectionDate: "2026-11-13",
      session: "AM",
      mentation: "Alert",
      food: "Full",
      stool: "Soft",
      urine: "Yes",
      otherFindings: null,
      systemFindings: [{ id: 1, system: "skin", finding: "normal" }],
      recordedBy: 10,
      recordedAt: "2026-11-13T00:05:00Z",
    }
    expect(toInspection(dto, "KC1-1")).toMatchObject({ id: "101", abnormalCount: 1, byUserId: "staff-10" })
  })
})

describe("axios instance", () => {
  afterEach(() => {
    clearTokens()
    http.defaults.adapter = undefined
  })

  it("adds the bearer token, refreshes once on 401 and retries", async () => {
    setTokens({ access_token: "old", refresh_token: "r1", token_type: "Bearer", expires_in: 60 })
    const seen: string[] = []
    const adapter: AxiosAdapter = async (config) => {
      const auth = String(config.headers.get("Authorization") ?? "")
      seen.push(`${config.url} ${auth}`)
      if (config.url === "/auth/refresh") {
        return {
          data: { access_token: "new", refresh_token: "r2", token_type: "Bearer", expires_in: 60 },
          status: 200,
          statusText: "",
          headers: {},
          config,
        }
      }
      if (auth === "Bearer old") throw axiosError(401, "", config)
      return { data: [{ id: 1 }], status: 200, statusText: "", headers: {}, config }
    }
    http.defaults.adapter = adapter
    const res = await http.get("/kennels")
    expect(res.data).toEqual([{ id: 1 }])
    expect(seen).toEqual(["/kennels Bearer old", "/auth/refresh ", "/kennels Bearer new"])
    expect(getTokens()?.refreshToken).toBe("r2")
  })

  it("ends the session when there is no refresh token", async () => {
    setTokens({ access_token: "dev", refresh_token: "", token_type: "Bearer", expires_in: 60 })
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    http.defaults.adapter = async () => {
      throw axiosError(401, "")
    }
    await expect(http.get("/animals")).rejects.toBeInstanceOf(AxiosError)
    expect(expired).toHaveBeenCalledOnce()
    expect(getTokens()).toBeNull()
  })
})
