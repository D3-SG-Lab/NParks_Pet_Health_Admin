import type { Metadata } from "next"

import { OperationsDashboard } from "@/features/operations/operations-dashboard"

export const metadata: Metadata = { title: "Operations" }

export default function OperationsPage() {
  return <OperationsDashboard />
}
