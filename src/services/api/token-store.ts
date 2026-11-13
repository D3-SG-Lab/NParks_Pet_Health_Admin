/**
 * Access/refresh tokens from `/auth/callback`, `/auth/dev-token` or `/auth/refresh`.
 * Kept in sessionStorage (cleared when the tab closes), like the session itself.
 */
import type { TokenResponse } from "./types"

const KEY = "aqc-admin-tokens"

export interface StoredTokens {
  accessToken: string
  /** Empty for dev tokens: the API returns `refresh_token: ""` there. */
  refreshToken: string
  tokenType: string
  /** Epoch ms when the access token expires (from `expires_in`). */
  expiresAt: number
}

let memory: StoredTokens | null = null

export function getTokens(): StoredTokens | null {
  if (memory) return memory
  try {
    const raw = window.sessionStorage.getItem(KEY)
    memory = raw ? (JSON.parse(raw) as StoredTokens) : null
  } catch {
    memory = null
  }
  return memory
}

export function setTokens(res: TokenResponse): StoredTokens {
  memory = {
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? "",
    tokenType: res.token_type || "Bearer",
    expiresAt: Date.now() + Math.max(0, res.expires_in) * 1000,
  }
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    // storage blocked: tokens stay in memory for this page
  }
  return memory
}

export function clearTokens(): void {
  memory = null
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
