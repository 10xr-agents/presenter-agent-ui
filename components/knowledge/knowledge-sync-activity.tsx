"use client"

import { CheckCircle2, Clock, XCircle, Eye } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface SyncActivity {
  id: string
  status: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"
  triggerType: "initial" | "resync"
  startedAt: string
  completedAt?: string
  phase?: string
  progress?: number
  pagesProcessed?: number
  linksProcessed?: number
  errorCount?: number
  errorMessages?: string[] // Renamed from 'errors' to avoid Mongoose reserved pathname
  warnings?: string[]
}

interface KnowledgeSyncActivityProps {
  knowledgeId: string
  currentStatus: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"
  startedAt?: string
  completedAt?: string
  pagesStored?: number
  linksStored?: number
  extractionErrors?: Array<{ message: string; phase?: string; timestamp?: string }>
  syncHistory?: Array<{
    jobId: string
    status: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"
    triggerType: "initial" | "resync"
    startedAt: string | Date
    completedAt?: string | Date
    phase?: string
    progress?: number
    errorMessages?: string[] // Renamed from 'errors' to avoid Mongoose reserved pathname
    warnings?: string[]
    pagesProcessed?: number
    linksProcessed?: number
    errorCount?: number
  }>
  createdAt: string
  className?: string
  onJobSelect?: (jobId: string | null) => void // Callback when user selects a job to view
  selectedJobId?: string | null // Currently selected job ID (null means latest)
}

export function KnowledgeSyncActivity({
  knowledgeId,
  currentStatus,
  startedAt,
  completedAt,
  pagesStored,
  linksStored,
  extractionErrors,
  syncHistory,
  createdAt,
  className,
  onJobSelect,
  selectedJobId,
}: KnowledgeSyncActivityProps) {
  // Build sync history from syncHistory array if available, otherwise fallback to current state
  const syncActivities: SyncActivity[] = syncHistory && syncHistory.length > 0
    ? syncHistory.map((sync) => ({
        id: sync.jobId,
        status: sync.status,
        triggerType: sync.triggerType,
        startedAt: typeof sync.startedAt === "string" ? sync.startedAt : sync.startedAt.toISOString(),
        completedAt: sync.completedAt
          ? typeof sync.completedAt === "string"
            ? sync.completedAt
            : sync.completedAt.toISOString()
          : undefined,
        phase: sync.phase,
        progress: sync.progress,
        pagesProcessed: sync.pagesProcessed,
        linksProcessed: sync.linksProcessed,
        errorCount: sync.errorCount,
        errorMessages: sync.errorMessages, // Renamed from 'errors' to avoid Mongoose reserved pathname
        warnings: sync.warnings,
      }))
    : [
        // Fallback: build from current state if no history exists (for backward compatibility)
        {
          id: knowledgeId,
          status: currentStatus,
          triggerType: "initial" as const,
          startedAt: startedAt || createdAt,
          completedAt: completedAt,
          pagesProcessed: pagesStored,
          linksProcessed: linksStored,
          errorCount: extractionErrors?.length || 0,
        },
      ]
  
  // Sort by startedAt descending (most recent first)
  syncActivities.sort((a, b) => {
    const dateA = new Date(a.startedAt).getTime()
    const dateB = new Date(b.startedAt).getTime()
    return dateB - dateA
  })

  const getStatusIcon = (status: SyncActivity["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
      case "failed":
        return <XCircle className="h-3.5 w-3.5 text-destructive" />
      case "pending":
      case "running":
        return <Clock className="h-3.5 w-3.5 text-foreground opacity-60" />
      case "cancelled":
        return <XCircle className="h-3.5 w-3.5 text-foreground opacity-60" />
      default:
        return <Clock className="h-3.5 w-3.5 text-foreground opacity-60" />
    }
  }

  const getStatusLabel = (status: SyncActivity["status"]) => {
    switch (status) {
      case "completed":
        return "Completed"
      case "failed":
        return "Failed"
      case "pending":
        return "Pending"
      case "running":
        return "In Progress"
      case "cancelled":
        return "Cancelled"
      default:
        return "Unknown"
    }
  }

  const getTriggerLabel = (triggerType: SyncActivity["triggerType"]) => {
    return triggerType === "initial" ? "Initial sync" : "Re-sync"
  }

  if (syncActivities.length === 0) {
    return null
  }

  // Calculate summary metrics
  const completedSyncs = syncActivities.filter((a) => a.status === "completed")
  const failedSyncs = syncActivities.filter((a) => a.status === "failed")
  const activeSyncs = syncActivities.filter((a) => ["pending", "queued", "running"].includes(a.status))
  const successRate = syncActivities.length > 0
    ? Math.round((completedSyncs.length / syncActivities.length) * 100)
    : 0
  
  const lastSuccessfulSync = completedSyncs.length > 0
    ? completedSyncs[0] // Already sorted by most recent first
    : null

  return (
    <div className={cn("space-y-4", className)}>
      {/* Summary Header */}
      <div className="flex items-center justify-between pb-2 border-b">
        <h3 className="text-sm font-semibold">Sync Activity</h3>
        {syncActivities.length > 1 && (
          <div className="flex items-center gap-4 text-xs">
            {lastSuccessfulSync && (
              <div>
                <span className="text-muted-foreground">Last successful:</span>{" "}
                <span className="font-medium">
                  {format(new Date(lastSuccessfulSync.completedAt || lastSuccessfulSync.startedAt), "MMM d, yyyy")}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Success rate:</span>{" "}
              <span className={cn(
                "font-medium",
                successRate >= 80 ? "text-green-600" : successRate >= 50 ? "text-yellow-600" : "text-destructive"
              )}>
                {successRate}%
              </span>
              <span className="text-muted-foreground ml-1">
                ({completedSyncs.length}/{syncActivities.length})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Audit Log - List-based, not cards */}
      <div className="space-y-0">
        {syncActivities.map((activity, index) => {
          const isActive = ["pending", "queued", "running"].includes(activity.status)
          const duration = activity.completedAt 
            ? new Date(activity.completedAt).getTime() - new Date(activity.startedAt).getTime()
            : null
          const minutes = duration ? Math.floor(duration / 60000) : null
          const seconds = duration ? Math.floor((duration % 60000) / 1000) : null
          
          return (
            <div
              key={activity.id}
              className={cn(
                "py-3 border-b last:border-b-0",
                isActive && "bg-primary/5",
                selectedJobId === activity.id && "bg-accent/30 border-l-2 border-l-primary"
              )}
            >
              <div className="grid grid-cols-12 gap-4 items-start">
                {/* Status Icon & Trigger */}
                <div className="col-span-3 flex items-center gap-2 min-w-0">
                  {getStatusIcon(activity.status)}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">
                      {getTriggerLabel(activity.triggerType)}
                    </div>
                    {isActive && (
                      <div className="text-xs text-primary font-medium mt-0.5">Live</div>
                    )}
                    {selectedJobId === activity.id && !isActive && (
                      <div className="text-xs text-primary font-medium mt-0.5">Viewing</div>
                    )}
                  </div>
                </div>

                {/* Status Badge */}
                <div className="col-span-2">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                      activity.status === "completed"
                        ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                        : activity.status === "failed"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {getStatusLabel(activity.status)}
                  </span>
                </div>

                {/* Timestamp */}
                <div className="col-span-3 text-xs">
                  <div className="font-medium">
                    {format(new Date(activity.startedAt), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                  {activity.completedAt && (
                    <div className="text-muted-foreground mt-0.5">
                      Completed: {format(new Date(activity.completedAt), "MMM d, h:mm a")}
                    </div>
                  )}
                </div>

                {/* Duration */}
                <div className="col-span-2 text-xs">
                  {duration ? (
                    <div>
                      {minutes !== null && minutes > 0 ? `${minutes}m ` : ""}{seconds !== null ? `${seconds}s` : ""}
                    </div>
                  ) : activity.status === "running" ? (
                    <div>In progress</div>
                  ) : activity.status === "pending" ? (
                    <div className="text-muted-foreground">Queued</div>
                  ) : null}
                </div>

                {/* Metrics */}
                <div className="col-span-2 text-xs">
                  {activity.status === "completed" && (
                    <div className="space-y-0.5">
                      {activity.pagesProcessed !== undefined && activity.pagesProcessed > 0 && (
                        <div>
                          <span className="font-medium">{activity.pagesProcessed}</span> pages extracted
                        </div>
                      )}
                      {activity.linksProcessed !== undefined && activity.linksProcessed > 0 && (
                        <div>
                          <span className="font-medium">{activity.linksProcessed}</span> links extracted
                        </div>
                      )}
                      {activity.pagesProcessed === 0 && activity.linksProcessed === 0 && (
                        <div className="text-destructive text-xs font-medium">
                          ⚠️ No knowledge extracted
                        </div>
                      )}
                      {activity.errorCount !== undefined && activity.errorCount > 0 && (
                        <div className="text-destructive">
                          <span className="font-medium">{activity.errorCount}</span> error{activity.errorCount !== 1 ? "s" : ""} encountered
                        </div>
                      )}
                      {activity.warnings && activity.warnings.length > 0 && (
                        <div className="text-yellow-600">
                          <span className="font-medium">{activity.warnings.length}</span> warning{activity.warnings.length !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  )}
                  {activity.status === "failed" && (
                    <div className="space-y-1">
                      {activity.errorMessages && activity.errorMessages.length > 0 ? (
                        <div className="text-destructive space-y-0.5">
                          <div className="font-medium">
                            {activity.errorMessages.length} error{activity.errorMessages.length !== 1 ? "s" : ""} caused failure
                          </div>
                          {activity.errorMessages.slice(0, 2).map((err, idx) => (
                            <div key={idx} className="text-xs opacity-85 truncate max-w-[200px]">
                              • {err}
                            </div>
                          ))}
                          {activity.errorMessages.length > 2 && (
                            <div className="text-xs opacity-60">
                              +{activity.errorMessages.length - 2} more
                            </div>
                          )}
                        </div>
                      ) : activity.errorCount !== undefined && activity.errorCount > 0 ? (
                        <div className="text-destructive">
                          <span className="font-medium">{activity.errorCount}</span> error{activity.errorCount !== 1 ? "s" : ""} caused failure
                        </div>
                      ) : (
                        <div className="text-destructive">
                          Extraction failed - no details available
                        </div>
                      )}
                      {activity.pagesProcessed !== undefined && activity.pagesProcessed > 0 && (
                        <div className="text-muted-foreground text-xs">
                          {activity.pagesProcessed} pages extracted before failure
                        </div>
                      )}
                    </div>
                  )}
                  {activity.status === "running" && (
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground">
                        Extraction in progress...
                      </div>
                      {activity.phase && (
                        <div className="text-xs text-muted-foreground capitalize">
                          {activity.phase.replace(/_/g, " ")}
                        </div>
                      )}
                      {activity.progress !== undefined && (
                        <div className="text-xs text-muted-foreground">
                          {Math.round(activity.progress)}% complete
                        </div>
                      )}
                    </div>
                  )}
                  {activity.status === "queued" && (
                    <div className="text-muted-foreground">
                      Waiting to start...
                    </div>
                  )}
                </div>

                {/* View Button */}
                {onJobSelect && activity.status === "completed" && (
                  <div className="col-span-1 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onJobSelect(activity.id)}
                      className={cn(
                        "h-7 text-xs",
                        selectedJobId === activity.id && "bg-primary/10"
                      )}
                      title="View knowledge extracted from this job"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary Footer */}
      {onJobSelect && syncActivities.length > 1 && (
        <div className="pt-3 border-t flex items-center justify-between text-xs">
          <div className="text-muted-foreground">
            {selectedJobId
              ? `Viewing knowledge from selected job.`
              : `Viewing latest knowledge (most recent job).`}
          </div>
          {selectedJobId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onJobSelect(null)}
              className="h-7 text-xs"
            >
              View Latest
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
