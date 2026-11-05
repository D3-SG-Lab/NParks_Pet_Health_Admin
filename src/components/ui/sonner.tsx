"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  CircleAlertIcon,
  Loader2Icon,
} from "lucide-react"

/**
 * Toasts follow the "Toasts & banners" reference (Admin_Design.pdf p.17):
 * solid green for success, solid red for errors, soft amber/blue otherwise.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-[18px]" />,
        info: <InfoIcon className="size-[18px]" />,
        warning: <TriangleAlertIcon className="size-[18px]" />,
        error: <CircleAlertIcon className="size-[18px]" />,
        loading: <Loader2Icon className="size-[18px] animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(92vw,420px)] items-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-medium shadow-[var(--shadow-raised)] font-sans",
          title: "leading-snug",
          description: "text-[13px] font-normal opacity-90",
          success: "border-transparent bg-[#146c42] text-white",
          error: "border-transparent bg-[#8e1c12] text-white",
          warning: "border-warning-border bg-warning-soft text-warning",
          info: "border-info-border bg-info-soft text-info",
          default: "border-border bg-card text-foreground",
          actionButton:
            "ml-auto shrink-0 rounded-md px-2 py-1 text-sm font-semibold underline-offset-4 hover:underline",
          cancelButton: "shrink-0 rounded-md px-2 py-1 text-sm",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
