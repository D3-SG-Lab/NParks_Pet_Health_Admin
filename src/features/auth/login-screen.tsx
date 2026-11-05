"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Clock3, KeyRound, ShieldCheck } from "lucide-react"

import { UserAvatar } from "@/components/common/avatars"
import { Segmented } from "@/components/common/filters"
import { StatusChip } from "@/components/common/status-chip"
import { FormError } from "@/components/forms/field"
import { BrandMark } from "@/components/layout/sidebar"
import { Button } from "@/components/ui/button"
import { APP_CONFIG } from "@/config/app"
import { ROLE_LABEL } from "@/config/rbac"
import { errorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { listSignInAccounts, signIn } from "@/services/auth"
import { scopeLabel } from "@/services/users"
import { useSessionStore } from "@/stores/session-store"
import type { IdentityProvider } from "@/types/domain"

const DEFAULT_ACCOUNT: Record<IdentityProvider, string> = { officer: "u-tan-j", contractor: "u-lee-k" }

export function LoginScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next")
  const expired = params.get("expired") === "1"
  const switching = params.get("switch") === "1"
  const sessionUserId = useSessionStore((s) => s.userId)
  const hydrated = useSessionStore((s) => s.hydrated)
  const [idp, setIdp] = useState<IdentityProvider>("officer")
  const [selected, setSelected] = useState<string>(DEFAULT_ACCOUNT.officer)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: accounts = [], isPending } = useQuery({ queryKey: ["signin-accounts", idp], queryFn: () => listSignInAccounts(idp) })

  useEffect(() => {
    if (hydrated && sessionUserId && !switching && !expired) router.replace(next && next.startsWith("/") ? next : "/operations")
  }, [hydrated, sessionUserId, switching, expired, next, router])

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      await signIn(selected)
      router.replace(next && next.startsWith("/") && !next.startsWith("/login") ? next : "/operations")
    } catch (e) {
      setError(errorMessage(e))
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="text-lg font-semibold">{APP_CONFIG.name}</p>
            <p className="text-sm text-sidebar-muted">{APP_CONFIG.subtitle}</p>
          </div>
        </div>
        <div className="mt-auto max-w-lg">
          <h1 className="text-[34px] leading-tight font-semibold">Daily health monitoring for animals in quarantine.</h1>
          <p className="mt-4 text-[15px] text-sidebar-foreground/80">
            Inspections, observations, medication and health cases for every kennel — with AI routing that officers confirm, and an audit
            trail for every change.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-sidebar-foreground/90">
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-4 text-sidebar-indicator" /> Role-based access with kennel scoping for contractors
            </li>
            <li className="flex items-center gap-3">
              <KeyRound className="size-4 text-sidebar-indicator" /> Officer IdP and Contractor IdP sign-in with MFA
            </li>
          </ul>
        </div>
        <p className="mt-10 text-xs text-sidebar-muted">{APP_CONFIG.environmentLabel}</p>
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/[0.04]" />
        <div className="pointer-events-none absolute -right-10 bottom-24 size-64 rounded-full bg-white/[0.03]" />
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[460px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="bg-sidebar text-white" />
            <div>
              <p className="text-base font-semibold">{APP_CONFIG.name}</p>
              <p className="text-xs text-muted-foreground">{APP_CONFIG.subtitle}</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose your identity provider. This POC simulates the OIDC sign-in with demo accounts.
          </p>

          {expired ? (
            <div
              role="status"
              className="mt-5 flex items-center gap-2 rounded-xl border border-warning-border bg-warning-soft px-4 py-3 text-sm font-medium text-warning"
            >
              <Clock3 className="size-4" /> Your session expired due to inactivity. Sign in again to continue.
            </div>
          ) : null}

          <div className="mt-6 space-y-5">
            <Segmented
              ariaLabel="Identity provider"
              className="w-full"
              value={idp}
              onChange={(v) => {
                setIdp(v)
                setSelected(DEFAULT_ACCOUNT[v])
                setError(null)
              }}
              options={[
                { value: "officer", label: "Officer IdP" },
                { value: "contractor", label: "Contractor IdP" },
              ]}
            />

            <div role="radiogroup" aria-label="Demo account" className="thin-scroll max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {isPending
                ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)
                : accounts.map((u) => {
                    const active = u.id === selected
                    return (
                      <button
                        key={u.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSelected(u.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border bg-card px-3.5 py-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-primary/20 focus-visible:outline-none",
                          active
                            ? "border-primary bg-selected shadow-[0_0_0_1px_var(--primary)]"
                            : "border-border hover:border-border-strong"
                        )}
                      >
                        <UserAvatar name={u.name} role={u.role} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{u.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <StatusChip
                            size="sm"
                            tone={
                              u.role === "auditor" ? "ai" : u.role === "contractor" ? "neutral" : u.role === "admin" ? "primary" : "info"
                            }
                          >
                            {ROLE_LABEL[u.role]}
                          </StatusChip>
                          {u.status === "disabled" ? (
                            <span className="text-[11px] text-muted-foreground">Disabled</span>
                          ) : u.role === "contractor" ? (
                            <span className="text-[11px] text-muted-foreground">{scopeLabel(u)}</span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
            </div>

            <FormError message={error} />

            <Button size="lg" className="w-full" loading={pending} onClick={submit} disabled={!selected}>
              Continue with {idp === "officer" ? "Officer IdP" : "Contractor IdP"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Production sign-in uses OIDC Authorization Code + PKCE with MFA. Sign-ins are audited.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
