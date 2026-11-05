"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Clock3, RefreshCw } from "lucide-react"

import { PanelSkeleton } from "@/components/common/states"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useCurrentUser } from "@/hooks/use-session"
import { getDb, reloadFromStorage, STORAGE_KEY } from "@/lib/mock/db"
import { signOut } from "@/services/auth"

import { SidebarFull, SidebarRail } from "./sidebar"
import { Topbar } from "./topbar"

const WARN_BEFORE_MS = 2 * 60_000

/** Idle timeout (FE-003 "Session expires after the agreed idle time") with the amber warning banner from p.17. */
function useIdleTimeout(onExpire: () => void) {
  const last = useRef(0)
  const [remaining, setRemaining] = useState<number | null>(null)

  const touch = useCallback(() => {
    last.current = Date.now()
    setRemaining(null)
  }, [])

  useEffect(() => {
    const idleMs = getDb().settings.sessionIdleMinutes * 60_000
    last.current = Date.now()
    const events = ["pointerdown", "keydown", "scroll"] as const
    const onActivity = () => {
      // Activity only resets the timer while no warning is shown — the user must click "Stay signed in".
      if (Date.now() - last.current < idleMs - WARN_BEFORE_MS) last.current = Date.now()
    }
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    const id = setInterval(() => {
      const left = idleMs - (Date.now() - last.current)
      if (left <= 0) onExpire()
      else setRemaining(left <= WARN_BEFORE_MS ? left : null)
    }, 5_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      clearInterval(id)
    }
  }, [onExpire])

  return { remaining, touch }
}

/** "3 new records since you opened this page" — changes made in another tab (p.17). */
function useCrossTabChanges() {
  const [pending, setPending] = useState(0)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      const before = getDb().audit.length
      if (reloadFromStorage()) setPending((p) => p + Math.max(1, getDb().audit.length - before))
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])
  return { pending, clear: () => setPending(0) }
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const qc = useQueryClient()
  const { user, ready } = useCurrentUser()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [ready, user, router, pathname])

  const expire = useCallback(async () => {
    await signOut("idle")
    router.replace("/login?expired=1")
  }, [router])
  const idle = useIdleTimeout(expire)
  const changes = useCrossTabChanges()

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PanelSkeleton className="w-80" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:shadow-lg"
      >
        Skip to content
      </a>
      <aside className="no-print hidden w-[84px] shrink-0 bg-sidebar md:block xl:hidden">
        <div className="sticky top-0 h-screen">
          <SidebarRail />
        </div>
      </aside>
      <aside className="no-print hidden w-[248px] shrink-0 bg-sidebar xl:block">
        <div className="sticky top-0 h-screen">
          <SidebarFull />
        </div>
      </aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[272px] max-w-[85vw] border-0 bg-sidebar p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarFull onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        {idle.remaining !== null || changes.pending > 0 ? (
          <div className="no-print space-y-2 px-4 pt-4 sm:px-6 lg:px-8">
            {idle.remaining !== null ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-medium text-warning"
              >
                <Clock3 className="size-4" aria-hidden />
                <span className="flex-1">
                  Your session expires in {Math.max(1, Math.ceil(idle.remaining / 60_000))} minute{idle.remaining > 60_000 ? "s" : ""} due
                  to inactivity.
                </span>
                <Button size="sm" variant="outline" onClick={idle.touch}>
                  Stay signed in
                </Button>
              </div>
            ) : null}
            {changes.pending > 0 ? (
              <div
                role="status"
                className="flex flex-wrap items-center gap-3 rounded-xl border border-info-border bg-info-soft px-4 py-3 text-sm font-medium text-info"
              >
                <RefreshCw className="size-4" aria-hidden />
                <span className="flex-1">
                  {changes.pending} new record{changes.pending === 1 ? "" : "s"} since you opened this page.
                </span>
                <Button
                  size="sm"
                  variant="link"
                  className="text-info"
                  onClick={() => {
                    changes.clear()
                    void qc.invalidateQueries()
                  }}
                >
                  Refresh
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <main id="main" className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  )
}
