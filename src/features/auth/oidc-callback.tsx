"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { LoaderCircle } from "lucide-react"

import { FormError } from "@/components/forms/field"
import { Button } from "@/components/ui/button"
import { errorMessage } from "@/lib/errors"
import { completeOidcSignIn } from "@/services/auth"

/** Exchanges the IdP's `code` for API tokens (`POST /auth/callback`), then enters the app. */
export function OidcCallback() {
  const params = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // The code can be exchanged only once (React runs effects twice in development).
    if (started.current) return
    started.current = true
    completeOidcSignIn(new URLSearchParams(params.toString()))
      .then(async (next) => {
        await qc.invalidateQueries()
        router.replace(next)
      })
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [params, qc, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold">Sign-in didn’t complete</h1>
            <FormError message={error} />
            <Button asChild className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Signing you in…
          </p>
        )}
      </div>
    </div>
  )
}
