"use client"

import type { ReactNode } from "react"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ChipOption<T extends string> {
  value: T
  label: string
  count?: number
}

/** Pill filter chips — selected chip is navy ("Open 5", "Needs review 2"). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: ChipOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none",
              selected ? "border-navy bg-navy text-navy-foreground" : "border-border-strong bg-card text-foreground hover:bg-subtle"
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] tabular-nums",
                  selected ? "bg-white/15" : "bg-muted text-muted-foreground"
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** Search field with leading icon and clear button. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  ariaLabel,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
  ariaLabel?: string
  autoFocus?: boolean
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="h-10 w-full rounded-lg border border-transparent bg-muted pr-9 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-border hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Segmented control ("AM session | PM session", "1× daily | 2× daily …"). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
  size = "default",
}: {
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
  size?: "default" | "sm"
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-xl bg-muted p-1", className)}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none disabled:opacity-50",
              size === "sm" ? "h-8" : "h-9",
              selected
                ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgb(20_35_42/0.12)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Underlined page tabs ("Active 42 | Arriving today 2 | …"). */
export function PageTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; count?: number }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn("thin-scroll relative -mx-4 flex gap-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0", className)}
    >
      {tabs.map((t) => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative -mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none",
              selected ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className={cn("text-xs tabular-nums", selected ? "text-primary" : "text-muted-foreground")}>{t.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
