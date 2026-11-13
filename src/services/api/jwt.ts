/**
 * Reads the claims of an API access token. The API has no "current user"
 * endpoint, so identity comes from the token. Observed claims (live API,
 * 2026-11-13): `sub` (user id), `user_type`, `role` (AQC staff role), `exp`.
 * The signature is verified by the API, not here.
 */
import type { ApiUserType, AqcStaffRole } from "./types"

export interface AccessClaims {
  sub: string
  userType: ApiUserType | null
  staffRole: AqcStaffRole | null
  name: string | null
  email: string | null
  exp: number | null
}

function decodeSegment(segment: string): Record<string, unknown> {
  const base64 = segment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=")
  const json = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("")
  )
  return JSON.parse(json) as Record<string, unknown>
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)

export function readClaims(token: string): AccessClaims {
  const parts = token.split(".")
  if (parts.length < 2) throw new Error("The access token is not a JWT.")
  const c = decodeSegment(parts[1])
  const userType = str(c.user_type) ?? str(c.userType)
  const role = str(c.role) ?? str(c.aqcStaffRole) ?? str(c.aqc_staff_role)
  return {
    sub: String(c.sub ?? c.userId ?? ""),
    userType: (["pet_owner", "veterinarian", "nparks_admin", "aqc_staff"] as const).find((t) => t === userType) ?? null,
    staffRole: (["officer", "supervisor", "vet", "contractor"] as const).find((r) => r === role) ?? null,
    name: str(c.name) ?? str(c.given_name),
    email: str(c.email),
    exp: typeof c.exp === "number" ? c.exp : null,
  }
}
