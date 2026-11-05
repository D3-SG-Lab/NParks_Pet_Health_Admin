import { Suspense } from "react"
import type { Metadata } from "next"

import { PanelSkeleton } from "@/components/common/states"
import { CaseReport } from "@/features/cases/case-report"

export const metadata: Metadata = { title: "Case report" }

export default function CaseReportPage() {
  return (
    <Suspense fallback={<PanelSkeleton lines={8} />}>
      <CaseReport />
    </Suspense>
  )
}
