"use client"

import { AlertCircle, CheckCircle2, Clock, Loader2, Pause, Play } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { createKnowledgeWebSocket, type WebSocketMessage } from "@/lib/browser-automation/websocket"
import { cn } from "@/lib/utils"

interface JobProgress {
  completed: number
  queued: number
  failed: number
  current_url: string | null
  estimated_time_remaining?: number
  processing_rate?: number
  recent_pages?: Array<{
    url: string
    title: string
    completed_at: string
  }>
}

interface WebsiteKnowledgeProgressProps {
  knowledgeId: string
  onComplete?: () => void
  onError?: (error: string) => void
  className?: string
}

export function WebsiteKnowledgeProgress({
  knowledgeId,
  onComplete,
  onError,
  className,
}: WebsiteKnowledgeProgressProps) {
  const [status, setStatus] = useState<"idle" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled">("idle")
  const [progress, setProgress] = useState<JobProgress>({
    completed: 0,
    queued: 0,
    failed: 0,
    current_url: null,
  })
  const [isPaused, setIsPaused] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [useWebSocket, setUseWebSocket] = useState(false)
  const wsRef = useRef<{ ws: WebSocket; close: () => void } | null>(null)
  const [explorationJobId, setExplorationJobId] = useState<string | null>(null)

  // Fetch initial status and get exploration job ID
  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/website-knowledge/${knowledgeId}`)
      if (!response.ok) {
        throw new Error("Failed to fetch knowledge")
      }

      const result = (await response.json()) as {
        data?: {
          status: string
          explorationJobId: string | null
          jobStatus?: {
            status: string
            progress: JobProgress
            started_at?: string
            updated_at?: string
          }
        }
      }

      if (result.data) {
        setStatus(result.data.status as typeof status)
        if (result.data.explorationJobId) {
          setExplorationJobId(result.data.explorationJobId)
        }
        if (result.data.jobStatus) {
          setProgress(result.data.jobStatus.progress)
        }

        if (result.data.status === "completed") {
          onComplete?.()
        } else if (result.data.status === "failed") {
          onError?.("Exploration failed")
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch status"
      setError(errorMessage)
      onError?.(errorMessage)
    }
  }

  // Fetch status via API (fallback)
  const fetchStatusViaAPI = async () => {
    if (!explorationJobId) return

    try {
      const response = await fetch(`/api/website-knowledge/${knowledgeId}/status`)
      if (!response.ok) {
        throw new Error("Failed to fetch status")
      }

      const result = (await response.json()) as {
        data?: {
          status: string
          progress: JobProgress
          started_at?: string
          updated_at?: string
        }
      }

      if (result.data) {
        setStatus(result.data.status as typeof status)
        setProgress(result.data.progress)
        setError(null)

        if (result.data.status === "completed") {
          onComplete?.()
        } else if (result.data.status === "failed") {
          onError?.("Exploration failed")
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch status"
      setError(errorMessage)
      onError?.(errorMessage)
    }
  }

  useEffect(() => {
    if (!knowledgeId) return

    // Initial fetch to get job ID
    fetchStatus()
  }, [knowledgeId])

  // WebSocket connection for real-time updates
  useEffect(() => {
    if (!explorationJobId || !["queued", "running"].includes(status)) {
      return
    }

    // Try WebSocket first, fallback to polling
    try {
      const { ws, close } = createKnowledgeWebSocket(
        explorationJobId,
        (message: WebSocketMessage) => {
          if (message.type === "progress" && message.data) {
            setProgress({
              completed: message.data.completed || 0,
              queued: message.data.queued || 0,
              failed: message.data.failed || 0,
              current_url: message.data.current_url || null,
              estimated_time_remaining: message.data.estimated_time_remaining,
              processing_rate: message.data.processing_rate,
            })
            if (message.data.status) {
              setStatus(message.data.status as typeof status)
            }
          } else if (message.type === "page_completed" && message.data && message.data.page) {
            // Update recent pages if available
            const page = message.data.page
            setProgress((prev) => ({
              ...prev,
              completed: (prev.completed || 0) + 1,
              recent_pages: [
                {
                  url: page.url,
                  title: page.title,
                  completed_at: page.completed_at,
                },
                ...(prev.recent_pages || []).slice(0, 9), // Keep last 10
              ],
            }))
          } else if (message.type === "completed") {
            setStatus("completed")
            onComplete?.()
          } else if (message.type === "failed") {
            setStatus("failed")
            onError?.("Exploration failed")
          } else if (message.type === "cancelled") {
            setStatus("cancelled")
          }
        },
        () => {
          // On WebSocket error, fallback to polling
          setUseWebSocket(false)
        }
      )

      wsRef.current = { ws, close }
      setUseWebSocket(true)

      return () => {
        close()
        wsRef.current = null
      }
    } catch (err: unknown) {
      // WebSocket not available, use polling
      console.warn("WebSocket not available, falling back to polling:", err)
      setUseWebSocket(false)
    }
  }, [explorationJobId, status, onComplete, onError])

  // Polling fallback (when WebSocket not available)
  useEffect(() => {
    if (!explorationJobId || useWebSocket || !["queued", "running"].includes(status)) {
      return
    }

    const interval = setInterval(() => {
      fetchStatusViaAPI()
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [explorationJobId, useWebSocket, status, knowledgeId])

  const handlePauseResume = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/website-knowledge/${knowledgeId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isPaused ? "resume" : "pause" }),
      })

      if (!response.ok) {
        throw new Error("Failed to control job")
      }

      setIsPaused(!isPaused)
      await fetchStatus()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to control job"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const total = progress.completed + progress.queued + progress.failed
  const progressPercent = total > 0 ? (progress.completed / total) * 100 : 0

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
      case "failed":
      case "cancelled":
        return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
      case "running":
      case "queued":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      default:
        return null
    }
  }

  const getStatusText = () => {
    switch (status) {
      case "queued":
        return "Queued"
      case "running":
        return "Exploring website"
      case "paused":
        return "Paused"
      case "completed":
        return "Completed"
      case "failed":
        return "Failed"
      case "cancelled":
        return "Cancelled"
      default:
        return "Idle"
    }
  }

  if (status === "completed" || status === "failed" || status === "cancelled") {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center gap-2 text-xs">
          {getStatusIcon()}
          <span className={cn(
            "font-medium",
            status === "completed" ? "text-green-600" : "text-destructive"
          )}>
            {getStatusText()}
          </span>
        </div>
        {status === "completed" && (
          <p className="text-xs text-muted-foreground">
            {progress.completed} pages explored
          </p>
        )}
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          {getStatusIcon()}
          <span className="font-medium">{getStatusText()}</span>
        </div>
        {["running", "paused"].includes(status) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePauseResume}
            disabled={isLoading}
            className="h-7 text-xs"
          >
            {isPaused ? (
              <>
                <Play className="mr-1 h-3 w-3" />
                Resume
              </>
            ) : (
              <>
                <Pause className="mr-1 h-3 w-3" />
                Pause
              </>
            )}
          </Button>
        )}
      </div>

      {total > 0 && (
        <div className="space-y-1.5">
          <Progress value={progressPercent} className="h-1.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {progress.completed} / {total} pages
            </span>
            <div className="flex items-center gap-3">
              {progress.processing_rate && (
                <span>{Math.round(progress.processing_rate)} pages/min</span>
              )}
              {progress.queued > 0 && <span>{progress.queued} queued</span>}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced metrics */}
      {(progress.estimated_time_remaining || progress.processing_rate) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
          {progress.estimated_time_remaining && progress.estimated_time_remaining > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>
                ~{Math.ceil(progress.estimated_time_remaining / 60)} min remaining
              </span>
            </div>
          )}
          {progress.processing_rate && (
            <span>{Math.round(progress.processing_rate)} pages/min</span>
          )}
        </div>
      )}

      {/* Recent pages */}
      {progress.recent_pages && progress.recent_pages.length > 0 && (
        <div className="space-y-1 pt-1 border-t">
          <p className="text-xs font-semibold text-muted-foreground">Recent pages:</p>
          <div className="space-y-0.5">
            {progress.recent_pages.slice(0, 3).map((page, index) => (
              <p key={index} className="text-xs text-muted-foreground truncate">
                {page.title || page.url}
              </p>
            ))}
          </div>
        </div>
      )}

      {progress.current_url && (
        <p className="text-xs text-muted-foreground truncate">
          Exploring: {progress.current_url}
        </p>
      )}

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
