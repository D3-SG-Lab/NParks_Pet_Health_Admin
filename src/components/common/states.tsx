"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { CircleCheck, CloudOff, Lock, RefreshCw, SearchX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { errorMessage, isApiError } from "@/lib/errors"
import { cn } from "@/lib/utils"

/** Empty state (FE-025): soft green tick, title, hint and optional action. */
export function EmptyState({
  title,
  description,
  action,
  icon = "check",
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: "check" | "search"
  className?: string
}) {
  const Icon = icon === "search" ? SearchX : CircleCheck
  return (
    <div className={cn("mx-auto flex max-w-sm flex-col items-center gap-2 py-6 text-center", className)}>
      <span
        className={cn(
          "mb-1 inline-flex size-12 items-center justify-center rounded-xl",
          icon === "search" ? "bg-muted text-muted-foreground" : "bg-success-soft text-success"
        )}
      >
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/** Error state (FE-025): "Couldn't load cases · Check your connection and try again." */
export function ErrorState({
  title = "Couldn’t load data",
  error,
  onRetry,
  className,
}: {
  title?: string
  error?: unknown
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={cn("mx-auto flex max-w-sm flex-col items-center gap-2 py-6 text-center", className)} role="alert">
      <span className="mb-1 inline-flex size-12 items-center justify-center rounded-xl bg-destructive-soft text-destructive">
        <CloudOff className="size-6" aria-hidden />
      </span>
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{error ? errorMessage(error) : "Check your connection and try again."}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  )
}

/** Generic block skeleton for panels. */
export function PanelSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-3 p-5", className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

/** Access denied (Admin_Design.pdf p.17, BE-005). The attempt is audited by the service layer. */
export function AccessDenied({
  title = "You don’t have access to this page",
  description,
  errorRef,
}: {
  title?: string
  description?: ReactNode
  errorRef?: string
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-muted text-foreground">
          <Lock className="size-6" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-[15px] text-muted-foreground">
          {description ?? "Your role or kennel scope doesn’t include this. This attempt has been recorded."}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/operations">Back to Operations</Link>
          </Button>
          <Button variant="outline" asChild>
            <a href="mailto:aqc-admin@nparks.gov.sg?subject=Access%20request%20%E2%80%94%20AQC%20Animal%20Health">Request access</a>
          </Button>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">Error 403{errorRef ? ` · ref ${errorRef}` : ""}</p>
      </div>
    </div>
  )
}

/** Renders AccessDenied for 403s and ErrorState otherwise. */
export function QueryError({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  if (isApiError(error) && error.code === "FORBIDDEN")
    return <AccessDenied description={error.message + " This attempt has been recorded."} errorRef={error.ref} />
  return <ErrorState error={error} onRetry={onRetry} title={title} />
}
