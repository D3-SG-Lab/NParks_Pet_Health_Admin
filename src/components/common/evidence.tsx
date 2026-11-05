"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Image as ImageIcon, Lock, Play, X, ZoomIn, ZoomOut } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { fmtDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { MediaRef } from "@/types/domain"

/**
 * Evidence thumbnails + lightbox viewer (FE-024, p.17).
 * Media is served through short-lived read URLs in production; the POC uses
 * placeholders and never offers a download (view only).
 */
export function MediaThumb({
  media,
  onClick,
  size = "md",
  className,
}: {
  media: MediaRef
  onClick?: () => void
  size?: "sm" | "md"
  className?: string
}) {
  const video = media.kind === "video"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${video ? "Play video" : "View photo"}: ${media.caption}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-transform hover:scale-[1.02] focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-none",
        size === "md" ? "size-[72px]" : "size-14",
        video
          ? "bg-[#23343e] text-white"
          : "border border-border bg-[repeating-linear-gradient(135deg,#eef2f1_0_6px,#f7f9f8_6px_12px)] text-muted-foreground",
        className
      )}
    >
      {video ? <Play className="size-5 fill-current" aria-hidden /> : <ImageIcon className="size-5" aria-hidden />}
    </button>
  )
}

interface EvidenceViewerProps {
  items: MediaRef[]
  index: number | null
  onIndexChange: (index: number | null) => void
  /** Header line, e.g. "Soft stool · KC2-2 Yang Yang". */
  title: string
  /** Sub-line author/record, resolved by caller. */
  subtitle?: (m: MediaRef) => string
}

export function EvidenceViewer({ items, index, onIndexChange, title, subtitle }: EvidenceViewerProps) {
  const [zoom, setZoom] = useState(1)
  const open = index !== null && items.length > 0
  const current = open ? items[index] : null

  const go = useCallback(
    (delta: number) => {
      if (index === null) return
      setZoom(1)
      onIndexChange((index + delta + items.length) % items.length)
    },
    [index, items.length, onIndexChange]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1)
      if (e.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, go])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[min(96vw,880px)] gap-0 overflow-hidden rounded-2xl border-0 bg-[#111719] p-0 text-white sm:max-w-[min(96vw,880px)]"
        onContextMenu={(e) => e.preventDefault()}
      >
        {current ? (
          <>
            <div className="flex items-start justify-between gap-3 bg-[#0b0f10] px-5 py-3.5">
              <div className="min-w-0">
                <DialogTitle className="truncate text-[15px] font-semibold text-white">
                  {current.caption} · {title}
                </DialogTitle>
                <DialogDescription className="truncate text-xs text-white/70">
                  {subtitle ? subtitle(current) : fmtDateTime(current.at)}
                </DialogDescription>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="mr-1 text-sm text-white/70 tabular-nums">
                  {index! + 1} of {items.length}
                </span>
                {current.kind === "photo" ? (
                  <button
                    type="button"
                    onClick={() => setZoom((z) => (z >= 2 ? 1 : z + 0.5))}
                    className="inline-flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                    aria-label={zoom >= 2 ? "Reset zoom" : "Zoom in"}
                  >
                    {zoom >= 2 ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onIndexChange(null)}
                  className="inline-flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Close viewer"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="relative flex h-[min(56vh,440px)] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#263033,#161d1f)]">
              <div className="flex flex-col items-center gap-2 text-white/60 transition-transform" style={{ transform: `scale(${zoom})` }}>
                {current.kind === "video" ? (
                  <Play className="size-12 fill-current" aria-hidden />
                ) : (
                  <ImageIcon className="size-12" aria-hidden />
                )}
                <span className="text-sm">{current.kind === "video" ? "Video · plays in place" : "Photo · scroll or pinch to zoom"}</span>
              </div>
              {items.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    className="absolute top-1/2 left-4 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    className="absolute top-1/2 right-4 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
                    aria-label="Next"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b0f10] px-5 py-3">
              <div className="flex gap-2">
                {items.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setZoom(1)
                      onIndexChange(i)
                    }}
                    aria-label={`Show item ${i + 1}`}
                    className={cn(
                      "inline-flex size-12 items-center justify-center rounded-lg",
                      m.kind === "video" ? "bg-[#23343e]" : "bg-white/10",
                      i === index && "ring-2 ring-white"
                    )}
                  >
                    {m.kind === "video" ? <Play className="size-4 fill-current" /> : null}
                  </button>
                ))}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-white/70">
                <Lock className="size-3.5" aria-hidden /> View only · link expires in 10 min · download disabled
              </p>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
