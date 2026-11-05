import { Suspense } from "react"
import type { Metadata } from "next"

import { PanelSkeleton } from "@/components/common/states"
import { AnimalReport } from "@/features/animals/animal-report"

export const metadata: Metadata = { title: "Health record export" }

export default function AnimalReportPage() {
  return (
    <Suspense fallback={<PanelSkeleton lines={8} />}>
      <AnimalReport />
    </Suspense>
  )
}
