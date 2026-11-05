import { Suspense, type ReactNode } from "react"

import { PanelSkeleton } from "@/components/common/states"
import { AppShell } from "@/components/layout/app-shell"

/**
 * Authenticated workbench layout. The shell is client-rendered (session and
 * mock data live in the browser), so it streams in behind a Suspense boundary.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <PanelSkeleton className="w-80" />
        </div>
      }
    >
      <AppShell>
        <Suspense fallback={<PanelSkeleton lines={6} />}>{children}</Suspense>
      </AppShell>
    </Suspense>
  )
}
