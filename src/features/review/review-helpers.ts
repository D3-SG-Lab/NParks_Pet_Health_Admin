import type { ChipTone } from "@/components/common/status-chip"
import { percent } from "@/lib/format"
import type { QueueItem } from "@/services/observations"

export function reasonChip(item: QueueItem): { label: string; tone: ChipTone; dot: boolean } {
  const o = item.observation
  if (o.aiStatus === "awaiting_confirmation")
    return { label: `Awaiting confirmation · ${percent(o.ai?.confidence ?? 0)}`, tone: "ai", dot: true }
  switch (o.ai?.reviewReason) {
    case "low_confidence":
      return { label: `Low confidence · ${percent(o.ai.confidence)}`, tone: "warning", dot: false }
    case "unavailable":
      return { label: "AI unavailable", tone: "neutral", dot: false }
    default:
      return { label: "No animal match", tone: "warning", dot: true }
  }
}

/** Short body-system word for "No open or recent ear case for Coco". */
export function systemWord(codes: string[]): string {
  const prefix = codes[0]?.split("-")[0]
  const map: Record<string, string> = { GI: "GI", DE: "skin", OT: "ear", OC: "eye", RE: "respiratory", MS: "mobility", GB: "general" }
  return prefix ? (map[prefix] ?? "related") : "related"
}

export function reporterLabel(item: QueueItem): string {
  if (item.reporterRole === "contractor") return `${item.reporterName} (contractor${item.reporterScope ? `, ${item.reporterScope}` : ""})`
  return item.reporterName
}
