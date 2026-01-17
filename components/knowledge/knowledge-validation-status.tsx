"use client"

import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type ValidationConfidence = "high" | "medium" | "low" | "none"

interface KnowledgeValidationStatusProps {
  confidence?: ValidationConfidence
  issues?: string[]
  extractedPages: number
  extractedLinks: number
  hasUsableContent?: boolean
  className?: string
}

export function KnowledgeValidationStatus({
  confidence = "none",
  issues = [],
  extractedPages,
  extractedLinks,
  hasUsableContent = false,
  className,
}: KnowledgeValidationStatusProps) {
  if (confidence === "none" && issues.length === 0) {
    return null
  }

  const getConfidenceBadge = () => {
    switch (confidence) {
      case "high":
        return (
          <Badge 
            variant="outline" 
            className="border-green-600/50 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800/50"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            High Confidence
          </Badge>
        )
      case "medium":
        return (
          <Badge 
            variant="outline" 
            className="border-yellow-600/50 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800/50"
          >
            <AlertTriangle className="mr-1 h-3 w-3" />
            Medium Confidence
          </Badge>
        )
      case "low":
        return (
          <Badge 
            variant="outline" 
            className="border-orange-600/50 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800/50"
          >
            <Info className="mr-1 h-3 w-3" />
            Low Confidence
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Confidence Badge */}
      {confidence !== "none" && (
        <div className="flex items-center gap-2">
          {getConfidenceBadge()}
          <span className="text-xs text-muted-foreground">
            {extractedPages} pages • {extractedLinks} links
            {hasUsableContent && " • Content verified"}
          </span>
        </div>
      )}

      {/* Issues/Warnings */}
      {issues.length > 0 && (
        <Alert className="py-2" variant={confidence === "low" ? "destructive" : "default"}>
          <AlertCircle className="h-3.5 w-3.5" />
          <AlertTitle className="text-xs font-semibold">
            Validation {issues.length === 1 ? "Issue" : "Issues"} ({issues.length})
          </AlertTitle>
          <AlertDescription className="text-xs mt-1 space-y-1">
            {issues.slice(0, 5).map((issue, index) => (
              <div key={index} className="flex items-start gap-1.5">
                <span className="text-muted-foreground">•</span>
                <span>{issue}</span>
              </div>
            ))}
            {issues.length > 5 && (
              <div className="text-muted-foreground text-xs mt-1">
                +{issues.length - 5} more issue{issues.length - 5 !== 1 ? "s" : ""}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
