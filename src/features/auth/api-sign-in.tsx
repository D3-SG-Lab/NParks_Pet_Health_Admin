"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { ExternalLink } from "lucide-react"

import { Segmented } from "@/components/common/filters"
import { Field, FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorMessage } from "@/lib/errors"
import { DEV_FULL_ACCESS, DEV_LOGIN_ENABLED, OIDC_LOGIN_ENABLED, OIDC_PROVIDER } from "@/services/api/config"
import type { AqcStaffRole } from "@/services/api/types"
import { devSignIn, startOidcSignIn } from "@/services/auth"
import type { IdentityProvider } from "@/types/domain"

const PROVIDER_LABEL = { singpass: "Singpass", corppass: "Corppass" } as const

const STAFF_ROLES: { value: AqcStaffRole; label: string }[] = [
  { value: "officer", label: "Officer" },
  { value: "supervisor", label: "Supervisor" },
  { value: "vet", label: "Vet" },
  { value: "contractor", label: "Contractor" },
]

/**
 * Sign-in against the NParksPetHealth API. For now the login method is
 * `POST /auth/dev-token` (account type, staff role, user id). OIDC through
 * `/auth/authorize` is shown only when NEXT_PUBLIC_ENABLE_OIDC_LOGIN=true.
 */
export function ApiSignIn({ next }: { next: string | null }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [idp, setIdp] = useState<IdentityProvider>("officer")
  const [pending, setPending] = useState<"oidc" | "dev" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userType, setUserType] = useState<"aqc_staff" | "nparks_admin">("aqc_staff")
  const [role, setRole] = useState<AqcStaffRole>("officer")
  const [userId, setUserId] = useState("1")

  // The login page is kept alive (hidden) after navigating away, so a finished
  // sign-in would come back still "loading" after sign-out. Reset when hidden.
  useEffect(
    () => () => {
      setPending(null)
      setError(null)
    },
    []
  )

  const provider = OIDC_PROVIDER[idp]
  const target = next && next.startsWith("/") && !next.startsWith("/login") ? next : "/operations"

  const oidc = async () => {
    setPending("oidc")
    setError(null)
    try {
      await startOidcSignIn(idp, next)
    } catch (e) {
      setError(errorMessage(e))
      setPending(null)
    }
  }

  const dev = async () => {
    setPending("dev")
    setError(null)
    try {
      await devSignIn({ userId: Number(userId), userType, aqcStaffRole: userType === "aqc_staff" ? role : undefined })
      await qc.invalidateQueries()
      router.replace(target)
    } catch (e) {
      setError(errorMessage(e))
      setPending(null)
    }
  }

  const devForm = (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void dev()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Account type">
          <Select value={userType} onValueChange={(v) => setUserType(v as typeof userType)}>
            <SelectTrigger className="w-full" aria-label="Account type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aqc_staff">AQC staff</SelectItem>
              <SelectItem value="nparks_admin">NParks admin</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {userType === "aqc_staff" ? (
          <Field label="Staff role">
            <Select value={role} onValueChange={(v) => setRole(v as AqcStaffRole)}>
              <SelectTrigger className="w-full" aria-label="Staff role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field label="User id" htmlFor="dev-user-id">
          <Input id="dev-user-id" inputMode="numeric" value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ""))} />
        </Field>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending === "dev"} disabled={pending !== null || !userId}>
        Sign in
      </Button>
      <p className="text-xs text-muted-foreground">
        Issues a token from <code className="font-mono">/auth/dev-token</code>. Works only while the API runs in Development.
        {DEV_FULL_ACCESS ? " Dev-token sessions open every screen, including audit log, users & roles and master data." : null}
      </p>
    </form>
  )

  const oidcBlock = (
    <div className="space-y-4">
      <Segmented
        ariaLabel="Identity provider"
        className="w-full"
        value={idp}
        onChange={(v) => {
          setIdp(v)
          setError(null)
        }}
        options={[
          { value: "officer", label: "Officer IdP" },
          { value: "contractor", label: "Contractor IdP" },
        ]}
      />
      <p className="text-sm text-muted-foreground">
        You’ll be redirected to {PROVIDER_LABEL[provider]} to sign in, then brought back here.
      </p>
      <Button
        size="lg"
        variant={DEV_LOGIN_ENABLED ? "outline" : "default"}
        className="w-full"
        loading={pending === "oidc"}
        disabled={pending !== null}
        onClick={oidc}
      >
        Continue with {idp === "officer" ? "Officer IdP" : "Contractor IdP"} <ExternalLink />
      </Button>
    </div>
  )

  return (
    <div className="mt-6 space-y-5">
      {DEV_LOGIN_ENABLED ? devForm : null}
      {OIDC_LOGIN_ENABLED ? (
        DEV_LOGIN_ENABLED ? (
          <section aria-label="Identity provider sign-in" className="space-y-4 border-t border-border pt-5">
            {oidcBlock}
          </section>
        ) : (
          oidcBlock
        )
      ) : null}
      {!DEV_LOGIN_ENABLED && !OIDC_LOGIN_ENABLED ? (
        <p className="text-sm text-muted-foreground">
          No sign-in method is enabled. Set NEXT_PUBLIC_ENABLE_DEV_LOGIN or NEXT_PUBLIC_ENABLE_OIDC_LOGIN and rebuild.
        </p>
      ) : null}

      <FormError message={error} />
      <p className="text-center text-xs text-muted-foreground">
        {OIDC_LOGIN_ENABLED
          ? "Sign-in uses OIDC Authorization Code through the NParksPetHealth API. Sign-ins are audited."
          : "Signs in through the NParksPetHealth API. Sign-ins are audited."}
      </p>
    </div>
  )
}
