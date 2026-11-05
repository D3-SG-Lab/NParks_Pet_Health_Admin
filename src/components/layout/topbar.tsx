"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bell, CheckCheck, Clock3, LogOut, Menu, RotateCcw, UserRound } from "lucide-react"

import { UserAvatar } from "@/components/common/avatars"
import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ROLE_TITLE } from "@/config/rbac"
import { useNow } from "@/hooks/use-now"
import { useUser } from "@/hooks/use-session"
import { currentSession } from "@/lib/clock"
import { fmtLongDay, fmtRelative } from "@/lib/format"
import { useServiceMutation } from "@/lib/query"
import { cn } from "@/lib/utils"
import { resetDemoData, signOut } from "@/services/auth"
import { listMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/notifications"

import { GlobalSearch } from "./global-search"

function SessionClock() {
  const now = useNow()
  if (!now) return <span className="h-5 w-48 animate-pulse rounded bg-muted" />
  return (
    <span className="hidden items-center gap-2 text-sm whitespace-nowrap text-muted-foreground lg:flex">
      <Clock3 className="size-4" aria-hidden />
      {fmtLongDay(now)} · {currentSession(now)} session
    </span>
  )
}

function Notifications() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: listMyNotifications, refetchInterval: 60_000 })
  const markAll = useServiceMutation(markAllNotificationsRead)
  const markOne = useServiceMutation(markNotificationRead)
  const unread = data?.unread ?? 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-subtle focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        >
          <Bell className="size-[18px]" />
          {unread ? <span className="absolute top-2 right-2.5 size-2 rounded-full bg-abnormal ring-2 ring-card" aria-hidden /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="xs" disabled={!unread} onClick={() => markAll.mutate()}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="thin-scroll max-h-[420px] overflow-y-auto">
          {!data || data.items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">You’re all caught up.</p>
          ) : (
            data.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) markOne.mutate(n.id)
                  setOpen(false)
                  if (n.href) router.push(n.href)
                }}
                className={cn(
                  "flex w-full gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-subtle",
                  !n.read && "bg-selected"
                )}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{n.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[13px] text-muted-foreground">{n.body}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{fmtRelative(n.at)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UserMenu() {
  const user = useUser()
  const router = useRouter()
  const [confirmReset, setConfirmReset] = useState(false)
  const reset = useServiceMutation(resetDemoData, {
    success: "Demo data restored",
    onSuccess: async () => {
      setConfirmReset(false)
      await signOut()
      router.replace("/login")
    },
  })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-full p-0.5 pr-1 text-left focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none sm:rounded-xl sm:pr-2"
            aria-label="Account menu"
          >
            <UserAvatar name={user.name} role={user.role} size="md" />
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{ROLE_TITLE[user.role]}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/login?switch=1">
              <UserRound /> Switch demo account
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
            <RotateCcw /> Reset demo data
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await signOut()
              router.replace("/login")
            }}
          >
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="All changes made in this browser — new records, edits and audit events — are discarded and the original demo data set is restored. You will be signed out."
        confirmLabel="Reset data"
        destructive
        icon={<RotateCcw className="size-5" />}
        loading={reset.isPending}
        onConfirm={() => reset.mutate()}
      />
    </>
  )
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur supports-backdrop-filter:bg-card/85 sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <GlobalSearch />
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <SessionClock />
        <Notifications />
        <UserMenu />
      </div>
    </header>
  )
}
