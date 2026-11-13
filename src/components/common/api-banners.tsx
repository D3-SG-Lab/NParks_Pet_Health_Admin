import { CloudOff, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { isApiMode } from "@/services/api/config"

/**
 * API mode only: marks a screen or section that still runs on the local mock
 * data because the NParksPetHealth API has no endpoint for it.
 */
export function MockDataBanner({ what, className }: { what: string; className?: string }) {
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
        <span className="font-semibold">Demo data · no API yet.</span> {what} has no endpoint in the NParksPetHealth API, so this shows
        local demo data. Changes stay in this browser.
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
