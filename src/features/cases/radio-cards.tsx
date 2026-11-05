"use client"

import { useRef, type KeyboardEvent, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface RadioCardOption<T extends string> {
  value: T
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}

/**
 * Selectable radio cards ("Closure reason", "Case action") — teal border and
 * tint when selected, as in Admin_Design.pdf pp.5 and 17. Arrow keys move selection.
 */
export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  invalid,
  className,
}: {
  options: RadioCardOption<T>[]
  value: T | null
  onChange: (value: T) => void
  ariaLabel: string
  invalid?: boolean
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const enabled = options.filter((o) => !o.disabled)

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, current: T) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return
    e.preventDefault()
    const idx = enabled.findIndex((o) => o.value === current)
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1
    const next = enabled[(idx + delta + enabled.length) % enabled.length]
    if (!next) return
    onChange(next.value)
    refs.current[options.indexOf(next)]?.focus()
  }

  const focusable = value && enabled.some((o) => o.value === value) ? value : enabled[0]?.value

  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-invalid={invalid || undefined} className={cn("flex flex-col gap-2", className)}>
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            tabIndex={o.value === focusable ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, o.value)}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55",
              selected
                ? "border-primary bg-selected shadow-[0_0_0_1px_var(--primary)]"
                : invalid
                  ? "border-destructive-border"
                  : "border-border hover:border-border-strong"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-2",
                selected ? "border-primary" : "border-border-strong"
              )}
            >
              {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{o.label}</span>
              {o.description ? <span className="mt-0.5 block text-[13px] text-muted-foreground">{o.description}</span> : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
