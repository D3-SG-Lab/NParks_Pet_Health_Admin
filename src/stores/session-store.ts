"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

/**
 * Signed-in session (mock OIDC). In production the session comes from the
 * Officer / Contractor identity provider (BE-004); here we only keep the user id.
 */
interface SessionState {
  userId: string | null
  signedInAt: string | null
  /** Set once the persisted state has been read from storage. */
  hydrated: boolean
  setSession: (userId: string, signedInAt: string) => void
  clear: () => void
  setHydrated: () => void
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      userId: null,
      signedInAt: null,
      hydrated: false,
      setSession: (userId, signedInAt) => set({ userId, signedInAt }),
      clear: () => set({ userId: null, signedInAt: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "aqc-admin-session",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ userId: s.userId, signedInAt: s.signedInAt }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    }
  )
)

export function getSessionUserId(): string | null {
  return useSessionStore.getState().userId
}
