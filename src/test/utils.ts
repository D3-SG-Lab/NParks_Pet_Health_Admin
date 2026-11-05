import { resetDb } from "@/lib/mock/db"
import { useSessionStore } from "@/stores/session-store"

/** Fresh seed data + signed in as the given demo user. */
export function signInAs(userId: string) {
  window.localStorage.clear()
  resetDb()
  useSessionStore.getState().setSession(userId, "2026-10-21T08:42:00")
}
