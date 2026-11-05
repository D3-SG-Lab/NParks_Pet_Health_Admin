"use client"

import type { ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  /** Extra body (e.g. a reason field). */
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  icon?: ReactNode
  loading?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
}

/** Confirmation dialog — modelled on "Close case C-0142?" (p.17). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  icon,
  loading,
  confirmDisabled,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <AlertDialogContent className="gap-5 rounded-2xl p-6 sm:max-w-[520px]">
        <AlertDialogHeader className="flex-row items-start gap-4 space-y-0 text-left">
          {icon ? (
            <span
              className={cn(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-xl",
                destructive ? "bg-destructive-soft text-destructive" : "bg-primary-soft text-primary"
              )}
            >
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 space-y-1">
            <AlertDialogTitle className="text-lg font-semibold">{title}</AlertDialogTitle>
            {description ? (
              <AlertDialogDescription className="text-[15px] text-muted-foreground">{description}</AlertDialogDescription>
            ) : null}
          </div>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={loading}>
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} loading={loading} disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
