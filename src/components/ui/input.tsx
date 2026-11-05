import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-[0_1px_1px_rgb(20_35_42/0.03)] transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground/80 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/10",
        className
      )}
      {...props}
    />
  )
}

export { Input }
