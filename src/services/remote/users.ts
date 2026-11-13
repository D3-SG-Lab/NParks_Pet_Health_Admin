/**
 * Users & roles on the real API. The API manages NParks admin accounts only
 * (`/admin/nparks-admins`); AQC staff accounts (officers, supervisors, vets,
 * contractors) and auditors have no endpoint, so they are not listed here.
 *
 * Status mapping: API `active` ↔ Active, `inactive` (new, not yet signed in) ↔
 * Invited, `suspended` ↔ Disabled.
 */
import { fromUtc } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import type { User, UserStatus } from "@/types/domain"

import { adminApi } from "../api/api-client"
import type { AccountStatus, NParksAdminDto } from "../api/types"
import type { UserInput, UserQuery } from "../users"

const PREFIX = "na-"
const STATUS: Record<AccountStatus, UserStatus> = { active: "active", inactive: "invited", suspended: "disabled" }

export const isApiAdminId = (id: string) => id.startsWith(PREFIX)

function adminId(id: string): number {
  const n = Number(id.slice(PREFIX.length))
  if (!isApiAdminId(id) || !Number.isInteger(n)) throw new ApiError("NOT_FOUND", "This account isn’t managed by the API.")
  return n
}

export function toUser(dto: NParksAdminDto): User {
  return {
    id: `${PREFIX}${dto.id}`,
    name: dto.fullName,
    email: dto.workEmail,
    idp: "officer",
    role: "admin",
    kennelScope: [],
    status: STATUS[dto.accountStatus] ?? "disabled",
    lastLoginAt: fromUtc(dto.lastLoginAt),
    createdAt: fromUtc(dto.createdAt) ?? dto.createdAt,
  }
}

export async function listUsers(q: UserQuery) {
  const all = (await adminApi.listNParksAdmins()).map(toUser)
  const search = (q.search ?? "").trim().toLowerCase()
  const base = all
    .filter((u) => !search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search))
    .filter((u) => !q.role || q.role === "all" || u.role === q.role)
    .filter((u) => !q.idp || q.idp === "all" || u.idp === q.idp)
  const counts = {
    active: base.filter((u) => u.status !== "disabled").length,
    disabled: base.filter((u) => u.status === "disabled").length,
  }
  const filtered = base.filter((u) => (q.status === "disabled" ? u.status === "disabled" : u.status !== "disabled"))
  const sort = q.sort ?? { key: "name", dir: "asc" }
  const dir = sort.dir === "asc" ? 1 : -1
  filtered.sort((a, b) =>
    sort.key === "lastLogin" ? dir * (a.lastLoginAt ?? "").localeCompare(b.lastLoginAt ?? "") : dir * a.name.localeCompare(b.name)
  )
  const pageSize = q.pageSize ?? 7
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Math.max(1, q.page ?? 1), pages)
  return {
    users: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    totalAll: all.length,
    counts,
    page,
    pages,
    pageSize,
  }
}

export async function createUser(input: UserInput): Promise<User> {
  if (input.role !== "admin")
    throw new ApiError("VALIDATION", "The API can only create NParks admin accounts. Pick the Admin role.", "role")
  if (!input.name.trim()) throw new ApiError("VALIDATION", "Enter a display name.", "name")
  try {
    return toUser(await adminApi.createNParksAdmin({ fullName: input.name.trim(), workEmail: input.email.trim().toLowerCase() }))
  } catch (e) {
    // 409 "An admin with this email already exists."
    if (e instanceof ApiError && e.status === 409) throw new ApiError("CONFLICT", e.message, "email", 409)
    if (e instanceof ApiError && e.field === "fullName") throw new ApiError("VALIDATION", e.message, "name", e.status)
    if (e instanceof ApiError && e.field === "workEmail") throw new ApiError("VALIDATION", e.message, "email", e.status)
    throw e
  }
}

export async function setUserStatus(id: string, status: Exclude<UserStatus, "invited">): Promise<void> {
  await adminApi.updateNParksAdminStatus(adminId(id), status === "disabled" ? "suspended" : "active")
}

export async function deleteUser(id: string): Promise<void> {
  await adminApi.deleteNParksAdmin(adminId(id))
}
