import type { ReactNode } from "react"
import { CircleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

interface FieldProps {
  label: ReactNode
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}

/** Label + control + hint/error, matching the design's form fields ("Assign to *"). */
export function Field({ label, htmlFor, required, error, hint, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-[13px] text-destructive" role="alert">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** Form-level error banner (server / service errors). */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive-border bg-destructive-tile px-3 py-2.5 text-sm text-destructive"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {message}
    </div>
  )
}
