import type { Metadata } from "next"

import { AnimalsList } from "@/features/animals/animals-list"

export const metadata: Metadata = { title: "Animals" }

export default function AnimalsPage() {
  return <AnimalsList />
}
