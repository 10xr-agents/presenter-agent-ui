"use client"

import { AlertCircle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react"
import { useEffect, useState } from "react"
import { KnowledgeProgress } from "@/components/knowledge/knowledge-progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { KnowledgeStatus } from "@/lib/models/knowledge-source"

interface ProcessingStepProps {
  knowledgeId: string | null
  jobId: string | null
  workflowId: string | null
  onComplete: () => void
  onCancel?: () => void
  onResync?: () => void
}

export function ProcessingStep({
  knowledgeId,
  jobId,
  workflowId,
  onComplete,
  onCancel,
  onResync,
}: ProcessingStepProps) {
  const [isCancelling, setIsCancelling] = useState(false)
  const [isResyncing, setIsResyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<KnowledgeStatus | null>(null)
  // Track current job ID (may be updated after resync)
  const [currentJobId, setCurrentJobId] = useState<string | null>(jobId)
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(workflowId)

  // Update current job ID when prop changes
  useEffect(() => {
    setCurrentJobId(jobId)
    setCurrentWorkflowId(workflowId)
  }, [jobId, workflowId])

  // Fetch job status to determine if Cancel button should be shown
  // Also fetches latest jobId in case it was updated after resync
  useEffect(() => {
    if (!knowledgeId) return

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/knowledge/${knowledgeId}`)
        if (response.ok) {
          const result = (await response.json()) as { 
            data?: { 
              status?: KnowledgeStatus
              jobId?: string | null
              workflowId?: string | null
            } 
          }
          const status = result.data?.status
          const latestJobId = result.data?.jobId
          const latestWorkflowId = result.data?.workflowId
          
          if (status) {
            console.log("[ProcessingStep] Fetched job status:", { 
              knowledgeId, 
              status, 
              previousStatus: jobStatus,
              jobId: latestJobId,
              previousJobId: currentJobId,
            })
            setJobStatus(status)
          }
          
          // Update job ID if it changed (e.g., after resync)
          if (latestJobId && latestJobId !== currentJobId) {
            console.log("[ProcessingStep] Job ID updated after resync:", {
              knowledgeId,
              oldJobId: currentJobId,
              newJobId: latestJobId,
            })
            setCurrentJobId(latestJobId)
            setCurrentWorkflowId(latestWorkflowId || null)
          }
        }
      } catch (err: unknown) {
        console.debug("Failed to fetch knowledge status:", err)
      }
    }

    fetchStatus()
    // Poll status every 5 seconds while job is active (reduced from 3 seconds to reduce API load)
    const interval = setInterval(() => {
      fetchStatus()
    }, 5000)

    return () => clearInterval(interval)
  }, [knowledgeId, currentJobId])

  // Cancel button should be visible when job status is NOT in end states
  // Hidden when status is: "completed", "failed", "cancelled", "succeeded"
  // Visible when status is: "pending", "queued", "running" (any active state)
  // If jobStatus is null but we have jobId, assume it's in progress (default to showing cancel button)
  const endStates: string[] = ["completed", "failed", "cancelled", "succeeded"]
  const isJobInProgress = jobStatus ? !endStates.includes(jobStatus) : !!currentJobId // Default to true if jobId exists but status is null
  
  // Debug log for cancel button visibility
  if (process.env.NODE_ENV === "development") {
    console.log("[ProcessingStep] Cancel button visibility check:", {
      knowledgeId,
      jobId: currentJobId,
      jobStatus,
      isJobInProgress,
      endStates,
      shouldShowCancel: isJobInProgress,
    })
  }

  const handleCancel = async () => {
    if (!knowledgeId) return

    setIsCancelling(true)
    setError(null)

    try {
      const response = await fetch(`/api/knowledge/${knowledgeId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = (await response.json()) as { data?: unknown; error?: string }

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel knowledge extraction")
      }

      onCancel?.()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to cancel knowledge extraction"
      setError(errorMessage)
    } finally {
      setIsCancelling(false)
    }
  }

  const handleResync = async () => {
    if (!knowledgeId) return

    setIsResyncing(true)
    setError(null)

    try {
      const response = await fetch(`/api/knowledge/${knowledgeId}/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to re-sync knowledge")
      }

      const result = (await response.json()) as { 
        data?: { 
          jobId?: string | null
          workflowId?: string | null
          status?: KnowledgeStatus
        } 
      }
      
      // Immediately fetch and update job ID after resync
      // Resync creates a new job, so we need to use the new job ID for status queries
      const newJobId = result.data?.jobId
      const newWorkflowId = result.data?.workflowId
      const newStatus = result.data?.status
      
      if (newJobId && newJobId !== currentJobId) {
        console.log("[ProcessingStep] Job ID updated after resync:", {
          knowledgeId,
          oldJobId: currentJobId,
          newJobId,
        })
        setCurrentJobId(newJobId)
        setCurrentWorkflowId(newWorkflowId || null)
      }
      
      if (newStatus) {
        setJobStatus(newStatus)
      }

      // Resync will start a new job - the progress component will update
      onResync?.()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to re-sync knowledge"
      setError(errorMessage)
    } finally {
      setIsResyncing(false)
    }
  }

  if (!knowledgeId) {
    return (
      <div className="space-y-6">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Processing Knowledge Extraction</h3>
          <p className="mt-0.5 text-xs text-foreground">
            Preparing to extract and index knowledge from your sources...
          </p>
        </div>
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Spinner className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-foreground">Preparing knowledge extraction...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">Processing Knowledge Extraction</h3>
        <p className="mt-0.5 text-xs text-foreground">
          Extracting and indexing knowledge from your sources. This may take a few moments.
        </p>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {jobStatus === "failed" ? (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Knowledge extraction failed
                </div>
                <p className="text-xs text-foreground">
                  The extraction process encountered an error. You can try resyncing to retry.
                </p>
              </>
            ) : jobStatus === "completed" ? (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Knowledge extraction completed
                </div>
                <p className="text-xs text-foreground">
                  Your knowledge has been successfully extracted and indexed.
                </p>
              </>
            ) : jobStatus === "cancelled" ? (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  Knowledge extraction cancelled
                </div>
                <p className="text-xs text-foreground">
                  The extraction process was cancelled. You can try resyncing to start again.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  Knowledge extraction in progress
                </div>
                <p className="text-xs text-foreground">
                  Processing your website and assets. You'll be able to review the results shortly.
                </p>
              </>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
            <KnowledgeProgress
              knowledgeId={knowledgeId}
              jobId={currentJobId}
              workflowId={currentWorkflowId}
              knowledgeStatus={jobStatus}
              onComplete={onComplete}
            />
            <div className="flex items-center gap-2 pt-2">
              {isJobInProgress && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isCancelling || isResyncing}
                >
                  <X className="mr-2 h-3.5 w-3.5" />
                  {isCancelling ? "Cancelling..." : "Cancel"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleResync}
                disabled={isCancelling || isResyncing}
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isResyncing ? "animate-spin" : ""}`} />
                {isResyncing ? "Resyncing..." : "Resync"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
