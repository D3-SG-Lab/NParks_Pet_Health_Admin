import { Suspense } from "react"
import type { Metadata } from "next"

import { PanelSkeleton } from "@/components/common/states"
import { CasesScreen } from "@/features/cases/cases-screen"

export const metadata: Metadata = { title: "Health cases" }

export default function CasesPage() {
  return (
    <Suspense fallback={<PanelSkeleton lines={8} />}>
      <CasesScreen />
    </Suspense>
  )
}
