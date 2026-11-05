"use client"

import { useEffect, useRef, type ReactNode } from "react"

import { AccessDenied } from "@/components/common/states"
import { useCurrentUser } from "@/hooks/use-session"
import { roleHas } from "@/config/rbac"
import { write } from "@/lib/mock/db"
import { appendAudit } from "@/services/core"
import type { Permission } from "@/types/domain"

const PAGE_LABEL: Partial<Record<Permission, { title: string; description: string }>> = {
  audit: {
    title: "You don’t have access to the audit log",
    description: "The audit log is visible to auditors and admins only. This attempt has been recorded.",
  },
  admin: {
    title: "You don’t have access to administration",
    description: "Users, roles and master data are managed by system admins only. This attempt has been recorded.",
  },
}

/**
 * Page-level guard. Hidden actions are also blocked by the service layer
 * (FE-004 "Hidden actions are also blocked by the API").
 */
export function RequirePermission({ permission, page, children }: { permission: Permission; page: string; children: ReactNode }) {
  const { user } = useCurrentUser()
  const allowed = Boolean(user && roleHas(user.role, permission))
  const logged = useRef(false)

  useEffect(() => {
    if (user && !allowed && !logged.current) {
      logged.current = true
      write((db) =>
        appendAudit(db, db.users.find((u) => u.id === user.id) ?? null, {
          action: "Access denied",
          entityType: "Page",
          entityId: page,
          entityLabel: page,
          after: { permission, status: 403 },
        })
      )
    }
  }, [user, allowed, page, permission])

  if (!user) return null
  if (!allowed) {
    const copy = PAGE_LABEL[permission]
    return (
      <AccessDenied
        title={copy?.title}
        description={copy?.description}
        errorRef={`${user.id.slice(2, 6).toUpperCase()}-${page.length.toString(16).toUpperCase().padStart(4, "0")}`}
      />
    )
  }
  return <>{children}</>
}
