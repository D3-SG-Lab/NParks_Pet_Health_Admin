import type { Metadata } from "next"

import { MedicationScreen } from "@/features/medication/medication-screen"

export const metadata: Metadata = { title: "Medication" }

export default function MedicationPage() {
  return <MedicationScreen />
}
