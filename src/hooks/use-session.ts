"use client"

import { useQuery } from "@tanstack/react-query"

import { ADMIN_NAV_ROLES, roleHas } from "@/config/rbac"
import { sessionUser } from "@/services/auth"
import { useSessionStore } from "@/stores/session-store"
import type { Permission, User } from "@/types/domain"

/** Signed-in user, or null. Re-reads after any mutation (query invalidation). */
export function useCurrentUser(): { user: User | null; ready: boolean } {
  const userId = useSessionStore((s) => s.userId)
  const hydrated = useSessionStore((s) => s.hydrated)
  const q = useQuery({
    queryKey: ["session-user", userId],
    queryFn: async () => sessionUser(),
    enabled: hydrated,
    staleTime: 0,
  })
  return { user: q.data ?? null, ready: hydrated && !q.isPending }
}

/** Throws if used outside the authenticated shell. */
export function useUser(): User {
  const { user } = useCurrentUser()
  if (!user) throw new Error("useUser() must be used inside the authenticated app shell")
  return user
}

export function usePermission(permission: Permission): boolean {
  const { user } = useCurrentUser()
  return Boolean(user && roleHas(user.role, permission))
}

export function useCanSeeAdminNav(): boolean {
  const { user } = useCurrentUser()
  return Boolean(user && ADMIN_NAV_ROLES.includes(user.role))
}
