"use client"

import { CheckCircle2, Clock, XCircle, Eye } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
      <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
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
                successRate >= 80 ? "text-green-500" : successRate >= 50 ? "text-yellow-500" : "text-destructive"
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

      {/* Audit Log - Clean Table */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-background border-b border-zinc-200 dark:border-zinc-800">
              <TableHead className="h-9 text-xs font-semibold">Status</TableHead>
              <TableHead className="h-9 text-xs font-semibold">Type</TableHead>
              <TableHead className="h-9 text-xs font-semibold">Date</TableHead>
              <TableHead className="h-9 text-xs font-semibold">Duration</TableHead>
              <TableHead className="h-9 text-xs font-semibold">Details</TableHead>
              <TableHead className="h-9 text-xs font-semibold text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {syncActivities.map((activity) => {
              const isActive = ["pending", "queued", "running"].includes(activity.status)
              const duration = activity.completedAt 
                ? new Date(activity.completedAt).getTime() - new Date(activity.startedAt).getTime()
                : null
              const minutes = duration ? Math.floor(duration / 60000) : null
              const seconds = duration ? Math.floor((duration % 60000) / 1000) : null
              
              return (
                <TableRow
                  key={activity.id}
                  className={cn(
                    "border-b border-zinc-200 dark:border-zinc-800",
                    isActive && "bg-primary/5",
                    selectedJobId === activity.id && "bg-accent/30"
                  )}
                >
                  {/* Status */}
                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(activity.status)}
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                          activity.status === "completed"
                            ? "bg-green-500/10 text-green-500"
                            : activity.status === "failed"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {getStatusLabel(activity.status)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Type */}
                  <TableCell className="py-3">
                    <div className="text-xs font-medium text-foreground">
                      {getTriggerLabel(activity.triggerType)}
                    </div>
                    {isActive && (
                      <div className="text-xs text-primary font-medium mt-0.5">Live</div>
                    )}
                    {selectedJobId === activity.id && !isActive && (
                      <div className="text-xs text-primary font-medium mt-0.5">Viewing</div>
                    )}
                  </TableCell>

                  {/* Date */}
                  <TableCell className="py-3">
                    <div className="text-xs font-medium">
                      {format(new Date(activity.startedAt), "MMM d, yyyy 'at' h:mm a")}
                    </div>
                    {activity.completedAt && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Completed: {format(new Date(activity.completedAt), "MMM d, h:mm a")}
                      </div>
                    )}
                  </TableCell>

                  {/* Duration */}
                  <TableCell className="py-3">
                    <div className="text-xs">
                      {duration ? (
                        <>
                          {minutes !== null && minutes > 0 ? `${minutes}m ` : ""}{seconds !== null ? `${seconds}s` : ""}
                        </>
                      ) : activity.status === "running" ? (
                        "In progress"
                      ) : activity.status === "pending" || activity.status === "queued" ? (
                        <span className="text-muted-foreground">Queued</span>
                      ) : null}
                    </div>
                  </TableCell>

                  {/* Details */}
                  <TableCell className="py-3">
                    <div className="text-xs space-y-0.5">
                      {activity.status === "completed" && (
                        <>
                          {activity.pagesProcessed !== undefined && activity.pagesProcessed > 0 && (
                            <div>
                              <span className="font-medium">{activity.pagesProcessed}</span> pages
                            </div>
                          )}
                          {activity.linksProcessed !== undefined && activity.linksProcessed > 0 && (
                            <div>
                              <span className="font-medium">{activity.linksProcessed}</span> links
                            </div>
                          )}
                          {activity.pagesProcessed === 0 && activity.linksProcessed === 0 && (
                            <div className="text-destructive font-medium">
                              ⚠️ No knowledge extracted
                            </div>
                          )}
                          {activity.errorCount !== undefined && activity.errorCount > 0 && (
                            <div className="text-destructive">
                              <span className="font-medium">{activity.errorCount}</span> error{activity.errorCount !== 1 ? "s" : ""}
                            </div>
                          )}
                        </>
                      )}
                      {activity.status === "failed" && (
                        <div className="text-destructive">
                          {activity.errorMessages && activity.errorMessages.length > 0 ? (
                            <div className="font-medium">
                              {activity.errorMessages.length} error{activity.errorMessages.length !== 1 ? "s" : ""}
                            </div>
                          ) : (
                            <div>Failed - no details</div>
                          )}
                        </div>
                      )}
                      {activity.status === "running" && activity.phase && (
                        <div className="text-muted-foreground capitalize">
                          {activity.phase.replace(/_/g, " ")}
                        </div>
                      )}
                    </div>
                  </TableCell>

                  {/* Action */}
                  <TableCell className="py-3 text-right">
                    {onJobSelect && activity.status === "completed" && (
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
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Summary Footer */}
      {onJobSelect && syncActivities.length > 1 && (
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
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
