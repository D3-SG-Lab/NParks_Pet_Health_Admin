import type { Permission, Role } from "@/types/domain"

/** Display names for roles (Users & roles screen, top bar). */
export const ROLE_LABEL: Record<Role, string> = {
  contractor: "Contractor",
  officer: "Officer",
  vet: "Vet",
  supervisor: "Supervisor",
  auditor: "Auditor",
  admin: "Admin",
}

/** Subtitle shown under the user name in the top bar. */
export const ROLE_TITLE: Record<Role, string> = {
  contractor: "Contractor",
  officer: "AVS Officer",
  vet: "AVS Vet",
  supervisor: "Supervisor",
  auditor: "Auditor",
  admin: "System admin",
}

export const ROLES: Role[] = ["contractor", "officer", "vet", "supervisor", "auditor", "admin"]

/**
 * Role permission matrix — Admin_Design.pdf p.9 "Role permissions"
 * (enforced by the API on every endpoint, BE-005).
 * Contractors may record only within their own kennels.
 */
export const PERMISSION_MATRIX: { permission: Permission; label: string; roles: Partial<Record<Role, "yes" | "own">> }[] = [
  {
    permission: "record",
    label: "Inspect, observe & record medication",
    roles: { contractor: "own", officer: "yes", vet: "yes", supervisor: "yes" },
  },
  {
    permission: "arrival",
    label: "New arrival & release",
    roles: { officer: "yes", vet: "yes", supervisor: "yes" },
  },
  {
    permission: "triage",
    label: "Triage review queue · confirm AI routing",
    roles: { officer: "yes", vet: "yes", supervisor: "yes" },
  },
  {
    permission: "cases",
    label: "Assign & close cases",
    roles: { officer: "yes", vet: "yes", supervisor: "yes" },
  },
  {
    permission: "audit",
    label: "View & export audit log",
    roles: { auditor: "yes", admin: "yes" },
  },
  {
    permission: "admin",
    label: "Users, roles & master data",
    roles: { admin: "yes" },
  },
]

export function roleHas(role: Role, permission: Permission): boolean {
  const row = PERMISSION_MATRIX.find((r) => r.permission === permission)
  return Boolean(row?.roles[role])
}

/**
 * "Admin items visible to supervisors, auditors and admins only" (sidebar footer).
 * Visibility of the nav entry is broader than access: a supervisor opening an admin
 * page gets the access-denied screen and the attempt is audited (BE-005).
 */
export const ADMIN_NAV_ROLES: Role[] = ["supervisor", "auditor", "admin"]

/** Roles that sign in through the Officer IdP. */
export const OFFICER_IDP_ROLES: Role[] = ["officer", "vet", "supervisor", "auditor", "admin"]
