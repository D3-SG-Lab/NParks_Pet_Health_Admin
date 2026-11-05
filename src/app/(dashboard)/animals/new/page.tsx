import { Suspense } from "react"
import type { Metadata } from "next"

import { PanelSkeleton } from "@/components/common/states"
import { NewArrival } from "@/features/animals/new-arrival"

export const metadata: Metadata = { title: "New arrival" }

export default function NewArrivalPage() {
  return (
    <Suspense fallback={<PanelSkeleton lines={8} />}>
      <NewArrival />
    </Suspense>
  )
}
