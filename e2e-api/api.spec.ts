import { expect, test, type Page, type Request } from "@playwright/test"

/**
 * API mode against the contract mock (mock-api/server.mjs). Each test checks
 * the request the UI sends and what it renders from the response. Tests run
 * in order against one mock instance (in-memory data).
 */

const API = "/backend/api/v1"

async function devLogin(page: Page, opts: { admin?: boolean; role?: string; id?: string } = {}) {
  await page.goto("/login")
  if (opts.admin) {
    await page.getByRole("combobox", { name: "Account type" }).click()
    await page.getByRole("option", { name: "NParks admin" }).click()
  } else if (opts.role) {
    await page.getByRole("combobox", { name: "Staff role" }).click()
    await page.getByRole("option", { name: opts.role }).click()
  }
  await page.getByLabel("User id").fill(opts.id ?? "1")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL(/\/operations/)
}

/** Waits for the API request matching method + path and returns its JSON body. */
async function sent(page: Page, method: string, path: RegExp, action: () => Promise<unknown>) {
  const [req] = await Promise.all([
    page.waitForRequest((r: Request) => r.method() === method && r.url().includes(API) && path.test(r.url().split(API)[1])),
    action(),
  ])
  return req.postDataJSON() as Record<string, unknown>
}

const dialog = (page: Page) => page.getByRole("alertdialog").or(page.getByRole("dialog"))

test.describe.configure({ mode: "serial" })

test("dev sign-in reads identity from the token; mock-only screens are labelled", async ({ page }) => {
  const body = await sent(page, "POST", /^\/auth\/dev-token$/, () => devLogin(page))
  expect(body).toEqual({ userId: 1, userType: "aqc_staff", aqcStaffRole: "officer" })
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Officer 1")
  await expect(page.getByText(/Demo data · no API yet/)).toBeVisible()
  await page.goto("/cases")
  await expect(page.getByText(/Health cases has no endpoint/)).toBeVisible()
})

test("animals list, server-side search and profile come from the API", async ({ page }) => {
  await devLogin(page)
  await page.goto("/animals")
  await expect(page.getByRole("cell", { name: /Buddy/ })).toBeVisible()
  await expect(page.getByRole("cell", { name: /Mochi/ })).toBeVisible()
  const search = page.waitForRequest((r) => r.url().includes(`${API}/animals?`) && r.url().includes("search=mochi"))
  await page.getByPlaceholder("Kennel, name or microchip").fill("mochi")
  await search
  await expect(page.getByRole("cell", { name: /Buddy/ })).toHaveCount(0)

  await page.goto("/animals/1")
  await expect(page.getByRole("heading", { name: "Buddy" })).toBeVisible()
  await expect(page.getByText(/Eyes abnormal: Mild discharge/)).toBeVisible()
  await expect(page.getByText(/Amoxicillin · 250mg/)).toBeVisible()
  await expect(page.getByText("AI summaries are not available from the API yet.")).toBeVisible()
  await expect(page.getByRole("button", { name: /^Edit$/ })).toHaveCount(0)
})

test("new arrival posts the stay, then the exam (with server draft)", async ({ page }) => {
  await devLogin(page)
  await page.goto("/animals/new")
  await page.getByLabel("Pet name").fill("Biscuit")
  await page.getByRole("combobox", { name: "Species" }).click()
  await page.getByRole("option", { name: "Cat", exact: true }).click()
  await page.getByRole("radio", { name: "Unknown" }).click()
  await page.getByRole("combobox", { name: "Country of origin" }).click()
  await page.getByRole("option", { name: "Australia" }).click()
  await page.getByLabel("Microchip no.").fill("900111222333444")
  await page.getByRole("combobox", { name: "Kennel or room" }).click()
  await page.getByRole("option", { name: /KC1-1/ }).click()
  await expect(page.getByLabel("Breed")).toHaveCount(0)
  const stay = await sent(page, "POST", /^\/animals$/, () => page.getByRole("button", { name: /Continue to arrival exam/ }).click())
  expect(stay).toMatchObject({
    name: "Biscuit",
    kennelId: 1,
    species: "Cat",
    sex: "Unknown",
    countryCode: "AU",
    microchip: "900111222333444",
  })
  expect(stay.arrivalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(stay.dateOfBirth).toBeNull()
  await page.waitForURL(/animal=\d+/)

  await expect(page.getByRole("combobox", { name: "Examining vet" })).toHaveCount(0)
  await page.getByLabel("Weight (kg)").fill("4.2")
  await page.getByRole("radio", { name: "Abnormal" }).nth(1).click()
  await page.getByLabel("Eyes note").fill("Slight discharge")
  const draft = await sent(page, "PUT", /^\/arrival-draft\/exam$/, () => page.waitForTimeout(1500))
  expect(draft).toMatchObject({ weightKg: 4.2, mentation: "Responsive" })
  const exam = await sent(page, "POST", /^\/animals\/\d+\/exam$/, () => page.getByRole("button", { name: "Complete exam" }).click())
  expect(exam).toMatchObject({ vetStaffId: null, weightKg: 4.2, mentation: "Responsive" })
  expect(exam.findings).toContainEqual({ system: "eyes", abnormal: true, note: "Slight discharge", photoKeys: [] })
  await page.waitForURL(/\/animals\/\d+$/)
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible()
})

test("duplicate microchip shows the API's 409 message on the field", async ({ page }) => {
  await devLogin(page)
  await page.goto("/animals/new")
  await page.getByLabel("Pet name").fill("Twin")
  await page.getByRole("combobox", { name: "Species" }).click()
  await page.getByRole("option", { name: "Dog", exact: true }).click()
  await page.getByRole("combobox", { name: "Country of origin" }).click()
  await page.getByRole("option", { name: "Singapore" }).click()
  await page.getByLabel("Microchip no.").fill("900082000123456")
  await page.getByRole("combobox", { name: "Kennel or room" }).click()
  await page.getByRole("option").first().click()
  await page.getByRole("button", { name: /Continue to arrival exam/ }).click()
  await expect(page.getByText("An active stay already exists for this microchip.")).toBeVisible()
})

test("daily inspection posts the fixed API fields and is read-only afterwards", async ({ page }) => {
  await devLogin(page)
  await page.goto("/inspections")
  await page.getByRole("button", { name: /KC2-1/ }).first().click()
  await page.getByRole("radio", { name: "Soft" }).click()
  const body = await sent(page, "POST", /^\/animals\/2\/inspections$/, () => page.getByRole("button", { name: /Save inspection/ }).click())
  expect(body).toMatchObject({ mentation: "Responsive", food: "Full", stool: "Soft", urine: "Yes", otherFindings: null })
  expect(body.systemFindings).toHaveLength(7)
  expect(body.systemFindings).toContainEqual({ system: "cardiorespiratory", finding: "normal" })
  await page.getByRole("button", { name: /KC2-1/ }).first().click()
  await expect(page.getByText(/can’t be edited — the API has no update endpoint/)).toBeVisible()
})

test("observation uploads media through presign, then posts and polls", async ({ page }) => {
  await devLogin(page)
  await page.goto("/animals/2")
  await page.getByRole("button", { name: "New observation" }).click()
  await page.getByLabel(/What did you see/).fill("Mochi scratching right ear.")
  await page.locator("#obs-files").setInputFiles({ name: "ear.png", mimeType: "image/png", buffer: Buffer.from("89504e47", "hex") })
  const presign = page.waitForRequest((r) => r.url().endsWith(`${API}/media/presign`))
  const body = await sent(page, "POST", /^\/observations$/, () =>
    dialog(page)
      .getByRole("button", { name: /Submit|Send/ })
      .last()
      .click()
  )
  expect((await presign).postDataJSON()).toEqual({
    items: [{ mediaKind: "photo", context: "observation", filename: "ear.png", contentType: "image/png" }],
  })
  expect(body).toMatchObject({ stayId: 2, text: "Mochi scratching right ear." })
  expect((body.media as unknown[])[0]).toMatchObject({ mediaKind: "photo", sortOrder: 0, durationSec: null })
  await expect(dialog(page).getByText("Observation saved")).toBeVisible({ timeout: 15_000 })
})

test("medication: due list from the API, dose recorded for the pending slot", async ({ page }) => {
  await devLogin(page)
  await page.goto("/medication")
  await expect(page.getByRole("cell", { name: /Ear drops/ })).toBeVisible()
  await expect(page.getByText("Add schedule")).toHaveCount(0)
  const row = page.getByRole("row", { name: /Ear drops/ })
  await row.getByRole("button", { name: "Record dose" }).click()
  const body = await sent(page, "POST", /^\/medication\/administrations$/, () =>
    dialog(page)
      .getByRole("button", { name: /Record/ })
      .last()
      .click()
  )
  expect(body).toMatchObject({ scheduleId: 11 })
  expect(String(body.slot)).toMatch(/^\d{4}-\d{2}-\d{2}T06:00$/)
  await expect(page.getByRole("row", { name: /Ear drops/ }).getByRole("button", { name: "Record dose" })).toHaveCount(0)
})

test("release patches the stay status with today's date", async ({ page }) => {
  await devLogin(page)
  await page.goto("/animals/3")
  await page.getByRole("button", { name: /Release animal/ }).click()
  const body = await sent(page, "PATCH", /^\/animals\/3\/status$/, () =>
    dialog(page).getByRole("button", { name: "Release animal" }).click()
  )
  expect(body.status).toBe("released")
  expect(body.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  await expect(page.getByText("Released", { exact: true }).first()).toBeVisible()
})

test("admin: NParks admins are created, suspended and deleted through the API", async ({ page }) => {
  await devLogin(page, { admin: true })
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("John Doe")
  await page.goto("/users")
  await expect(page.getByText("john.doe@nparks.gov.sg")).toBeVisible()
  await page.getByRole("button", { name: "Add user" }).click()
  await page.getByLabel("Work email").fill("jane.tan@nparks.gov.sg")
  await page.getByLabel("Display name").fill("Jane Tan")
  const created = await sent(page, "POST", /^\/admin\/nparks-admins$/, () => page.getByRole("button", { name: "Add user" }).last().click())
  expect(created).toEqual({ fullName: "Jane Tan", workEmail: "jane.tan@nparks.gov.sg" })
  await expect(page.getByText("jane.tan@nparks.gov.sg")).toBeVisible()

  await page.getByRole("button", { name: "Disable Jane Tan" }).click()
  const status = await sent(page, "PATCH", /^\/admin\/nparks-admins\/\d+\/status$/, () =>
    dialog(page)
      .getByRole("button", { name: /Disable/ })
      .last()
      .click()
  )
  expect(status).toEqual({ status: "suspended" })

  await page
    .getByRole("radio", { name: /Disabled/ })
    .or(page.getByRole("button", { name: /^Disabled/ }))
    .first()
    .click()
  await page.getByRole("button", { name: "Delete Jane Tan" }).click()
  const del = page.waitForRequest((r) => r.method() === "DELETE" && /\/admin\/nparks-admins\/\d+$/.test(r.url()))
  await dialog(page).getByRole("button", { name: "Delete account" }).click()
  await del
  await expect(page.getByText("jane.tan@nparks.gov.sg")).toHaveCount(0)
})

test("admin: species are created and deactivated; kennels are read-only", async ({ page }) => {
  await devLogin(page, { admin: true })
  await page.goto("/master-data?tab=species")
  await page.getByRole("button", { name: "Add species" }).click()
  await page.getByLabel("Species name").fill("Rabbit")
  const created = await sent(page, "POST", /^\/master-data\/species$/, () =>
    dialog(page).getByRole("button", { name: "Add species" }).click()
  )
  expect(created).toEqual({ name: "Rabbit" })
  await page.getByRole("switch", { name: /Disable Rabbit/ }).click()
  const status = await sent(page, "PATCH", /^\/master-data\/species\/\d+\/status$/, () => dialog(page).getByRole("button").last().click())
  expect(status).toEqual({ isActive: false })

  await page.goto("/master-data?tab=kennels")
  await expect(page.getByText("KC1-1").first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Add kennel" })).toHaveCount(0)
  await expect(page.getByText(/Kennel occupancy isn’t shown/)).toBeVisible()
})

test("OIDC: authorize → identity provider → /auth/callback → app", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("radio", { name: "Contractor IdP" }).click()
  const authorize = page.waitForRequest((r) => r.url().includes(`${API}/auth/authorize`))
  await page.getByRole("button", { name: /Continue with Contractor IdP/ }).click()
  const url = new URL((await authorize).url())
  expect(url.searchParams.get("provider")).toBe("corppass")
  expect(url.searchParams.get("redirectUri")).toMatch(/\/auth\/callback$/)
  await page.waitForURL(/\/operations/)
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Contractor 7")
})
