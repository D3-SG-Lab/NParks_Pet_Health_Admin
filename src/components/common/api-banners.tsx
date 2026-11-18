import type { ReactNode } from "react"
import { CloudOff, Info, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { isApiMode } from "@/services/api/config"

/**
 * API mode only: marks a screen or section that still runs on the local mock
 * data because the NParksPetHealth API has no endpoint for it.
 */
export function MockDataBanner({ what, message, className }: { what: string; message?: ReactNode; className?: string }) {
  if (!isApiMode()) return null
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-ai-border bg-ai-soft px-4 py-3 text-[13px] text-foreground",
        className
      )}
    >
      <CloudOff className="mt-0.5 size-4 shrink-0 text-ai" aria-hidden />
      <span>
        <span className="font-semibold">Demo data · no API yet.</span>{" "}
        {message ?? <>{what} has no endpoint in the NParksPetHealth API, so this shows local demo data. Changes stay in this browser.</>}
      </span>
    </div>
  )
}

/**
 * API mode only: marks a screen built from live API data that the API doesn't
 * serve directly (e.g. health cases derived from inspections and observations).
 */
export function DerivedDataBanner({ children, className }: { children: ReactNode; className?: string }) {
  if (!isApiMode()) return null
  return (
    <div
      role="note"
      className={cn("flex items-start gap-2.5 rounded-xl border border-border bg-subtle px-4 py-3 text-[13px] text-foreground", className)}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>
        <span className="font-semibold">Live data · read-only.</span> {children}
      </span>
    </div>
  )
}

/** Parts of a screen the API couldn't load — shown instead of failing silently. */
export function ApiNotices({ notices, className }: { notices?: string[] | null; className?: string }) {
  if (!notices || notices.length === 0) return null
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-[13px] text-warning",
        className
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <ul className="space-y-0.5">
        {notices.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  )
}
