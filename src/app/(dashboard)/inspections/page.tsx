import type { Metadata } from "next"

import { InspectionsScreen } from "@/features/inspections/inspections-screen"

export const metadata: Metadata = { title: "Inspections" }

export default function InspectionsPage() {
  return <InspectionsScreen />
}
