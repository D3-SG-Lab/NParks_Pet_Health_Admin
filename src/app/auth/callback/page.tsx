import { Suspense } from "react"
import type { Metadata } from "next"

import { OidcCallback } from "@/features/auth/oidc-callback"

export const metadata: Metadata = { title: "Signing in" }

/** OIDC redirect URI (`${origin}/auth/callback`) — must be registered with the identity provider. */
export default function OidcCallbackPage() {
  return (
    <Suspense>
      <OidcCallback />
    </Suspense>
  )
}
