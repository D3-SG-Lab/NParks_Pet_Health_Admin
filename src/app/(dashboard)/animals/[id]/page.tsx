import { Suspense } from "react"
import type { Metadata } from "next"

import { PanelSkeleton } from "@/components/common/states"
import { AnimalDetail } from "@/features/animals/animal-detail"

export const metadata: Metadata = { title: "Animal record" }

export default function AnimalPage() {
  return (
    <Suspense fallback={<PanelSkeleton lines={8} />}>
      <AnimalDetail />
    </Suspense>
  )
}
