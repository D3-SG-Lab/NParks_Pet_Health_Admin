import { expect, test, type Page } from "@playwright/test"

const OFFICER_ROUTES = [
  "/operations",
  "/animals",
  "/animals/a-yangyang",
  "/animals/new",
  "/cases?id=C-0142",
  "/review",
  "/inspections",
  "/medication",
]
const ADMIN_ROUTES = [
  "/audit",
  "/users",
  "/master-data",
  "/master-data?tab=templates",
  "/master-data?tab=taxonomy",
  "/master-data?tab=glossary",
  "/master-data?tab=rules",
]
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
]
const SHOTS = process.env.E2E_SCREENSHOTS

async function signIn(page: Page, account = "S. Wong") {
  await page.goto("/login")
  await page.getByRole("radio", { name: new RegExp(account) }).click()
  await page.getByRole("button", { name: /Continue with/ }).click()
  await page.waitForURL(/\/operations/)
}

test("officer can sign in and sees the operations dashboard", async ({ page }) => {
  await page.goto("/login")
  await page.getByRole("button", { name: /Continue with Officer IdP/ }).click()
  await page.waitForURL(/\/operations/)
  await expect(page.getByRole("heading", { name: "Operations dashboard" })).toBeVisible()
  await expect(page.getByText("Yang Yang").first()).toBeVisible()
})

test("officer sees the admin section but is denied the admin pages", async ({ page }) => {
  await signIn(page, "J. Tan")
  const admin = page.getByRole("navigation", { name: "Admin" }).first()
  await expect(admin.getByRole("link", { name: /Users & roles/ })).toBeVisible()
  await admin.getByRole("link", { name: /Master data/ }).click()
  await expect(page.getByText(/don’t have access to administration/)).toBeVisible()
})

test("supervisor is denied the audit log", async ({ page }) => {
  await signIn(page, "M. Koh")
  await page.goto("/audit")
  await expect(page.getByText(/don’t have access/)).toBeVisible()
})

for (const vp of VIEWPORTS) {
  test(`all screens render without errors or horizontal scroll — ${vp.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text())
    })
    await page.setViewportSize({ width: vp.width, height: vp.height })
    const plan: [string, string[]][] = [
      ["J. Tan", OFFICER_ROUTES],
      ["S. Wong", ADMIN_ROUTES],
    ]
    for (const [account, routes] of plan) {
      await page.goto("/login?switch=1")
      await page.getByRole("radio", { name: new RegExp(account) }).click()
      await page.getByRole("button", { name: /Continue with/ }).click()
      await page.waitForURL(/\/operations/)
      for (const route of routes) {
        await page.goto(route)
        await page.waitForLoadState("networkidle")
        await page.waitForTimeout(900)
        await expect(page.locator("main")).toBeVisible()
        await expect(page.getByText(/Couldn’t load/)).toHaveCount(0)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `horizontal overflow on ${route} at ${vp.width}px`).toBeLessThanOrEqual(1)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}${route.replace(/[/?=]/g, "_")}.png`, fullPage: true })
      }
    }
    expect(errors, errors.join("\n")).toEqual([])
  })
}
