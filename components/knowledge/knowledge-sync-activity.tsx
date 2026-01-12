"use client"

import { CheckCircle2, Clock, XCircle } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface SyncActivity {
  id: string
  status: "pending" | "exploring" | "completed" | "failed" | "cancelled"
  triggerType: "initial" | "resync"
  startedAt: string
  completedAt?: string
  pagesProcessed?: number
  linksProcessed?: number
  errorCount?: number
}

interface KnowledgeSyncActivityProps {
  knowledgeId: string
  currentStatus: "pending" | "exploring" | "completed" | "failed" | "cancelled"
  startedAt?: string
  completedAt?: string
  pagesStored?: number
  linksStored?: number
  explorationErrors?: Array<{ url: string; error: string }>
  syncHistory?: Array<{
    jobId: string
    status: "pending" | "exploring" | "completed" | "failed" | "cancelled"
    triggerType: "initial" | "resync"
    startedAt: string | Date
    completedAt?: string | Date
    pagesProcessed?: number
    linksProcessed?: number
    errorCount?: number
  }>
  createdAt: string
  className?: string
}

export function KnowledgeSyncActivity({
  knowledgeId,
  currentStatus,
  startedAt,
  completedAt,
  pagesStored,
  linksStored,
  explorationErrors,
  syncHistory,
  createdAt,
  className,
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
        pagesProcessed: sync.pagesProcessed,
        linksProcessed: sync.linksProcessed,
        errorCount: sync.errorCount,
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
          errorCount: explorationErrors?.length || 0,
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
      case "exploring":
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
      case "exploring":
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
  const activeSyncs = syncActivities.filter((a) => ["pending", "exploring"].includes(a.status))
  const successRate = syncActivities.length > 0
    ? Math.round((completedSyncs.length / syncActivities.length) * 100)
    : 0
  
  const lastSuccessfulSync = completedSyncs.length > 0
    ? completedSyncs[0] // Already sorted by most recent first
    : null

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Sync Activity</h3>
        <span className="text-xs text-foreground opacity-85">
          {syncActivities.length} {syncActivities.length === 1 ? "sync" : "syncs"}
        </span>
      </div>

      {/* Summary Metrics */}
      {syncActivities.length > 1 && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="text-xs font-semibold mb-2">Summary</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {lastSuccessfulSync && (
              <div>
                <span className="text-foreground opacity-60">Last successful:</span>{" "}
                <span className="font-medium">
                  {format(new Date(lastSuccessfulSync.completedAt || lastSuccessfulSync.startedAt), "MMM d, yyyy")}
                </span>
              </div>
            )}
            <div>
              <span className="text-foreground opacity-60">Success rate:</span>{" "}
              <span className={cn(
                "font-medium",
                successRate >= 80 ? "text-green-600" : successRate >= 50 ? "text-yellow-600" : "text-destructive"
              )}>
                {successRate}%
              </span>
              <span className="text-foreground opacity-60 ml-1">
                ({completedSyncs.length}/{syncActivities.length})
              </span>
            </div>
            {activeSyncs.length > 0 && (
              <div className="col-span-2">
                <span className="text-foreground opacity-60">Currently active:</span>{" "}
                <span className="font-medium text-foreground">
                  {activeSyncs.length} sync{activeSyncs.length !== 1 ? "s" : ""} in progress
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {syncActivities.map((activity, index) => {
          const isActive = ["pending", "exploring"].includes(activity.status)
          return (
          <div
            key={activity.id}
            className={cn(
              "border rounded-lg p-3 space-y-2",
              isActive && "border-primary/50 bg-primary/5"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {getStatusIcon(activity.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold">
                      {getTriggerLabel(activity.triggerType)}
                    </span>
                    {isActive && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        Live
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        activity.status === "completed"
                          ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : activity.status === "failed"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-foreground opacity-85"
                      )}
                    >
                      {getStatusLabel(activity.status)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-foreground opacity-85">
              <div className="flex items-center gap-4 flex-wrap">
                <span>
                  Started: {format(new Date(activity.startedAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
                {activity.completedAt ? (
                  <>
                    <span>
                      Completed: {format(new Date(activity.completedAt), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                    {(() => {
                      const duration = new Date(activity.completedAt).getTime() - new Date(activity.startedAt).getTime()
                      const minutes = Math.floor(duration / 60000)
                      const seconds = Math.floor((duration % 60000) / 1000)
                      return (
                        <span>
                          Duration: {minutes > 0 ? `${minutes}m ` : ""}{seconds}s
                        </span>
                      )
                    })()}
                  </>
                ) : activity.status === "exploring" ? (
                  <span className="text-foreground">In progress...</span>
                ) : activity.status === "pending" ? (
                  <span className="text-foreground">Queued...</span>
                ) : null}
              </div>

              {activity.status === "completed" && (
                <div className="flex items-center gap-4 pt-1">
                  {activity.pagesProcessed !== undefined && (
                    <span>
                      <span className="font-medium">{activity.pagesProcessed}</span> pages processed
                    </span>
                  )}
                  {activity.linksProcessed !== undefined && (
                    <span>
                      <span className="font-medium">{activity.linksProcessed}</span> links processed
                    </span>
                  )}
                  {activity.errorCount !== undefined && activity.errorCount > 0 && (
                    <span className="text-destructive">
                      <span className="font-medium">{activity.errorCount}</span> errors
                    </span>
                  )}
                </div>
              )}

              {activity.status === "failed" && activity.errorCount !== undefined && activity.errorCount > 0 && (
                <div className="pt-1 text-destructive">
                  <span className="font-medium">{activity.errorCount}</span> error{activity.errorCount !== 1 ? "s" : ""} encountered
                </div>
              )}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
