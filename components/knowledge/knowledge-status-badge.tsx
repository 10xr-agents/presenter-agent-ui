"use client"

import { cn } from "@/lib/utils"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"

/**
 * Reusable Knowledge Status Badge
 * 
 * Displays the status of a knowledge exploration job.
 */

export type KnowledgeStatus = "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"

interface KnowledgeStatusBadgeProps {
  status: KnowledgeStatus
  className?: string
}

export function KnowledgeStatusBadge({ status, className }: KnowledgeStatusBadgeProps) {
  switch (status) {
    case "completed":
      return (
        <Badge 
          variant="outline" 
          className={cn(
            "border-green-600/50 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800/50",
            className
          )}
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      )
    case "running":
      return (
        <Badge 
          variant="outline" 
          className={cn(
            "border-primary/50 bg-primary/5 text-primary dark:bg-primary/10",
            className
          )}
        >
          <Spinner className="mr-1 h-3 w-3" />
          Running
        </Badge>
      )
    case "queued":
    case "pending":
      return (
        <Badge 
          variant="outline" 
          className={cn(
            "border-primary/50 bg-primary/5 text-primary dark:bg-primary/10",
            className
          )}
        >
          <Spinner className="mr-1 h-3 w-3" />
          Queued
        </Badge>
      )
    case "failed":
      return (
        <Badge 
          variant="outline" 
          className={cn(
            "border-destructive/50 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:border-destructive/50",
            className
          )}
        >
          <AlertCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      )
    case "cancelled":
      return (
        <Badge 
          variant="outline" 
          className={cn(
            "border-muted-foreground/50 bg-muted text-muted-foreground",
            className
          )}
        >
          Cancelled
        </Badge>
      )
    default:
      return null
  }
}
