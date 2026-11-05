"use client"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ChecklistItem } from "@/types/domain"

/** Phone-frame preview of the inspection form with every item at its default (FE-009). */
export function MobilePreviewDialog({
  open,
  onOpenChange,
  title,
  items,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  items: ChecklistItem[]
}) {
  const sections = Array.from(new Set(items.map((i) => i.section)))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogTitle className="text-lg font-semibold">Preview on mobile</DialogTitle>
        <DialogDescription>
          How officers and contractors see this checklist. Every item starts at its default, so a healthy animal takes a few taps.
        </DialogDescription>
        <div className="mx-auto w-[320px] max-w-full rounded-[36px] border-[10px] border-[#14232a] bg-background shadow-[var(--shadow-raised)]">
          <div className="mx-auto mt-2 h-1.5 w-20 rounded-full bg-[#14232a]/80" aria-hidden />
          <div className="thin-scroll max-h-[520px] overflow-y-auto px-4 pt-3 pb-5">
            <p className="text-xs text-muted-foreground">KC2-2 · Yang Yang · AM session</p>
            <p className="mb-3 text-lg font-semibold">{title}</p>
            {sections.map((section) => (
              <div key={section} className="mb-4">
                <p className="eyebrow mb-2">{section}</p>
                <div className="space-y-2">
                  {items
                    .filter((i) => i.section === section)
                    .flatMap((i) => (i.rows.length ? i.rows.map((r) => ({ ...i, label: r, key: `${i.id}-${r}` })) : [{ ...i, key: i.id }]))
                    .map((i) => (
                      <div key={i.key} className="rounded-xl border border-border bg-card p-3">
                        <p className="mb-2 text-sm font-semibold">{i.label}</p>
                        {i.input === "free_text" ? (
                          <div className="h-14 rounded-lg border border-input bg-subtle px-2 py-1.5 text-xs text-muted-foreground">
                            Optional — anything else you noticed
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {i.options.map((o) => (
                              <span
                                key={o.label}
                                className={cn(
                                  "rounded-lg border px-2.5 py-1 text-xs font-semibold",
                                  o.label === i.defaultOption
                                    ? "border-primary bg-primary-soft text-primary"
                                    : "border-border text-muted-foreground"
                                )}
                              >
                                {o.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            ))}
            <div className="mt-2 rounded-xl bg-primary py-3 text-center text-sm font-semibold text-primary-foreground">
              Submit inspection
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
