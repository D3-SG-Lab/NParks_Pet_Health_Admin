#!/usr/bin/env node
/**
 * Contract mock of the NParksPetHealth API v1 — for local development and the
 * API-mode e2e tests. It implements ONLY the requests in
 * docs/NParksPetHealth_API.postman_collection.json, with the same request and
 * response shapes and status codes. Data lives in memory (restart = reset).
 * Stays in quarantine use status "active-monitoring", like the live API (the
 * collection documents "staying"; `?status=staying` is accepted as an alias).
 *
 *   node mock-api/server.mjs            # http://localhost:7999
 *   PORT=8000 TOKEN_TTL=60 node mock-api/server.mjs
 *
 * Point the app at it with NEXT_PUBLIC_API_BASE_URL=http://localhost:7999.
 */
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"

const PORT = Number(process.env.PORT ?? 7999)
const TOKEN_TTL = Number(process.env.TOKEN_TTL ?? 900) // seconds, like the live dev token

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0")
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return localDate(d)
}
const utcNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url")
const err = (status, error, extra = {}) => ({ status, body: { error, ...extra } })

function issueTokens(claims) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    ...claims,
    jti: randomUUID(),
    nbf: now,
    exp: now + TOKEN_TTL,
    iss: "nparks-pet-health",
    aud: "nparks-pet-health-client",
  }
  const access = `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.mock`
  const refresh = claims.dev ? "" : randomUUID()
  if (refresh) db.refreshTokens.set(refresh, claims)
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: TOKEN_TTL }
}

function readToken(req) {
  const h = req.headers.authorization ?? ""
  const m = /^Bearer (.+)$/.exec(h)
  if (!m) return null
  try {
    const payload = JSON.parse(Buffer.from(m[1].split(".")[1], "base64url").toString())
    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Seed data (shapes from the collection's example responses)
// ---------------------------------------------------------------------------

const today = localDate()
const created = "2026-10-28T01:33:45Z"
const kennels = []
let kid = 1
for (const [block, count] of [
  ["KC1", 8],
  ["KC2", 8],
  ["KC3", 6],
]) {
  for (let i = 1; i <= count; i++) kennels.push({ id: kid++, code: `${block}-${i}`, block, isActive: !(block === "KC3" && i === 6) })
}

const db = {
  refreshTokens: new Map(),
  oidcStates: new Map(),
  seq: { admin: 2, vet: 3, species: 3, breed: 2, vaccine: 2, spec: 2, stay: 4, exam: 3, insp: 200, obs: 50, adm: 10, finding: 100 },
  admins: [
    {
      id: 1,
      fullName: "John Doe",
      workEmail: "john.doe@nparks.gov.sg",
      accountStatus: "active",
      lastLoginAt: "2026-11-10T01:00:00Z",
      createdAt: created,
      updatedAt: created,
      deleted: false,
    },
  ],
  vets: [
    {
      id: 1,
      clinicId: 1,
      fullName: "Dr. Sarah Lim",
      licenceNumber: "LIC-2015-001",
      specialisation: "General Practice",
      email: "sarah.lim@pawsandclaws.sg",
      accountStatus: "active",
      lastLoginAt: null,
      createdAt: created,
      updatedAt: created,
    },
    {
      id: 2,
      clinicId: 1,
      fullName: "Dr. James Tan",
      licenceNumber: "LIC-2018-042",
      specialisation: "Surgery",
      email: "james.tan@pawsandclaws.sg",
      accountStatus: "active",
      lastLoginAt: null,
      createdAt: created,
      updatedAt: created,
    },
  ],
  species: [
    { id: 1, name: "Dog", isActive: true, createdAt: created, updatedAt: created },
    { id: 2, name: "Cat", isActive: true, createdAt: created, updatedAt: created },
  ],
  breeds: [
    {
      id: 1,
      speciesId: 1,
      speciesName: "Dog",
      name: "Golden Retriever",
      isHdbApproved: false,
      isActive: true,
      createdAt: created,
      updatedAt: created,
    },
  ],
  vaccines: [
    {
      id: 1,
      name: "Rabies",
      description: "Core vaccine required for all dogs and cats.",
      applicableSpeciesId: null,
      applicableSpeciesName: null,
      recommendedIntervalDays: 365,
      isActive: true,
      createdAt: created,
      updatedAt: created,
    },
  ],
  specialisations: [{ id: 1, name: "Surgery", isActive: true, createdAt: created, updatedAt: created }],
  kennels,
  countries: [
    { code: "AU", name: "Australia", isActive: true },
    { code: "MY", name: "Malaysia", isActive: true },
    { code: "NZ", name: "New Zealand", isActive: true },
    { code: "SG", name: "Singapore", isActive: true },
    { code: "GB", name: "United Kingdom", isActive: true },
    { code: "US", name: "United States", isActive: true },
  ],
  stays: [],
  exams: [],
  drafts: new Map(),
  inspections: [],
  observations: [],
  schedules: [],
  administrations: [],
  pushTokens: new Map(),
}

function stayRow(id, name, kennelCode, species, sex, country, microchip, dob, arrivalOffset) {
  const k = kennels.find((x) => x.code === kennelCode)
  const c = db.countries.find((x) => x.code === country)
  return {
    id,
    name,
    kennelId: k.id,
    kennelCode: k.code,
    kennelBlock: k.block,
    species,
    sex,
    countryCode: country,
    countryName: c.name,
    microchip,
    dateOfBirth: dob,
    arrivalDate: addDays(today, arrivalOffset),
    releaseDate: null,
    status: "active-monitoring",
    createdBy: 5,
    createdAt: `${addDays(today, arrivalOffset)}T01:00:00Z`,
    updatedAt: `${addDays(today, arrivalOffset)}T01:00:00Z`,
  }
}
db.stays.push(
  stayRow(1, "Buddy", "KC1-2", "Dog", "Male", "AU", "900082000123456", "2020-05-15", -12),
  stayRow(2, "Mochi", "KC2-1", "Cat", "Female", "GB", "900082000654321", "2022-03-02", -5),
  stayRow(3, "Kopi", "KC2-4", "Dog", "Unknown", "MY", "900082000777888", "2021-08-20", 0)
)
db.exams.push(
  {
    id: 1,
    stayId: 1,
    vetStaffId: null,
    weightKg: 12.5,
    mentation: "Alert",
    examinedAt: `${addDays(today, -12)}T02:30:00Z`,
    recordedBy: 5,
    findings: [
      { id: 1, system: "skin", abnormal: false, note: null, photoKeys: [] },
      { id: 2, system: "eyes", abnormal: true, note: "Mild discharge", photoKeys: [] },
    ],
  },
  {
    id: 2,
    stayId: 2,
    vetStaffId: null,
    weightKg: 4.1,
    mentation: "Calm",
    examinedAt: `${addDays(today, -5)}T02:30:00Z`,
    recordedBy: 5,
    findings: [],
  }
)
db.inspections.push({
  id: 101,
  stayId: 1,
  inspectionDate: today,
  session: "AM",
  mentation: "Alert",
  food: "Full",
  stool: "Soft",
  urine: "Yes",
  otherFindings: null,
  systemFindings: [
    { id: 201, system: "skin", finding: "normal" },
    { id: 202, system: "eyes", finding: "abnormal" },
  ],
  recordedBy: 10,
  recordedAt: `${today}T00:05:00Z`,
})
// Seeded so Health cases / Review queue (derived from observations) have data.
db.observations.push({
  id: 900,
  stayId: 2,
  text: "Mochi scratching left ear, head shaking",
  submittedBy: 10,
  submittedAt: `${today}T00:20:00Z`,
  source: "observation",
  status: "ready",
  aiUnavailable: false,
  readyAt: `${today}T00:20:05Z`,
  media: [],
})
db.schedules.push(
  {
    id: 10,
    stayId: 1,
    item: "Amoxicillin",
    dose: "250mg",
    frequency: "2x daily",
    startDate: addDays(today, -2),
    endDate: addDays(today, 5),
    times: ["08:00", "18:00"],
  },
  {
    id: 11,
    stayId: 2,
    item: "Ear drops",
    dose: "2 drops",
    frequency: "1x daily",
    startDate: addDays(today, -1),
    endDate: addDays(today, 3),
    times: ["06:00"],
  }
)
db.administrations.push({
  id: 5,
  scheduleId: 10,
  animalId: 1,
  slot: `${today}T08:00`,
  administeredAt: Date.now() - 3_600_000,
  by: "Officer John",
  remarks: "Given with food",
})

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

function medicationAnimal(stay) {
  const exam = db.exams.some((e) => e.stayId === stay.id)
  const insp = (s) => (db.inspections.some((i) => i.stayId === stay.id && i.inspectionDate === today && i.session === s) ? "done" : "due")
  return {
    id: stay.id,
    name: stay.name,
    kennel: stay.kennelCode,
    species: stay.species,
    sex: stay.sex,
    countryCode: stay.countryCode,
    microchip: stay.microchip,
    dateOfBirth: stay.dateOfBirth,
    arrivalDate: stay.arrivalDate,
    releaseDate: stay.releaseDate,
    status: stay.status,
    today: { arrivalExam: exam ? "done" : "due", amInspection: insp("AM"), pmInspection: insp("PM") },
  }
}

function slotsFor(stayId, date) {
  const now = Date.now()
  return db.schedules
    .filter((s) => s.stayId === stayId && s.startDate <= date && s.endDate >= date)
    .flatMap((s) =>
      s.times.map((time) => {
        const slot = `${date}T${time}`
        const administration = db.administrations.find((a) => a.scheduleId === s.id && a.slot === slot) ?? null
        const at = new Date(`${slot}:00`).getTime()
        const status = administration ? "administered" : at < now ? "overdue" : at - now <= 2 * 3_600_000 ? "due" : "upcoming"
        return {
          slot,
          scheduleId: s.id,
          item: s.item,
          dose: s.dose,
          frequency: s.frequency,
          startDate: s.startDate,
          endDate: s.endDate,
          time,
          status,
          administration,
        }
      })
    )
    .sort((a, b) => a.slot.localeCompare(b.slot))
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes = []
const route = (method, pattern, auth, handler) => {
  const keys = []
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`)
  routes.push({ method, re, keys, auth, handler })
}
const ANY = "any"
const ADMIN = "nparks_admin"
const STAFF = "aqc_staff"
const bool = (v) => (v === undefined ? undefined : v === "true")
const requireFields = (body, fields) => {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "")
  return missing.length ? err(400, `${missing[0]} is required.`) : null
}

// Auth
route("GET", "/api/v1/auth/authorize", null, ({ query }) => {
  if (!query.provider) return err(400, "provider is required.")
  const state = randomUUID()
  db.oidcStates.set(state, query.provider)
  const url = `http://localhost:${PORT}/mock-idp/authorize?state=${state}&redirect_uri=${encodeURIComponent(query.redirectUri ?? "")}`
  return { body: { authorizationUrl: url, state } }
})
route("POST", "/api/v1/auth/callback", null, ({ body }) => {
  const missing = requireFields(body, ["provider", "code", "state", "redirectUri"])
  if (missing) return missing
  if (!db.oidcStates.has(body.state) || body.code !== `code-${body.state}`) return err(401, "Token validation failed.")
  db.oidcStates.delete(body.state)
  const contractor = body.provider === "corppass"
  return { body: issueTokens({ sub: contractor ? "7" : "3", user_type: "aqc_staff", role: contractor ? "contractor" : "officer" }) }
})
route("POST", "/api/v1/auth/refresh", null, ({ body }) => {
  const claims = db.refreshTokens.get(body.refresh_token)
  if (!claims) return err(401, "Refresh token is invalid or expired.")
  db.refreshTokens.delete(body.refresh_token)
  return { body: issueTokens(claims) }
})
route("POST", "/api/v1/auth/logout", null, ({ body }) => {
  if (!body.refresh_token) return err(400, "refresh_token is required.")
  db.refreshTokens.delete(body.refresh_token)
  return { status: 204 }
})
route("POST", "/api/v1/auth/dev-token", null, ({ body }) => {
  if (!["pet_owner", "veterinarian", "nparks_admin", "aqc_staff"].includes(body.userType)) return err(400, "userType is invalid.")
  const claims = { sub: String(body.userId), user_type: body.userType, dev: true }
  if (body.userType === "aqc_staff") claims.role = body.aqcStaffRole ?? "officer"
  return { body: issueTokens(claims) }
})

// Admin
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- strips the internal flag
const publicAdmin = ({ deleted, ...a }) => a
route("POST", "/api/v1/admin/nparks-admins", ADMIN, ({ body }) => {
  const missing = requireFields(body, ["fullName", "workEmail"])
  if (missing) return missing
  if (db.admins.some((a) => !a.deleted && a.workEmail.toLowerCase() === String(body.workEmail).toLowerCase()))
    return err(409, "An admin with this email already exists.")
  const now = utcNow()
  const a = {
    id: db.seq.admin++,
    fullName: body.fullName,
    workEmail: body.workEmail,
    accountStatus: "inactive",
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deleted: false,
  }
  db.admins.push(a)
  return { status: 201, body: publicAdmin(a) }
})
route("GET", "/api/v1/admin/nparks-admins", ADMIN, ({ query }) => ({
  body: db.admins.filter((a) => !a.deleted && (!query.status || a.accountStatus === query.status)).map(publicAdmin),
}))
route("GET", "/api/v1/admin/nparks-admins/:id", ADMIN, ({ params }) => {
  const a = db.admins.find((x) => x.id === Number(params.id) && !x.deleted)
  return a ? { body: publicAdmin(a) } : err(404, "NParks admin not found.")
})
route("PATCH", "/api/v1/admin/nparks-admins/:id/status", ADMIN, ({ params, body }) => {
  if (!["active", "inactive", "suspended"].includes(body.status)) return err(400, "Invalid status value.")
  const a = db.admins.find((x) => x.id === Number(params.id) && !x.deleted)
  if (!a) return err(404, "NParks admin not found.")
  a.accountStatus = body.status
  a.updatedAt = utcNow()
  return { status: 204 }
})
route("DELETE", "/api/v1/admin/nparks-admins/:id", ADMIN, ({ params }) => {
  const a = db.admins.find((x) => x.id === Number(params.id) && !x.deleted)
  if (!a) return err(404, "NParks admin not found.")
  a.deleted = true
  return { status: 204 }
})
route("GET", "/api/v1/admin/veterinarians", ADMIN, ({ query }) => ({
  body: db.vets.filter((v) => !query.status || v.accountStatus === query.status),
}))
route("PATCH", "/api/v1/admin/veterinarians/:id/status", ADMIN, ({ params, body }) => {
  if (!["active", "inactive", "suspended"].includes(body.status)) return err(400, "Invalid status value.")
  const v = db.vets.find((x) => x.id === Number(params.id))
  if (!v) return err(404, "Veterinarian not found.")
  v.accountStatus = body.status
  return { status: 204 }
})

// Master data — reads: any authenticated user; writes: NParksAdmin
function simpleMaster(path, list, seqKey, label, extraCreate) {
  route("POST", path, ADMIN, ({ body }) => {
    const missing = requireFields(body, ["name"])
    if (missing) return missing
    const extra = extraCreate ? extraCreate(body) : {}
    if (extra.error) return extra.error
    if (db[list].some((x) => x.name.toLowerCase() === String(body.name).toLowerCase() && (extra.dupKey ? extra.dupKey(x) : true)))
      return err(409, `A ${label} with this name already exists${extra.dupKey ? " for the given species" : ""}.`)
    const now = utcNow()
    const row = { id: db.seq[seqKey]++, name: body.name, ...extra.fields, isActive: true, createdAt: now, updatedAt: now }
    db[list].push(row)
    return { status: 201, body: row }
  })
  route("PATCH", `${path}/:id/status`, ADMIN, ({ params, body }) => {
    const row = db[list].find((x) => x.id === Number(params.id))
    if (!row) return err(404, `${label.charAt(0).toUpperCase()}${label.slice(1)} not found.`)
    row.isActive = Boolean(body.isActive)
    row.updatedAt = utcNow()
    return { status: 204 }
  })
}
simpleMaster("/api/v1/master-data/species", "species", "species", "species")
route("GET", "/api/v1/master-data/species", ANY, ({ query }) => ({
  body: db.species.filter((s) => bool(query.isActive) === undefined || s.isActive === bool(query.isActive)),
}))
simpleMaster("/api/v1/master-data/breeds", "breeds", "breed", "breed", (body) => {
  const sp = db.species.find((s) => s.id === Number(body.speciesId))
  if (!sp) return { error: err(400, "Species not found.") }
  return {
    fields: { speciesId: sp.id, speciesName: sp.name, isHdbApproved: Boolean(body.isHdbApproved) },
    dupKey: (x) => x.speciesId === sp.id,
  }
})
route("GET", "/api/v1/master-data/breeds", ANY, ({ query }) => ({
  body: db.breeds.filter(
    (b) =>
      (!query.speciesId || b.speciesId === Number(query.speciesId)) &&
      (bool(query.isHdbApproved) === undefined || b.isHdbApproved === bool(query.isHdbApproved)) &&
      (bool(query.isActive) === undefined || b.isActive === bool(query.isActive))
  ),
}))
simpleMaster("/api/v1/master-data/vaccine-types", "vaccines", "vaccine", "vaccine type", (body) => {
  const sp = body.applicableSpeciesId == null ? null : db.species.find((s) => s.id === Number(body.applicableSpeciesId))
  if (body.applicableSpeciesId != null && !sp) return { error: err(400, "Species not found.") }
  return {
    fields: {
      description: body.description ?? "",
      applicableSpeciesId: sp?.id ?? null,
      applicableSpeciesName: sp?.name ?? null,
      recommendedIntervalDays: body.recommendedIntervalDays ?? null,
    },
  }
})
route("GET", "/api/v1/master-data/vaccine-types", ANY, ({ query }) => ({
  body: db.vaccines.filter(
    (v) =>
      (!query.speciesId || v.applicableSpeciesId === null || v.applicableSpeciesId === Number(query.speciesId)) &&
      (bool(query.isActive) === undefined || v.isActive === bool(query.isActive))
  ),
}))
simpleMaster("/api/v1/master-data/vet-specialisations", "specialisations", "spec", "vet specialisation")
route("GET", "/api/v1/master-data/vet-specialisations", ANY, ({ query }) => ({
  body: db.specialisations.filter((s) => bool(query.isActive) === undefined || s.isActive === bool(query.isActive)),
}))

// Animal stays & reference data (AqcStaff)
route("POST", "/api/v1/animals", STAFF, ({ body, claims }) => {
  const missing = requireFields(body, ["name", "species", "microchip", "kennelId", "countryCode", "arrivalDate"])
  if (missing) return missing
  if (!["Dog", "Cat", "Other"].includes(body.species)) return err(400, "species must be 'Dog', 'Cat' or 'Other'.")
  const k = kennels.find((x) => x.id === Number(body.kennelId))
  if (!k) return err(400, "Kennel not found.")
  const c = db.countries.find((x) => x.code === body.countryCode)
  if (!c) return err(400, "Country not found.")
  if (db.stays.some((s) => s.status === "active-monitoring" && s.microchip === body.microchip))
    return err(409, "An active stay already exists for this microchip.")
  const now = utcNow()
  const stay = {
    id: db.seq.stay++,
    name: body.name,
    kennelId: k.id,
    kennelCode: k.code,
    kennelBlock: k.block,
    species: body.species,
    sex: body.sex ?? "Unknown",
    countryCode: c.code,
    countryName: c.name,
    microchip: body.microchip,
    dateOfBirth: body.dateOfBirth ?? null,
    arrivalDate: body.arrivalDate,
    releaseDate: null,
    status: "active-monitoring",
    createdBy: Number(claims.sub),
    createdAt: now,
    updatedAt: now,
  }
  db.stays.push(stay)
  return { status: 201, body: stay }
})
route("GET", "/api/v1/animals/inspections/:inspectionId", STAFF, ({ params }) => {
  const i = db.inspections.find((x) => x.id === Number(params.inspectionId))
  return i ? { body: i } : err(404, `No daily inspection found with id ${params.inspectionId}.`)
})
route("GET", "/api/v1/animals/:id", STAFF, ({ params }) => {
  const s = db.stays.find((x) => x.id === Number(params.id))
  return s ? { body: s } : err(404, `Animal stay with id ${params.id} not found.`)
})
route("GET", "/api/v1/animals", STAFF, ({ query }) => {
  const q = (query.search ?? "").toLowerCase()
  return {
    body: db.stays.filter(
      (s) =>
        (!query.status || s.status === (query.status === "staying" ? "active-monitoring" : query.status)) &&
        (!query.species || s.species === query.species) &&
        (!q || s.name.toLowerCase().includes(q) || s.microchip.includes(q))
    ),
  }
})
route("PATCH", "/api/v1/animals/:id/status", STAFF, ({ params, body }) => {
  const s = db.stays.find((x) => x.id === Number(params.id))
  if (!s) return err(404, "Animal stay not found.")
  if (!["released", "deceased"].includes(body.status)) return err(400, "status must be 'released' or 'deceased'.")
  if (body.status === "released" && !body.releaseDate) return err(400, "releaseDate is required when status is 'released'.")
  if (s.status !== "active-monitoring") return err(409, "Animal stay is already released or deceased.")
  s.status = body.status
  s.releaseDate = body.releaseDate ?? null
  s.updatedAt = utcNow()
  return { status: 204 }
})
route("GET", "/api/v1/kennels", ANY, ({ query }) => ({
  body: kennels.filter((k) => bool(query.isActive) === undefined || k.isActive === bool(query.isActive)),
}))
route("GET", "/api/v1/countries", ANY, ({ query }) => ({
  body: db.countries.filter((c) => bool(query.isActive) === undefined || c.isActive === bool(query.isActive)),
}))

// Arrival exam & draft
const EXAM_SYSTEMS = ["skin", "eyes", "nose", "ears", "mouth", "hydration", "respiratory"]
route("POST", "/api/v1/animals/:id/exam", STAFF, ({ params, body, claims }) => {
  const s = db.stays.find((x) => x.id === Number(params.id))
  if (!s) return err(404, `Animal stay with id ${params.id} not found.`)
  if (db.exams.some((e) => e.stayId === s.id)) return err(409, `An arrival exam already exists for stay ${s.id}.`)
  if (!["Responsive", "Calm", "Active", "Alert"].includes(body.mentation)) return err(400, "mentation is invalid.")
  const findings = body.findings ?? []
  if (findings.some((f) => !EXAM_SYSTEMS.includes(f.system))) return err(400, "system is invalid.")
  if (new Set(findings.map((f) => f.system)).size !== findings.length) return err(400, "Each system may appear at most once.")
  const exam = {
    id: db.seq.exam++,
    stayId: s.id,
    vetStaffId: body.vetStaffId ?? null,
    weightKg: body.weightKg,
    mentation: body.mentation,
    examinedAt: utcNow(),
    recordedBy: Number(claims.sub),
    findings: findings.map((f) => ({ id: db.seq.finding++, ...f })),
  }
  db.exams.push(exam)
  return { status: 201, body: exam }
})
route("GET", "/api/v1/animals/:id/exam", STAFF, ({ params }) => {
  const e = db.exams.find((x) => x.stayId === Number(params.id))
  return e ? { body: e } : err(404, `No arrival exam found for stay ${params.id}.`)
})
route("PUT", "/api/v1/arrival-draft/exam", STAFF, ({ body, claims }) => {
  const d = db.drafts.get(claims.sub) ?? { detailsJson: null, examJson: null }
  d.examJson = {
    vetStaffId: body.vetStaffId ?? null,
    weightKg: body.weightKg ?? null,
    mentation: body.mentation ?? null,
    findings: body.findings ?? null,
  }
  d.updatedAt = utcNow()
  db.drafts.set(claims.sub, d)
  return { status: 204 }
})
route("GET", "/api/v1/arrival-draft", STAFF, ({ claims }) => {
  const d = db.drafts.get(claims.sub)
  return d ? { body: d } : err(404, "No arrival draft found for the current officer.")
})
route("DELETE", "/api/v1/arrival-draft", STAFF, ({ claims }) => {
  db.drafts.delete(claims.sub)
  return { status: 204 }
})

// Daily inspection
route("POST", "/api/v1/animals/:id/inspections", STAFF, ({ params, body, claims }) => {
  const s = db.stays.find((x) => x.id === Number(params.id))
  if (!s) return err(404, "Animal stay not found.")
  if (!["AM", "PM"].includes(body.session)) return err(400, "Session must be AM or PM.")
  if (s.status !== "active-monitoring" || !db.exams.some((e) => e.stayId === s.id))
    return err(409, "The stay must be in active-monitoring status.")
  if (db.inspections.some((i) => i.stayId === s.id && i.inspectionDate === body.inspectionDate && i.session === body.session))
    return err(409, `${body.session} inspection already recorded for this stay on ${body.inspectionDate}.`)
  const insp = {
    id: db.seq.insp++,
    stayId: s.id,
    inspectionDate: body.inspectionDate,
    session: body.session,
    mentation: body.mentation,
    food: body.food,
    stool: body.stool,
    urine: body.urine,
    otherFindings: body.otherFindings ?? null,
    systemFindings: (body.systemFindings ?? []).map((f) => ({ id: db.seq.finding++, ...f })),
    recordedBy: Number(claims.sub),
    recordedAt: utcNow(),
  }
  db.inspections.push(insp)
  return { status: 201, body: insp }
})
route("GET", "/api/v1/animals/:id/inspections", STAFF, ({ params, query }) => {
  const s = db.stays.find((x) => x.id === Number(params.id))
  if (!s) return err(404, "Animal stay not found.")
  return { body: db.inspections.filter((i) => i.stayId === s.id && (!query.date || i.inspectionDate === query.date)) }
})

// Observation
route("POST", "/api/v1/observations", STAFF, ({ body, claims }) => {
  if (!body.text || !String(body.text).trim()) return err(400, "Text is required.")
  if (body.stayId != null && !db.stays.some((s) => s.id === Number(body.stayId))) return err(404, "Animal stay not found.")
  const o = {
    id: db.seq.obs++,
    stayId: body.stayId ?? null,
    text: body.text,
    submittedBy: Number(claims.sub),
    submittedAt: utcNow(),
    source: "staff",
    status: "processing",
    aiUnavailable: false,
    readyAt: null,
    media: (body.media ?? []).map((m, i) => ({ id: i + 1, ...m })),
  }
  db.observations.push(o)
  setTimeout(() => {
    o.status = "ready"
    o.readyAt = utcNow()
  }, 1200)
  return { status: 201, body: o }
})
route("GET", "/api/v1/observations/:id", STAFF, ({ params }) => {
  const o = db.observations.find((x) => x.id === Number(params.id))
  return o ? { body: o } : err(404, `No observation found with id ${params.id}.`)
})
route("GET", "/api/v1/animals/:id/observations", STAFF, ({ params }) => {
  if (!db.stays.some((s) => s.id === Number(params.id))) return err(404, "Animal stay not found.")
  return { body: db.observations.filter((o) => o.stayId === Number(params.id)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) }
})

// Medication
route("GET", "/api/v1/medication/animals", STAFF, ({ query }) => {
  if (!query.date) return err(400, "Query parameter 'date' is required (YYYY-MM-DD).")
  const rows = db.stays
    .filter((s) => s.status === "active-monitoring")
    .map((s) => {
      const slots = slotsFor(s.id, query.date)
      const scheduleCount = new Set(slots.map((x) => x.scheduleId)).size
      return {
        animal: medicationAnimal(s),
        scheduleCount,
        dueCount: slots.filter((x) => x.status === "due").length,
        overdueCount: slots.filter((x) => x.status === "overdue").length,
      }
    })
    .filter((r) => r.scheduleCount > 0)
    .sort((a, b) => b.overdueCount - a.overdueCount)
  return { body: rows }
})
route("GET", "/api/v1/animals/:id/medication", STAFF, ({ params, query }) => {
  if (!query.date) return err(400, "Query parameter 'date' is required (YYYY-MM-DD).")
  const s = db.stays.find((x) => x.id === Number(params.id))
  if (!s) return err(404, "Animal stay not found.")
  const slots = slotsFor(s.id, query.date)
  return { body: { animal: medicationAnimal(s), scheduleCount: new Set(slots.map((x) => x.scheduleId)).size, slots } }
})
route("POST", "/api/v1/medication/administrations", STAFF, ({ body, claims }) => {
  if (!body.slot) return err(400, "Slot is required.")
  const sch = db.schedules.find((x) => x.id === Number(body.scheduleId))
  if (!sch) return err(404, "Medication schedule not found.")
  if (db.administrations.some((a) => a.scheduleId === sch.id && a.slot === body.slot))
    return { status: 409, body: { error: "MedicationError", kind: "already_recorded", message: "Dose already recorded for this slot." } }
  const a = {
    id: db.seq.adm++,
    scheduleId: sch.id,
    animalId: sch.stayId,
    slot: body.slot,
    administeredAt: Date.now(),
    by: `Officer ${claims.sub}`,
    remarks: body.remarks ?? null,
  }
  db.administrations.push(a)
  return { status: 201, body: a }
})

// Media
route("POST", "/api/v1/media/presign", STAFF, ({ body }) => {
  const items = body.items ?? []
  if (items.length === 0) return err(400, "At least one item is required.")
  if (items.length > 5) return err(400, "Maximum 5 items per request.")
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z")
  return {
    body: {
      items: items.map((i) => {
        const key = `${i.context === "exam" ? "uploads/exams" : "obs"}/${today.slice(0, 7).replace("-", "/")}/${randomUUID().slice(0, 8)}_${i.filename}`
        return { mediaKey: key, uploadUrl: `http://localhost:${PORT}/mock-storage/${encodeURIComponent(key)}`, expiresAt }
      }),
    },
  }
})

// Notifications (push tokens)
route("PUT", "/api/v1/me/push-token", STAFF, ({ body, claims }) => {
  if (!["android", "ios"].includes(body.platform))
    return { status: 400, body: { error: "validation-error", message: "Platform must be 'android' or 'ios'.", field: "platform" } }
  db.pushTokens.set(`${claims.sub}:${body.platform}`, body.token)
  return { status: 204 }
})
route("DELETE", "/api/v1/me/push-token", STAFF, ({ query, claims }) => {
  if (!["android", "ios"].includes(query.platform))
    return { status: 400, body: { error: "validation-error", message: "Platform must be 'android' or 'ios'.", field: "platform" } }
  db.pushTokens.delete(`${claims.sub}:${query.platform}`)
  return { status: 204 }
})

// ---------------------------------------------------------------------------
// Server (+ a fake IdP page and object storage for local OIDC/media testing)
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`)
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" }
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end()

  if (url.pathname === "/mock-idp/authorize") {
    const target = `${url.searchParams.get("redirect_uri")}?code=code-${url.searchParams.get("state")}&state=${url.searchParams.get("state")}`
    return res.writeHead(302, { Location: target }).end()
  }
  if (url.pathname.startsWith("/mock-storage/") && req.method === "PUT") {
    req.resume()
    return req.on("end", () => res.writeHead(200, cors).end())
  }

  const chunks = []
  for await (const c of req) chunks.push(c)
  let body = {}
  if (chunks.length) {
    try {
      body = JSON.parse(Buffer.concat(chunks).toString() || "{}")
    } catch {
      return send(res, { status: 400, body: { error: "Malformed JSON body." } })
    }
  }
  const query = Object.fromEntries(url.searchParams)
  for (const r of routes) {
    if (r.method !== req.method) continue
    const m = r.re.exec(url.pathname)
    if (!m) continue
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
    let claims = null
    if (r.auth) {
      claims = readToken(req)
      if (!claims) return send(res, { status: 401 })
      if (r.auth !== ANY && claims.user_type !== r.auth) return send(res, { status: 403 })
    }
    return send(res, r.handler({ params, query, body, claims }))
  }
  send(res, { status: 404 })
})

function send(res, { status = 200, body }) {
  if (body === undefined) return res.writeHead(status).end()
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(body))
}

server.listen(PORT, () => console.log(`NParksPetHealth contract mock listening on http://localhost:${PORT}`))
