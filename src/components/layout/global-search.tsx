"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { FolderOpen, Loader2, PawPrint, Search } from "lucide-react"

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useDebounced } from "@/hooks/use-debounced"
import { cn } from "@/lib/utils"
import { globalSearch } from "@/services/animals"

/** Top-bar search: kennel code, name, microchip or case no. Press "/" to focus. */
export function GlobalSearch({ compact }: { compact?: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const q = useDebounced(value.trim(), 200)
  const { data = [], isFetching } = useQuery({ queryKey: ["global-search", q], queryFn: () => globalSearch(q), enabled: q.length >= 2 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    setValue("")
    inputRef.current?.blur()
    router.push(href)
  }

  return (
    <Popover open={open && q.length >= 2} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative w-full", compact ? "max-w-none" : "max-w-[440px]")}>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, data.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === "Enter" && data[active]) {
                e.preventDefault()
                go(data[active].href)
              } else if (e.key === "Escape") {
                setOpen(false)
                inputRef.current?.blur()
              }
            }}
            placeholder={compact ? "Kennel, name, microchip or case" : "Search kennel code, name, microchip or case no."}
            aria-label="Search kennel code, name, microchip or case number"
            role="combobox"
            aria-expanded={open && q.length >= 2}
            aria-controls="global-search-results"
            className="h-10 w-full rounded-xl border border-border bg-muted/70 pr-10 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-primary/15"
          />
          {!compact ? (
            <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden h-6 -translate-y-1/2 items-center rounded-md border border-border bg-card px-1.5 font-mono text-xs text-muted-foreground sm:inline-flex">
              /
            </kbd>
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div id="global-search-results" role="listbox">
          {isFetching && data.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </p>
          ) : data.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">No animals or cases match “{q}”.</p>
          ) : (
            data.map((r, i) => (
              <button
                key={`${r.kind}-${r.id}`}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.href)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active && "bg-muted")}
              >
                {r.kind === "animal" ? <PawPrint className="size-4 text-primary" /> : <FolderOpen className="size-4 text-info" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{r.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.subtitle}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
