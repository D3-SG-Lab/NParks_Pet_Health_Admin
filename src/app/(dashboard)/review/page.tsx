import { Suspense } from "react"
import type { Metadata } from "next"

import { PanelSkeleton } from "@/components/common/states"
import { ReviewScreen } from "@/features/review/review-screen"

export const metadata: Metadata = { title: "Review queue" }

export default function ReviewPage() {
  return (
    <Suspense fallback={<PanelSkeleton lines={8} />}>
      <ReviewScreen />
    </Suspense>
  )
}
