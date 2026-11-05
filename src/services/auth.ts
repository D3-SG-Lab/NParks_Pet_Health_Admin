/**
 * Mock sign-in (FE-003 / BE-004). In production both identity providers use
 * OIDC Authorization Code + PKCE with MFA; here the user picks a demo account
 * from the chosen IdP. First sign-in activates invited accounts.
 */
import { nowISO } from "@/lib/clock"
import { ApiError } from "@/lib/errors"
import { resetDb } from "@/lib/mock/db"
import { useSessionStore } from "@/stores/session-store"
import type { IdentityProvider, User } from "@/types/domain"

import { appendAudit, clone, delay, getDb, idpLabel, write } from "./core"

export async function listSignInAccounts(idp: IdentityProvider): Promise<User[]> {
  await delay(120)
  return clone(getDb().users.filter((u) => u.idp === idp))
}

export async function signIn(userId: string): Promise<User> {
  await delay(500)
  const user = write((db) => {
    const u = db.users.find((x) => x.id === userId)
    if (!u) throw new ApiError("UNAUTHENTICATED", "Account not found in the identity provider.")
    if (u.status === "disabled") {
      appendAudit(db, u, {
        action: "Login rejected",
        entityType: "Session",
        entityId: u.id,
        entityLabel: `Session · ${idpLabel(u)}`,
        after: { reason: "Account disabled" },
      })
      throw new ApiError("UNAUTHENTICATED", "This account has been disabled. Contact your system admin.")
    }
    const wasInvited = u.status === "invited"
    u.status = "active"
    u.lastLoginAt = nowISO()
    appendAudit(db, u, {
      action: "Login",
      entityType: "Session",
      entityId: u.id,
      entityLabel: `Session · ${idpLabel(u)}`,
      after: { idp: idpLabel(u), firstSignIn: wasInvited },
    })
    return clone(u)
  })
  useSessionStore.getState().setSession(user.id, nowISO())
  return user
}

export async function signOut(reason: "user" | "idle" = "user"): Promise<void> {
  const userId = useSessionStore.getState().userId
  if (userId) {
    write((db) => {
      const u = db.users.find((x) => x.id === userId)
      if (u)
        appendAudit(db, u, {
          action: reason === "idle" ? "Session expired" : "Logout",
          entityType: "Session",
          entityId: u.id,
          entityLabel: `Session · ${idpLabel(u)}`,
        })
    })
  }
  useSessionStore.getState().clear()
}

/** Returns the signed-in user (or null if the account vanished / was disabled). */
export function sessionUser(): User | null {
  const id = useSessionStore.getState().userId
  if (!id) return null
  const u = getDb().users.find((x) => x.id === id)
  return u && u.status !== "disabled" ? clone(u) : null
}

/** Restores the demo data set (Settings → reset demo data). */
export async function resetDemoData(): Promise<void> {
  await delay(300)
  resetDb()
}
