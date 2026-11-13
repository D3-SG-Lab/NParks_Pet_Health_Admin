/**
 * Real-API configuration (NParksPetHealth API v1).
 *
 * API mode is on when `NEXT_PUBLIC_API_BASE_URL` is set. The browser never calls
 * that host directly: requests go to the same-origin `/backend` path and the
 * route handler in src/app/backend/[...path]/route.ts forwards them to the API. The API sends no CORS headers,
 * so a direct cross-origin call would be blocked by the browser.
 */
import type { IdentityProvider } from "@/types/domain"

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "")

/** Same-origin prefix that src/app/backend/[...path]/route.ts forwards to `${API_BASE_URL}/api/v1`. */
export const API_PROXY_PREFIX = "/backend/api/v1"

export function isApiMode(): boolean {
  return API_BASE_URL !== ""
}

/**
 * Sign-in through `POST /auth/dev-token` (Development-only on the API). This is
 * the login method for now, so it is on unless NEXT_PUBLIC_ENABLE_DEV_LOGIN=false.
 */
export const DEV_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "false"

/** OIDC sign-in (`/auth/authorize` → IdP → `/auth/callback`). Off until NEXT_PUBLIC_ENABLE_OIDC_LOGIN=true. */
export const OIDC_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_OIDC_LOGIN === "true"

/**
 * OIDC provider used by each identity-provider button. The collection only
 * defines `singpass` and `corppass`; the mapping is configurable.
 */
export const OIDC_PROVIDER: Record<IdentityProvider, "singpass" | "corppass"> = {
  officer: process.env.NEXT_PUBLIC_OIDC_PROVIDER_OFFICER === "corppass" ? "corppass" : "singpass",
  contractor: process.env.NEXT_PUBLIC_OIDC_PROVIDER_CONTRACTOR === "singpass" ? "singpass" : "corppass",
}

/** Path of the OIDC redirect page; the full URL must be registered with the IdP. */
export const OIDC_CALLBACK_PATH = "/auth/callback"
