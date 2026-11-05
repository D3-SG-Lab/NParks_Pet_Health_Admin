"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Check, Loader2 } from "lucide-react"

import { AnimalAvatar } from "@/components/common/avatars"
import { SearchInput } from "@/components/common/filters"
import { KennelCode } from "@/components/common/status-chip"
import { useDebounced } from "@/hooks/use-debounced"
import { cn } from "@/lib/utils"
import { searchActiveAnimals } from "@/services/observations"

/** Search-as-you-type animal picker (FE-006): kennel code, name or microchip; contractors see their kennels only. */
export function AnimalPicker({
  value,
  onChange,
  placeholder = "Search kennel code, name or microchip",
}: {
  value: string | null
  onChange: (animalId: string | null) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState("")
  const q = useDebounced(query, 180)
  const { data = [], isFetching } = useQuery({ queryKey: ["animal-picker", q], queryFn: () => searchActiveAnimals(q) })

  return (
    <div className="space-y-2">
      <SearchInput value={query} onChange={setQuery} placeholder={placeholder} ariaLabel="Search animals" />
      <div
        role="listbox"
        aria-label="Animals"
        className="thin-scroll max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1"
      >
        {isFetching && data.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </p>
        ) : data.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">No active animals match “{q}”.</p>
        ) : (
          data.map(({ animal, speciesName }) => {
            const selected = animal.id === value
            return (
              <button
                key={animal.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onChange(selected ? null : animal.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-subtle",
                  selected && "bg-selected ring-1 ring-primary"
                )}
              >
                <AnimalAvatar name={animal.name} speciesId={animal.speciesId} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{animal.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {speciesName} · {animal.sex}
                  </span>
                </span>
                <KennelCode code={animal.kennelCode} />
                {selected ? <Check className="size-4 text-primary" aria-hidden /> : null}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
