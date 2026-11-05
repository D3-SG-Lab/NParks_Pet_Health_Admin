/**
 * Application configuration. All values can be overridden with NEXT_PUBLIC_* env
 * variables (see .env.example).
 */
export const APP_CONFIG = {
  name: "AQC Animal Health",
  subtitle: "Officer workbench",
  environmentLabel: process.env.NEXT_PUBLIC_ENV_LABEL ?? "UAT · POC build 1.0.0",
  /**
   * The mock data set is anchored to the design reference day (Wed 21 Oct 2026,
   * 08:42, AM session). The demo clock starts here and advances in real time.
   * Set to "real" to use the browser clock instead.
   */
  demoNow: process.env.NEXT_PUBLIC_DEMO_NOW ?? "2026-10-21T08:42:00",
  /** Simulated API latency in ms (mock service layer). */
  mockLatencyMs: Number(process.env.NEXT_PUBLIC_MOCK_LATENCY_MS ?? 280),
  /** Base URL of the real API — when empty, the in-browser mock service layer is used. */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
  storageKey: "aqc-admin-db",
  storageVersion: 1,
} as const

/** AM/PM inspection sessions (Inspections p.6: "Session closes 11:00", PM "Due 16:00"). */
export const SESSIONS = {
  AM: { due: "08:00", closes: "11:00" },
  PM: { due: "16:00", closes: "19:00" },
} as const

export const PAGE_SIZE = 10
