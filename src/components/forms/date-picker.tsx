"use client"

import { useState } from "react"
import { format } from "date-fns"
import { CalendarDays } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { parseLocal, toISODate } from "@/lib/clock"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  id?: string
  /** "YYYY-MM-DD" or "" */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  min?: string
  max?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

/** Date field showing dd/mm/yyyy (design format) with a calendar popover. */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  min,
  max,
  invalid,
  disabled,
  className,
  ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseLocal(value) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          data-invalid={invalid || undefined}
          aria-label={ariaLabel}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-left font-mono text-sm text-foreground shadow-[0_1px_1px_rgb(20_35_42/0.03)] outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/10",
            !value && "font-sans text-muted-foreground",
            className
          )}
        >
          {selected ? format(selected, "dd/MM/yyyy") : placeholder}
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? (min ? parseLocal(min) : undefined)}
          onSelect={(d) => {
            if (d) onChange(toISODate(d))
            setOpen(false)
          }}
          disabled={(d) => Boolean((min && toISODate(d) < min) || (max && toISODate(d) > max))}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}

/** Date + time ("21/10/2026 16:00"). Value is "YYYY-MM-DDTHH:mm:00". */
export function DateTimePicker({
  id,
  value,
  onChange,
  min,
  invalid,
  ariaLabel,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  min?: string
  invalid?: boolean
  ariaLabel?: string
}) {
  const [date, time] = value ? [value.slice(0, 10), value.slice(11, 16)] : ["", ""]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
      <DatePicker
        id={id}
        value={date}
        min={min}
        invalid={invalid}
        ariaLabel={ariaLabel ? `${ariaLabel} date` : undefined}
        onChange={(d) => onChange(`${d}T${time || "09:00"}:00`)}
      />
      <input
        type="time"
        value={time}
        aria-label={ariaLabel ? `${ariaLabel} time` : "Time"}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(`${date || toISODate(new Date())}T${e.target.value}:00`)}
        className="h-10 w-full rounded-lg border border-input bg-card px-3 font-mono text-sm text-foreground outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 aria-invalid:border-destructive"
      />
    </div>
  )
}
