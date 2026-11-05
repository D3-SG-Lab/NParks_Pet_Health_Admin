/** User & role administration (BE-007, FE-023, Users & roles p.9, Add user drawer p.17). */
import { ROLE_LABEL } from "@/config/rbac"
import { nowISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import type { IdentityProvider, Role, User, UserStatus } from "@/types/domain"

import { appendAudit, clone, delay, getDb, idpLabel, requirePermission, write } from "./core"

export interface UserQuery {
  search?: string
  role?: Role | "all"
  idp?: IdentityProvider | "all"
  status?: "active" | "disabled"
  sort?: { key: "name" | "lastLogin" | "role"; dir: "asc" | "desc" }
  page?: number
  pageSize?: number
}

export function scopeLabel(u: Pick<User, "role" | "kennelScope">): string {
  if (u.role === "auditor") return "—"
  if (u.role !== "contractor") return "All kennels"
  if (u.kennelScope.length === 0) return "—"
  const sorted = [...u.kennelScope].sort()
  // Contiguous KC blocks are shown as a range (KC1–KC3).
  const nums = sorted.map((b) => Number(b.replace("KC", "")))
  const contiguous = sorted.every((b) => b.startsWith("KC")) && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)
  return contiguous && sorted.length > 2 ? `${sorted[0]}–${sorted.at(-1)}` : sorted.join(", ")
}

export async function listUsers(q: UserQuery) {
  await delay()
  requirePermission("admin", { what: "Users & roles" })
  const db = getDb()
  const search = (q.search ?? "").trim().toLowerCase()
  const base = db.users
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
  const sortName = (u: User) => u.name.replace(/^Dr\s+/, "")
  filtered.sort((a, b) => {
    if (sort.key === "lastLogin") return dir * (a.lastLoginAt ?? "").localeCompare(b.lastLoginAt ?? "")
    if (sort.key === "role") return dir * ROLE_LABEL[a.role].localeCompare(ROLE_LABEL[b.role])
    return dir * sortName(a).localeCompare(sortName(b))
  })
  const pageSize = q.pageSize ?? 7
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(Math.max(1, q.page ?? 1), pages)
  return {
    users: clone(filtered.slice((page - 1) * pageSize, page * pageSize)),
    total: filtered.length,
    totalAll: db.users.length,
    counts,
    page,
    pages,
    pageSize,
  }
}

export interface UserInput {
  idp: IdentityProvider
  email: string
  name: string
  role: Role
  kennelScope: string[]
  sendInvitation: boolean
}

function validate(input: UserInput, exceptId?: string) {
  const db = getDb()
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError("VALIDATION", "Enter a valid work email.", "email")
  const officerDomain = email.endsWith("@nparks.gov.sg")
  if (input.idp === "officer" && !officerDomain)
    throw new ApiError("VALIDATION", "Officer IdP accounts must use an @nparks.gov.sg email.", "email")
  if (input.idp === "contractor" && officerDomain)
    throw new ApiError("VALIDATION", "Must match the account in the contractor's identity provider.", "email")
  if (db.users.some((u) => u.email.toLowerCase() === email && u.id !== exceptId))
    throw new ApiError("CONFLICT", "A user with this email already exists.", "email")
  if (!input.name.trim()) throw new ApiError("VALIDATION", "Enter a display name.", "name")
  if (input.idp === "contractor" && input.role !== "contractor")
    throw new ApiError("VALIDATION", "Contractor IdP users can only have the Contractor role.", "role")
  if (input.idp === "officer" && input.role === "contractor")
    throw new ApiError("VALIDATION", "Officer IdP users can't have the Contractor role.", "role")
  if (input.role === "contractor" && input.kennelScope.length === 0)
    throw new ApiError("VALIDATION", "Contractors need at least one kennel block in scope.", "kennelScope")
  return email
}

export async function createUser(input: UserInput): Promise<User> {
  await delay()
  const actor = requirePermission("admin", { what: "Add user" })
  const email = validate(input)
  return write((db) => {
    const user: User = {
      id: `u-${Date.now().toString(36)}`,
      name: input.name.trim(),
      email,
      idp: input.idp,
      role: input.role,
      kennelScope: input.role === "contractor" ? [...input.kennelScope].sort() : [],
      status: input.sendInvitation ? "invited" : "active",
      lastLoginAt: null,
      createdAt: nowISO(),
    }
    db.users.push(user)
    appendAudit(db, actor, {
      action: "User created",
      entityType: "User",
      entityId: user.id,
      entityLabel: `User ${user.name}`,
      after: {
        email: user.email,
        idp: idpLabel(user),
        role: ROLE_LABEL[user.role],
        kennelScope: user.kennelScope,
        invitation: input.sendInvitation,
      },
    })
    return clone(user)
  })
}

export async function updateUser(id: string, input: Omit<UserInput, "sendInvitation">): Promise<User> {
  await delay()
  const actor = requirePermission("admin", { what: "Edit user" })
  const email = validate({ ...input, sendInvitation: false }, id)
  return write((db) => {
    const u = db.users.find((x) => x.id === id)
    if (!u) throw new ApiError("NOT_FOUND", "User not found.")
    if (u.id === actor.id && input.role !== "admin") throw new ApiError("CONFLICT", "You can't remove your own admin role.")
    const before = { name: u.name, email: u.email, idp: idpLabel(u), role: ROLE_LABEL[u.role], kennelScope: u.kennelScope }
    u.name = input.name.trim()
    u.email = email
    u.idp = input.idp
    u.role = input.role
    u.kennelScope = input.role === "contractor" ? [...input.kennelScope].sort() : []
    const after = { name: u.name, email: u.email, idp: idpLabel(u), role: ROLE_LABEL[u.role], kennelScope: u.kennelScope }
    appendAudit(db, actor, {
      action: before.role !== after.role || before.kennelScope.join() !== after.kennelScope.join() ? "Role assigned" : "User updated",
      entityType: "User",
      entityId: u.id,
      entityLabel: `User ${u.name}${u.role === "contractor" ? ` · scope ${scopeLabel(u)}` : ""}`,
      before,
      after,
    })
    return clone(u)
  })
}

/** Disabling a user blocks API access immediately (BE-007). */
export async function setUserStatus(id: string, status: Exclude<UserStatus, "invited">): Promise<void> {
  await delay()
  const actor = requirePermission("admin", { what: status === "disabled" ? "Disable user" : "Enable user" })
  write((db) => {
    const u = db.users.find((x) => x.id === id)
    if (!u) throw new ApiError("NOT_FOUND", "User not found.")
    if (u.id === actor.id) throw new ApiError("CONFLICT", "You can't disable your own account.")
    const before = u.status
    if (before === status) return
    u.status = status
    appendAudit(db, actor, {
      action: status === "disabled" ? "User disabled" : "User enabled",
      entityType: "User",
      entityId: u.id,
      entityLabel: `User ${u.name}`,
      before: { status: before },
      after: { status },
    })
  })
}

export async function resendInvitation(id: string): Promise<void> {
  await delay()
  const actor = requirePermission("admin", { what: "Resend invitation" })
  write((db) => {
    const u = db.users.find((x) => x.id === id)
    if (!u) throw new ApiError("NOT_FOUND", "User not found.")
    if (u.status !== "invited") throw new ApiError("CONFLICT", "This user has already signed in.")
    appendAudit(db, actor, {
      action: "Invitation resent",
      entityType: "User",
      entityId: u.id,
      entityLabel: `User ${u.name}`,
      after: { email: u.email },
    })
  })
}
