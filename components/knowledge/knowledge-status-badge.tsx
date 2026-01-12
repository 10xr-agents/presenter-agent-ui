"use client"

import { cn } from "@/lib/utils"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

/**
 * Reusable Knowledge Status Badge
 * 
 * Displays the status of a knowledge exploration job.
 */

export type KnowledgeStatus = "pending" | "exploring" | "completed" | "failed" | "cancelled"

interface KnowledgeStatusBadgeProps {
  status: KnowledgeStatus
  className?: string
}

export function KnowledgeStatusBadge({ status, className }: KnowledgeStatusBadgeProps) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="outline" className={cn("border-green-600 text-green-600", className)}>
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      )
    case "exploring":
    case "pending":
      return (
        <Badge variant="outline" className={cn("border-primary text-primary", className)}>
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          {status === "exploring" ? "Exploring" : "Queued"}
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="outline" className={cn("border-destructive text-destructive", className)}>
          <AlertCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      )
    case "cancelled":
      return (
        <Badge variant="outline" className={cn("border-muted-foreground text-muted-foreground", className)}>
          Cancelled
        </Badge>
      )
    default:
      return null
  }
}
