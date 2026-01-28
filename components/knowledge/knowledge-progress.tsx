"use client"

import { AlertCircle, CheckCircle2, Clock, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { getWorkflowStatus, type WorkflowStatusResponse } from "@/lib/knowledge-extraction/client"
import { cn } from "@/lib/utils"

interface KnowledgeProgressProps {
  knowledgeId: string
  jobId: string | null
  workflowId: string | null
  knowledgeStatus?: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled" | null
  onComplete?: () => void
  onError?: (error: string) => void
  className?: string
}

export function KnowledgeProgress({
  knowledgeId,
  jobId,
  workflowId,
  knowledgeStatus,
  onComplete,
  onError,
  className,
}: KnowledgeProgressProps) {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [consecutiveErrors, setConsecutiveErrors] = useState(0)
  const [isPollingPaused, setIsPollingPaused] = useState(false)
  const lastFetchTimeRef = useRef<number>(0)
  const MAX_CONSECUTIVE_ERRORS = 3 // Stop polling after 3 consecutive errors

  // Fetch workflow status from knowledge extraction API
  const fetchWorkflowStatus = useCallback(async (isManualRetry = false) => {
    if (!jobId) return

    // Prevent concurrent fetches and throttle rapid calls
    const now = Date.now()
    const MIN_FETCH_INTERVAL = 3000 // Minimum 3 seconds between fetches
    if (isFetching || (!isManualRetry && now - lastFetchTimeRef.current < MIN_FETCH_INTERVAL)) {
      return
    }

    // If polling is paused and this isn't a manual retry, don't fetch
    if (isPollingPaused && !isManualRetry) {
      return
    }

    try {
      setIsFetching(true)
      setIsLoading(true)
      // Clear error on manual retry
      if (isManualRetry) {
        setError(null)
        setConsecutiveErrors(0)
        setIsPollingPaused(false)
      }
      lastFetchTimeRef.current = now

      const status = await getWorkflowStatus(jobId)

      console.log("[Knowledge Progress] Workflow status fetched", {
        knowledgeId,
        jobId,
        workflowId,
        status: status.status,
        phase: status.phase,
        progress: status.progress,
      })

      // Reset error count on successful fetch
      setConsecutiveErrors(0)
      setIsPollingPaused(false)
      setWorkflowStatus(status)
      setError(null) // Clear any previous errors

      // Handle completion
      if (status.status === "completed") {
        console.log("[Knowledge Progress] Workflow completed", {
          knowledgeId,
          jobId,
        })
        setIsPollingPaused(true) // Stop polling
        onComplete?.()
      } else if (status.status === "failed") {
        console.error("[Knowledge Progress] Workflow failed", {
          knowledgeId,
          jobId,
          errors: status.errors,
        })
        const errorMessage = status.errors.length > 0 && status.errors[0]
          ? status.errors[0] 
          : "Knowledge extraction failed"
        setError(errorMessage)
        setIsPollingPaused(true) // Stop polling on workflow failure
        onError?.(errorMessage)
      } else if (status.status === "cancelled") {
        console.log("[Knowledge Progress] Workflow cancelled", {
          knowledgeId,
          jobId,
        })
        setIsPollingPaused(true) // Stop polling
      }
    } catch (err: unknown) {
      // Extract error details with better handling
      let errorMessage = "Failed to fetch workflow status"
      const errorDetails: Record<string, unknown> = {
        knowledgeId,
        jobId,
      }
      
      if (err instanceof Error) {
        errorMessage = err.message
        const errorWithStatus = err as Error & { statusCode?: number; isNotFound?: boolean; isNetworkError?: boolean }
        
        // Add status code if available
        if (errorWithStatus.statusCode !== undefined) {
          errorDetails.statusCode = errorWithStatus.statusCode
        }
        
        // Handle specific error types
        if (errorWithStatus.isNotFound) {
          errorMessage = "Workflow not found. It may have been deleted or the job ID is invalid."
          errorDetails.isNotFound = true
        } else if (errorWithStatus.isNetworkError) {
          errorMessage = "Unable to connect to knowledge extraction service. Please check your connection."
          errorDetails.isNetworkError = true
        }
        
        errorDetails.error = errorMessage
        errorDetails.errorStack = err.stack
      } else {
        errorDetails.error = String(err)
        errorDetails.errorType = typeof err
      }
      
      console.error("[Knowledge Progress] Error fetching workflow status", errorDetails)
      
      // Increment consecutive error count
      const newErrorCount = consecutiveErrors + 1
      setConsecutiveErrors(newErrorCount)
      setError(errorMessage)
      
      // Pause polling after MAX_CONSECUTIVE_ERRORS consecutive errors
      if (newErrorCount >= MAX_CONSECUTIVE_ERRORS) {
        setIsPollingPaused(true)
        console.warn("[Knowledge Progress] Stopping automatic polling due to consecutive errors", {
          consecutiveErrors: newErrorCount,
        })
      }
      
      onError?.(errorMessage)
    } finally {
      setIsLoading(false)
      setIsFetching(false)
    }
  }, [jobId, knowledgeId, workflowId, onComplete, onError, isFetching, consecutiveErrors, isPollingPaused])

  // Initial fetch
  useEffect(() => {
    if (!jobId) return
    fetchWorkflowStatus(false) // Initial fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  // Polling for active workflows - throttled to prevent excessive API calls
  // Only polls when workflow is active and polling is not paused
  useEffect(() => {
    if (!jobId || !workflowStatus) return
    if (!["queued", "running"].includes(workflowStatus.status)) {
      return
    }
    if (isPollingPaused) {
      return // Don't poll when paused (e.g., after errors)
    }

    // Use a longer interval to reduce API call frequency
    const interval = setInterval(() => {
      fetchWorkflowStatus(false) // Automatic poll
    }, 5000) // Poll every 5 seconds (reduced from 3 seconds)

    return () => clearInterval(interval)
  }, [jobId, workflowStatus?.status, fetchWorkflowStatus, isPollingPaused])

  const getStatusIcon = () => {
    if (!workflowStatus) return null

    switch (workflowStatus.status) {
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
      case "failed":
      case "cancelled":
        return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
      case "running":
      case "queued":
        return <Spinner className="h-3.5 w-3.5 text-primary" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    if (!workflowStatus) return "Loading..."

    switch (workflowStatus.status) {
      case "queued":
        return "Queued"
      case "running":
        return workflowStatus.phase 
          ? `Running: ${workflowStatus.phase.replace(/_/g, " ")}`
          : "Running"
      case "completed":
        return "Completed"
      case "failed":
        return "Failed"
      case "cancelled":
        return "Cancelled"
      default:
        return "Unknown"
    }
  }

  if (!jobId) {
    return null
  }

  // If workflowStatus is null but we have knowledgeStatus from the knowledge source, use that as fallback
  // This handles cases where the workflow API is unavailable but the knowledge source status is updated
  if (!workflowStatus) {
    // Check if knowledge source status indicates an end state
    if (knowledgeStatus === "failed") {
      return (
        <div className={cn("space-y-2", className)}>
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="font-medium text-destructive">Failed</span>
          </div>
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">
              Knowledge extraction failed. Please try resyncing or check the error details.
            </AlertDescription>
          </Alert>
        </div>
      )
    }
    if (knowledgeStatus === "completed") {
      return (
        <div className={cn("space-y-2", className)}>
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            <span className="font-medium text-green-600">Completed</span>
          </div>
        </div>
      )
    }
    if (knowledgeStatus === "cancelled") {
      return (
        <div className={cn("space-y-2", className)}>
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="font-medium text-destructive">Cancelled</span>
          </div>
        </div>
      )
    }
    
    // Show error with retry button if we have an error and polling is paused
    if (error && isPollingPaused) {
      return (
        <div className={cn("space-y-2", className)}>
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="font-medium text-destructive">Error</span>
          </div>
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs space-y-2">
              <div>{error}</div>
              {consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && (
                <div className="pt-1 border-t border-destructive/20">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Automatic status checks have been paused after {consecutiveErrors} consecutive errors.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fetchWorkflowStatus(true)}
                    disabled={isFetching}
                    className="h-7 text-xs"
                  >
                    <RefreshCw className={cn("mr-1.5 h-3 w-3", isFetching && "animate-spin")} />
                    Retry
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        </div>
      )
    }
    
    // Still loading - show spinner
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 text-xs">
          <Spinner className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium">Loading status...</span>
        </div>
      </div>
    )
  }

  if (workflowStatus.status === "completed" || workflowStatus.status === "failed" || workflowStatus.status === "cancelled") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 text-xs">
          {getStatusIcon()}
          <span className={cn(
            "font-medium",
            workflowStatus.status === "completed" ? "text-green-600" : "text-destructive"
          )}>
            {getStatusText()}
          </span>
        </div>
        {workflowStatus.status === "completed" && workflowStatus.checkpoints.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {workflowStatus.checkpoints[workflowStatus.checkpoints.length - 1]?.items_processed || 0} items processed
            </p>
            {workflowStatus.checkpoints.length > 1 && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {workflowStatus.checkpoints.map((checkpoint, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="capitalize text-xs">{checkpoint.activity_name.replace(/_/g, " ")}</span>
                    <span className="text-xs">
                      {checkpoint.items_processed}/{checkpoint.total_items} ({Math.round(checkpoint.progress_percentage)}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {workflowStatus.status === "failed" && workflowStatus.errors.length > 0 && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs space-y-1">
              <div className="font-semibold">Extraction failed</div>
              {workflowStatus.errors.slice(0, 3).map((error, index) => (
                <div key={index} className="flex items-start gap-1.5 pt-1 border-t">
                  <span className="text-muted-foreground">•</span>
                  <span>{error}</span>
                </div>
              ))}
              {workflowStatus.errors.length > 3 && (
                <div className="text-muted-foreground text-xs pt-1 border-t">
                  +{workflowStatus.errors.length - 3} more error{workflowStatus.errors.length - 3 !== 1 ? "s" : ""}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
        {workflowStatus.warnings.length > 0 && (
          <Alert className="py-2 bg-yellow-50 border-yellow-200">
            <AlertDescription className="text-xs space-y-1">
              <div className="font-semibold">Warnings</div>
              {workflowStatus.warnings.slice(0, 3).map((warning, index) => (
                <div key={index} className="flex items-start gap-1.5 pt-1 border-t border-yellow-200">
                  <span className="text-muted-foreground">•</span>
                  <span>{warning}</span>
                </div>
              ))}
              {workflowStatus.warnings.length > 3 && (
                <div className="text-muted-foreground text-xs pt-1 border-t border-yellow-200">
                  +{workflowStatus.warnings.length - 3} more warning{workflowStatus.warnings.length - 3 !== 1 ? "s" : ""}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-xs">
        {getStatusIcon()}
        <span className="font-medium">{getStatusText()}</span>
      </div>

      {/* Progress bar */}
      {workflowStatus.progress !== undefined && (
        <div className="space-y-1.5">
          <Progress value={workflowStatus.progress} className="h-1.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{Math.round(workflowStatus.progress)}% complete</span>
            {workflowStatus.metadata.estimated_completion && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  {new Date(workflowStatus.metadata.estimated_completion).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkpoints */}
      {workflowStatus.checkpoints.length > 0 && (
        <div className="space-y-1 pt-1 border-t">
          <p className="text-xs font-semibold text-muted-foreground">Progress:</p>
          <div className="space-y-1">
            {workflowStatus.checkpoints.map((checkpoint, index) => (
              <div key={index} className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="capitalize">{checkpoint.activity_name.replace(/_/g, " ")}</span>
                <span>
                  {checkpoint.items_processed} / {checkpoint.total_items} ({Math.round(checkpoint.progress_percentage)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {workflowStatus.warnings.length > 0 && (
        <Alert className="py-2 bg-yellow-50 border-yellow-200">
          <AlertDescription className="text-xs">
            {workflowStatus.warnings[0]}
          </AlertDescription>
        </Alert>
      )}

      {/* Fetch Error Display - with retry button */}
      {error && isPollingPaused && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs space-y-2">
            <div>{error}</div>
            {consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && (
              <div className="pt-1 border-t border-destructive/20">
                <p className="mb-2 text-xs text-muted-foreground">
                  Automatic status checks have been paused after {consecutiveErrors} consecutive errors.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fetchWorkflowStatus(true)}
                  disabled={isFetching}
                  className="h-7 text-xs"
                >
                  <RefreshCw className={cn("mr-1.5 h-3 w-3", isFetching && "animate-spin")} />
                  Retry
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
