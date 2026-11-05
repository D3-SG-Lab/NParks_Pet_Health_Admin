import { ClipboardList, Database, FolderOpen, Home, PawPrint, Pill, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react"

import type { Permission } from "@/types/domain"

export interface NavItem {
  href: string
  label: string
  /** Short label for the collapsed rail (p.16). */
  short: string
  icon: LucideIcon
  badge?: "animals" | "cases" | "review"
  /** Permission needed to open the page (nav entry may still be visible). */
  permission?: Permission
}

export const MAIN_NAV: NavItem[] = [
  { href: "/operations", label: "Operations", short: "Ops", icon: Home },
  { href: "/animals", label: "Animals", short: "Animals", icon: PawPrint, badge: "animals" },
  { href: "/cases", label: "Health cases", short: "Cases", icon: FolderOpen, badge: "cases" },
  { href: "/review", label: "Review queue", short: "Review", icon: Sparkles, badge: "review" },
  { href: "/inspections", label: "Inspections", short: "Inspect", icon: ClipboardList },
  { href: "/medication", label: "Medication", short: "Meds", icon: Pill },
]

export const ADMIN_NAV: NavItem[] = [
  { href: "/audit", label: "Audit log", short: "Audit", icon: ShieldCheck, permission: "audit" },
  { href: "/users", label: "Users & roles", short: "Users", icon: Users, permission: "admin" },
  { href: "/master-data", label: "Master data", short: "Data", icon: Database, permission: "admin" },
]
