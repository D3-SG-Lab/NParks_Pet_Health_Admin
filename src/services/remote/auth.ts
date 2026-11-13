/**
 * Real-API sign-in (Auth folder of the collection).
 *
 * - OIDC: `GET /auth/authorize` → IdP → `/auth/callback` page → `POST /auth/callback`.
 * - Development: `POST /auth/dev-token` (404 outside Development).
 * - `POST /auth/refresh` runs in the Axios interceptor; `POST /auth/logout` on sign-out.
 *
 * There is no profile endpoint, so the signed-in user is built from the token
 * claims (`sub`, `user_type`, `role`). NParks admins get their name from
 * `GET /admin/nparks-admins/{id}`. The user is also registered in the local
 * store so screens that still run on mock data know who is acting.
 */
import { nowISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import { ROLE_LABEL } from "@/config/rbac"
import { useSessionStore } from "@/stores/session-store"
import type { IdentityProvider, Role, User } from "@/types/domain"

import { adminApi, authApi } from "../api/api-client"
import { setSessionExpiredHandler } from "../api/axios-instance"
import { OIDC_CALLBACK_PATH, OIDC_PROVIDER } from "../api/config"
import { readClaims, type AccessClaims } from "../api/jwt"
import { clearTokens, getTokens, setTokens } from "../api/token-store"
import type { ApiUserType, AqcStaffRole, OidcProvider, TokenResponse } from "../api/types"
import { appendAudit, write } from "../core"

const OIDC_KEY = "aqc-admin-oidc"

function roleFor(claims: AccessClaims): Role {
  if (claims.userType === "nparks_admin") return "admin"
  if (claims.userType === "aqc_staff" && claims.staffRole) return claims.staffRole
  if (claims.userType === "aqc_staff") throw new ApiError("FORBIDDEN", "Your AQC staff account has no role assigned.")
  throw new ApiError("FORBIDDEN", "This account type can’t use the admin workbench. Sign in with an AQC staff or NParks admin account.")
}

export const apiUserId = (claims: Pick<AccessClaims, "userType" | "sub">) => `api-${claims.userType ?? "user"}-${claims.sub}`

/** Stores the tokens, resolves the user and starts the session. */
async function startSession(tokens: TokenResponse, idpHint?: IdentityProvider): Promise<User> {
  if (!tokens.access_token) throw new ApiError("UNAUTHENTICATED", "The sign-in response had no access token.")
  setTokens(tokens)
  let claims: AccessClaims
  let role: Role
  try {
    claims = readClaims(tokens.access_token)
    role = roleFor(claims)
  } catch (e) {
    clearTokens()
    throw e instanceof ApiError ? e : new ApiError("UNAUTHENTICATED", "The access token could not be read.")
  }

  let name = claims.name ?? `${ROLE_LABEL[role]} ${claims.sub}`
  let email = claims.email ?? ""
  if (role === "admin") {
    try {
      const me = await adminApi.getNParksAdmin(Number(claims.sub))
      name = me.fullName
      email = me.workEmail
    } catch {
      // Name stays the role label: the token alone is enough to work.
    }
  }

  const id = apiUserId(claims)
  const at = nowISO()
  const user = write((db) => {
    const existing = db.users.find((u) => u.id === id)
    const next: User = {
      id,
      name,
      email,
      idp: role === "contractor" ? "contractor" : (idpHint ?? "officer"),
      role,
      // Kennel scope is enforced by the API; it is not part of the token.
      kennelScope: existing?.kennelScope ?? [],
      status: "active",
      lastLoginAt: at,
      createdAt: existing?.createdAt ?? at,
    }
    if (existing) Object.assign(existing, next)
    else db.users.push(next)
    appendAudit(db, next, {
      action: "Login",
      entityType: "Session",
      entityId: id,
      entityLabel: `Session · ${claims.userType ?? "API"}`,
      after: { source: "NParksPetHealth API", userType: claims.userType, role: claims.staffRole },
    })
    return next
  })
  useSessionStore.getState().setSession(user.id, at)
  return user
}

export interface DevSignInInput {
  userId: number
  userType: Extract<ApiUserType, "aqc_staff" | "nparks_admin">
  aqcStaffRole?: AqcStaffRole
}

export async function devSignIn(input: DevSignInInput): Promise<User> {
  if (!Number.isInteger(input.userId) || input.userId <= 0) throw new ApiError("VALIDATION", "Enter a numeric user id.", "userId")
  const tokens = await authApi.devToken({
    userId: input.userId,
    userType: input.userType,
    ...(input.userType === "aqc_staff" ? { aqcStaffRole: input.aqcStaffRole ?? "officer" } : {}),
  })
  return startSession(tokens, input.aqcStaffRole === "contractor" ? "contractor" : "officer")
}

interface PendingOidc {
  state: string
  provider: OidcProvider
  idp: IdentityProvider
  next: string | null
  redirectUri: string
}

/** Step 1: ask the API for the IdP URL and leave the app. */
export async function startOidcSignIn(idp: IdentityProvider, next: string | null): Promise<void> {
  const provider = OIDC_PROVIDER[idp]
  const redirectUri = `${window.location.origin}${OIDC_CALLBACK_PATH}`
  const res = await authApi.authorize(provider, redirectUri)
  const pending: PendingOidc = { state: res.state, provider, idp, next, redirectUri }
  window.sessionStorage.setItem(OIDC_KEY, JSON.stringify(pending))
  window.location.assign(res.authorizationUrl)
}

/** Step 2 (on /auth/callback): exchange the code for tokens. Returns where to go next. */
export async function completeOidcSignIn(params: URLSearchParams): Promise<string> {
  const idpError = params.get("error_description") ?? params.get("error")
  if (idpError) throw new ApiError("UNAUTHENTICATED", `The identity provider refused the sign-in: ${idpError}`)
  const code = params.get("code")
  const state = params.get("state")
  let pending: PendingOidc | null = null
  try {
    pending = JSON.parse(window.sessionStorage.getItem(OIDC_KEY) ?? "null") as PendingOidc | null
  } catch {
    pending = null
  }
  window.sessionStorage.removeItem(OIDC_KEY)
  if (!code || !state) throw new ApiError("UNAUTHENTICATED", "The sign-in response is missing its code. Start again.")
  if (!pending || pending.state !== state)
    throw new ApiError("UNAUTHENTICATED", "The sign-in could not be verified (state mismatch). Start again.")
  const tokens = await authApi.callback({ provider: pending.provider, code, state, redirectUri: pending.redirectUri })
  await startSession(tokens, pending.idp)
  return pending.next && pending.next.startsWith("/") && !pending.next.startsWith("/login") ? pending.next : "/operations"
}

/** Revokes the refresh token (when there is one) and clears the tokens. */
export async function apiSignOut(): Promise<void> {
  const refreshToken = getTokens()?.refreshToken
  clearTokens()
  if (refreshToken) {
    try {
      await authApi.logout(refreshToken)
    } catch {
      // The local session ends either way.
    }
  }
}

export function hasApiSession(): boolean {
  return Boolean(getTokens()?.accessToken)
}

let registered = false
/** A 401 that refresh can't fix ends the session and returns to sign-in. */
export function registerSessionExpiry(): void {
  if (registered || typeof window === "undefined") return
  registered = true
  setSessionExpiredHandler(() => {
    useSessionStore.getState().clear()
    if (!window.location.pathname.startsWith("/login")) window.location.replace("/login?expired=1")
  })
}
