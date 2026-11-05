"use client"

import type { ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { PageTabs } from "@/components/common/filters"
import { PageHeader } from "@/components/common/page-header"
import { RequirePermission } from "@/components/layout/require-permission"

import { GlossaryTab } from "./glossary-tab"
import { KennelsTab } from "./kennels-tab"
import { RulesTab } from "./rules-tab"
import { SpeciesTab } from "./species-tab"
import { TaxonomyTab } from "./taxonomy-tab"
import { TemplatesTab } from "./templates-tab"

export type MasterTab = "kennels" | "species" | "templates" | "taxonomy" | "glossary" | "rules"

const TABS: { value: MasterTab; label: string }[] = [
  { value: "kennels", label: "Kennels & rooms" },
  { value: "species", label: "Species" },
  { value: "templates", label: "Checklist templates" },
  { value: "taxonomy", label: "Symptom taxonomy" },
  { value: "glossary", label: "AQC glossary" },
  { value: "rules", label: "Notification rules" },
]

/** Renders the page header (with tab-specific actions), the tab bar and the tab body. */
export type FrameRenderer = (actions: ReactNode, body: ReactNode) => ReactNode

export function MasterDataScreen() {
  return (
    <RequirePermission permission="admin" page="Master data">
      <MasterData />
    </RequirePermission>
  )
}

function MasterData() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const raw = params.get("tab")
  const tab: MasterTab = TABS.some((t) => t.value === raw) ? (raw as MasterTab) : "kennels"
  const templateParam = params.get("template")

  const go = (next: MasterTab, extra: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ tab: next, ...extra })
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
  }

  const frame: FrameRenderer = (actions, body) => (
    <div className="space-y-6">
      <PageHeader
        title="Master data"
        description="Reference data used by the mobile app and AI worker · editable without a deployment · every change is audited"
        actions={actions}
      />
      <PageTabs tabs={TABS} value={tab} onChange={(t) => go(t)} />
      {body}
    </div>
  )

  switch (tab) {
    case "species":
      return <SpeciesTab frame={frame} onOpenTemplate={(id) => go("templates", { template: id })} />
    case "templates":
      return <TemplatesTab frame={frame} selectedId={templateParam} onSelect={(id) => go("templates", { template: id })} />
    case "taxonomy":
      return <TaxonomyTab frame={frame} />
    case "glossary":
      return <GlossaryTab frame={frame} />
    case "rules":
      return <RulesTab frame={frame} />
    default:
      return <KennelsTab frame={frame} />
  }
}
