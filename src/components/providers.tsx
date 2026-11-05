"use client"

import type { ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getQueryClient } from "@/lib/query"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
