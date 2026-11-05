import { Suspense } from "react"
import type { Metadata } from "next"

import { PanelSkeleton } from "@/components/common/states"
import { MasterDataScreen } from "@/features/master-data/master-data-screen"

export const metadata: Metadata = { title: "Master data" }

export default function MasterDataPage() {
  return (
    <Suspense fallback={<PanelSkeleton lines={6} />}>
      <MasterDataScreen />
    </Suspense>
  )
}
