"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageShellProps {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  maxWidth?: string
}

/**
 * PageShell - A reusable page layout component for consistent page structure
 * 
 * Provides:
 * - Standardized header with title, description, and optional action button
 * - Consistent spacing and layout
 * - Content constraint for centered, readable content width
 */
export function PageShell({
  title,
  description,
  action,
  children,
  className,
  maxWidth = "max-w-[1000px]",
}: PageShellProps) {
  return (
    <div className={cn("flex-1 space-y-4 p-8 pt-6", className)}>
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-foreground">{description}</p>
          )}
        </div>
        {action && (
          <div className="flex items-center gap-2">
            {action}
          </div>
        )}
      </div>

      {/* Content Section - Constrained width for readability */}
      <div className={cn(maxWidth, "mx-auto")}>
        {children}
      </div>
    </div>
  )
}
