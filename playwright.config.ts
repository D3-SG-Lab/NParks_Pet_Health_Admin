import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_PORT ?? 3107)

/**
 * Demo-data (mock service layer) e2e. `npm run test:e2e` builds into .next-mock
 * with NEXT_PUBLIC_API_BASE_URL emptied, so a configured real API in .env
 * doesn't switch these tests to API mode. API mode: playwright.api.config.ts.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `NEXT_DIST_DIR=.next-mock NEXT_PUBLIC_API_BASE_URL= npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
