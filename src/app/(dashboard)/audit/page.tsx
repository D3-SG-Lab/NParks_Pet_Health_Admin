import { Suspense } from "react"
import type { Metadata } from "next"

import { PanelSkeleton } from "@/components/common/states"
import { AuditLogScreen } from "@/features/audit/audit-log-screen"

export const metadata: Metadata = { title: "Audit log" }

export default function AuditPage() {
  return (
    <Suspense fallback={<PanelSkeleton lines={8} />}>
      <AuditLogScreen />
    </Suspense>
  )
}
