import { animalInitials, initials } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Role } from "@/types/domain"

const SIZE = {
  sm: "size-8 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-16 text-xl rounded-2xl",
} as const

/** Animal avatar — teal tint for dogs/other, warm tint for cats (as in the design). */
export function AnimalAvatar({
  name,
  speciesId,
  size = "md",
  className,
}: {
  name: string
  speciesId?: string
  size?: keyof typeof SIZE
  className?: string
}) {
  const warm = speciesId === "cat"
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide",
        warm ? "bg-[#f5ede2] text-[#7c5421]" : "bg-[#def1eb] text-[#0b4c44]",
        SIZE[size],
        className
      )}
    >
      {animalInitials(name)}
    </span>
  )
}

/** User avatar — navy for officers, violet for auditors, warm for contractors. */
export function UserAvatar({
  name,
  role,
  size = "md",
  className,
}: {
  name: string
  role?: Role
  size?: keyof typeof SIZE
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        role === "auditor" ? "bg-ai-accent text-white" : role === "contractor" ? "bg-[#f5ede2] text-[#7c5421]" : "bg-[#23343e] text-white",
        SIZE[size],
        className
      )}
    >
      {initials(name)}
    </span>
  )
}
