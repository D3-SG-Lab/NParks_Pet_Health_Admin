import { defineConfig, devices } from "@playwright/test"

/**
 * API-mode e2e: the app built with NEXT_PUBLIC_API_BASE_URL pointing at the
 * contract mock (mock-api/server.mjs), which implements the Postman collection.
 * Run with `npm run test:e2e:api` (it builds into .next-api first).
 */
const PORT = Number(process.env.E2E_API_PORT ?? 3108)
const MOCK_PORT = 7999

export default defineConfig({
  testDir: "./e2e-api",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `PORT=${MOCK_PORT} TOKEN_TTL=900 node mock-api/server.mjs`,
      url: `http://localhost:${MOCK_PORT}/api/v1/kennels`,
      // The mock answers 401 without a token; any response means it is up.
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `NEXT_DIST_DIR=.next-api NEXT_PUBLIC_API_BASE_URL=http://localhost:${MOCK_PORT} NEXT_PUBLIC_ENABLE_OIDC_LOGIN=true npm run start -- -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
