"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Lock, ShieldPlus } from "lucide-react"

import { CountPill } from "@/components/common/status-chip"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { APP_CONFIG } from "@/config/app"
import { ADMIN_NAV, MAIN_NAV, type NavItem } from "@/config/navigation"
import { roleHas } from "@/config/rbac"
import { useCurrentUser } from "@/hooks/use-session"
import { cn } from "@/lib/utils"
import { getNavCounts } from "@/services/dashboard"

export function useNavCounts() {
  return useQuery({ queryKey: ["nav-counts"], queryFn: getNavCounts, refetchInterval: 60_000 })
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-sidebar shadow-sm", className)}>
      <ShieldPlus className="size-5" aria-hidden />
    </span>
  )
}

function Badge({ item, counts, rail }: { item: NavItem; counts?: { animals: number; cases: number; review: number }; rail?: boolean }) {
  if (!item.badge || !counts) return null
  const value = counts[item.badge]
  if (!value) return null
  const warning = item.badge === "review"
  if (rail) {
    return (
      <span
        className={cn(
          "absolute -top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
          warning ? "bg-warning-badge text-warning-badge-foreground" : "bg-white/20 text-white"
        )}
      >
        {value}
      </span>
    )
  }
  return <CountPill tone={warning ? "warning" : "inverse"}>{value}</CountPill>
}

/** True when the signed-in role may open the item (nav entries stay visible; pages show access denied). */
function useCanOpen() {
  const { user } = useCurrentUser()
  return (item: NavItem) => !item.permission || Boolean(user && roleHas(user.role, item.permission))
}

/** Full sidebar (≥ xl, and inside the mobile drawer). */
export function SidebarFull({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const canOpen = useCanOpen()
  const { data: counts } = useNavCounts()

  const link = (item: NavItem) => {
    const active = isActive(pathname, item.href)
    const Icon = item.icon
    const locked = !canOpen(item)
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
          active
            ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-indicator)]"
            : "text-sidebar-foreground hover:bg-sidebar-hover"
        )}
      >
        <Icon className="size-[18px] shrink-0 opacity-90" aria-hidden />
        <span className={cn("flex-1 truncate", locked && "opacity-70")}>{item.label}</span>
        {locked ? <Lock className="size-3.5 text-sidebar-muted" aria-label="No access for your role" /> : null}
        <Badge item={item} counts={counts} />
      </Link>
    )
  }

  return (
    <div className="flex h-full flex-col bg-sidebar px-4 py-5 text-sidebar-foreground">
      <Link
        href="/operations"
        onClick={onNavigate}
        className="mb-6 flex items-center gap-3 rounded-xl px-1 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
      >
        <BrandMark />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-white">{APP_CONFIG.name}</span>
          <span className="block truncate text-xs text-sidebar-muted">{APP_CONFIG.subtitle}</span>
        </span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {MAIN_NAV.map(link)}
      </nav>
      <div className="my-4 border-t border-sidebar-border" />
      <p className="mb-2 px-3 text-[11px] font-semibold tracking-[0.1em] text-sidebar-muted uppercase">Admin</p>
      <nav aria-label="Admin" className="flex flex-col gap-1">
        {ADMIN_NAV.map(link)}
      </nav>
      <div className="mt-auto rounded-xl bg-white/[0.07] px-3.5 py-3 text-xs">
        <p className="font-semibold text-white">{APP_CONFIG.environmentLabel}</p>
        <p className="mt-0.5 text-sidebar-muted">Admin items visible to supervisors, auditors and admins only</p>
      </div>
    </div>
  )
}

/** Collapsed icon rail (md → xl), as in the narrow layout on p.16. */
export function SidebarRail() {
  const pathname = usePathname()
  const canOpen = useCanOpen()
  const { data: counts } = useNavCounts()

  const link = (item: NavItem) => {
    const active = isActive(pathname, item.href)
    const Icon = item.icon
    const locked = !canOpen(item)
    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
              active ? "bg-sidebar-accent font-semibold text-white" : "text-sidebar-foreground hover:bg-sidebar-hover"
            )}
          >
            <span className="relative">
              <Icon className={cn("size-5", locked && "opacity-60")} aria-hidden />
              {locked ? <Lock className="absolute -right-2 -bottom-1 size-3 text-sidebar-muted" aria-hidden /> : null}
            </span>
            {item.short}
            <Badge item={item} counts={counts} rail />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{locked ? `${item.label} · no access for your role` : item.label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className="flex h-full flex-col items-center gap-1 bg-sidebar px-2 py-4">
      <Link href="/operations" aria-label={APP_CONFIG.name} className="mb-4">
        <BrandMark />
      </Link>
      <nav aria-label="Main" className="flex w-full flex-col gap-1">
        {MAIN_NAV.map(link)}
      </nav>
      <div className="my-3 w-10 border-t border-sidebar-border" />
      <nav aria-label="Admin" className="flex w-full flex-col gap-1">
        {ADMIN_NAV.map(link)}
      </nav>
    </div>
  )
}
