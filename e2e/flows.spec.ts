import { expect, test, type Page } from "@playwright/test"

async function signIn(page: Page, account: string) {
  await page.goto("/login?switch=1")
  await page.getByRole("radio", { name: new RegExp(account) }).click()
  await page.getByRole("button", { name: /Continue with/ }).click()
  await page.waitForURL(/\/operations/)
}

test.describe("key workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
    await page.evaluate(() => window.localStorage.clear())
  })

  test("switch demo account from the account menu (FE-003)", async ({ page }) => {
    await signIn(page, "J. Tan")
    // Client-side navigation keeps the login page alive in a hidden Activity; its
    // previous "signing in" state must not leave the button stuck on loading.
    await page.getByRole("button", { name: "Account menu" }).click()
    await page.getByRole("menuitem", { name: /Switch demo account/ }).click()
    await page.waitForURL(/\/login\?switch=1/)
    const cont = page.getByRole("button", { name: /Continue with Officer IdP/ })
    await expect(cont).toBeEnabled()
    await page.getByRole("radio", { name: /Lim W/ }).click()
    await cont.click()
    await page.waitForURL(/\/operations/)
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Lim W")
  })

  test("triage a review-queue item into a new case (FE-017)", async ({ page }) => {
    await signIn(page, "J. Tan")
    await page.goto("/review?id=O-3402")
    await expect(page.getByText("Small brown dog in KC2 corner run").first()).toBeVisible()
    await page.getByRole("radio", { name: /KC2-4 · Coco/ }).click()
    await page.getByRole("radio", { name: /New case/ }).click()
    await page.getByRole("button", { name: "Confirm triage" }).click()
    await expect(page.getByText(/triaged|routed|Case C-01/i).first()).toBeVisible()
    await expect(page.getByText("“Small brown dog in KC2 corner run scratching right ear a lot, some redness.”")).toHaveCount(0)
  })

  test("close a case with a reason, then reopen it (FE-016)", async ({ page }) => {
    await signIn(page, "J. Tan")
    await page.goto("/cases?id=C-0139")
    await page
      .getByRole("button", { name: /Close case/ })
      .first()
      .click()
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"))
    await dialog.getByText("Resolved — signs cleared").click()
    await dialog.getByRole("textbox").fill("Cough resolved, nasal discharge cleared for 3 inspections.")
    await dialog.getByRole("button", { name: "Close case" }).click()
    await expect(page.getByRole("button", { name: /Reopen case/ })).toBeVisible()
    await page.getByRole("button", { name: /Reopen case/ }).click()
    await page
      .getByRole("dialog")
      .or(page.getByRole("alertdialog"))
      .getByRole("button", { name: /Reopen/ })
      .click()
    await expect(page.getByRole("button", { name: /Close case/ }).first()).toBeVisible()
  })

  test("record an overdue dose; double recording is blocked (FE-013)", async ({ page }) => {
    await signIn(page, "J. Tan")
    await page.goto("/medication")
    const row = page.getByRole("row", { name: /Ear drops/ })
    await row.getByRole("button", { name: "Record dose" }).click()
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Record/ })
      .last()
      .click()
    await expect(page.getByRole("row", { name: /Ear drops/ }).getByText(/Recorded/)).toBeVisible()
  })

  test("new observation is analysed by AI and confirmed (FE-010 / FE-012)", async ({ page }) => {
    await signIn(page, "J. Tan")
    await page
      .getByRole("button", { name: /New observation/ })
      .first()
      .click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("textbox", { name: /what|describe|observation/i }).fill("KC2-2 Yang Yang soft stool again after breakfast")
    await dialog.getByRole("button", { name: /Submit/ }).click()
    await expect(dialog.getByText(/Confirm & route/)).toBeVisible({ timeout: 10_000 })
    await dialog.getByRole("button", { name: /Confirm & route/ }).click()
    await expect(page.getByText(/C-0142/).first()).toBeVisible()
  })

  test("admin adds a contractor user (FE-023)", async ({ page }) => {
    await signIn(page, "S. Wong")
    await page.goto("/users")
    await page.getByRole("button", { name: "Add user" }).click()
    const drawer = page.getByRole("dialog")
    await drawer.getByRole("radio", { name: "Contractor IdP" }).click()
    await drawer.getByLabel(/Work email/).fill("j.ng@petcare-contractor.sg")
    await drawer.getByLabel(/Display name/).fill("J. Ng")
    await drawer.getByRole("button", { name: /Add$/ }).click()
    await page
      .getByRole("menuitemcheckbox", { name: "KC1" })
      .or(page.getByRole("option", { name: /KC1/ }))
      .or(page.getByRole("button", { name: /^KC1/ }))
      .first()
      .click()
    await page.keyboard.press("Escape")
    await drawer.getByRole("button", { name: "Add user" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.getByRole("radio", { name: /Active/ }).click()
    await page.getByPlaceholder("Search name or email").fill("j.ng")
    await expect(page.getByRole("row", { name: /J\. Ng/ })).toContainText("Invited")
  })
})
