/** Maps domain statuses to chip tones and labels — one source of truth for every screen. */
import type { ChipTone } from "@/components/common/status-chip"
import type { AnimalHealthStatus, CaseStatus, Role, UserStatus } from "@/types/domain"

export const ANIMAL_STATUS: Record<AnimalHealthStatus, { label: string; tone: ChipTone; dot: boolean }> = {
  unwell: { label: "Unwell", tone: "abnormal", dot: true },
  active: { label: "Active", tone: "success", dot: true },
  monitoring: { label: "Monitoring", tone: "neutral", dot: false },
  awaiting_exam: { label: "Awaiting exam", tone: "info", dot: true },
  released: { label: "Released", tone: "neutral", dot: false },
}

export const CASE_STATUS: Record<CaseStatus, { label: string; short: string; tone: ChipTone }> = {
  open: { label: "Open", short: "Open", tone: "info" },
  needs_review: { label: "Needs review", short: "Review", tone: "warning" },
  closed: { label: "Closed", short: "Closed", tone: "neutral" },
}

export const ROLE_TONE: Record<Role, ChipTone> = {
  vet: "info",
  officer: "info",
  supervisor: "info",
  auditor: "ai",
  admin: "primary",
  contractor: "neutral",
}

export const USER_STATUS: Record<UserStatus, { label: string; tone: ChipTone; dot: boolean }> = {
  active: { label: "Active", tone: "success", dot: true },
  invited: { label: "Invited", tone: "warning", dot: true },
  disabled: { label: "Disabled", tone: "neutral", dot: false },
}
