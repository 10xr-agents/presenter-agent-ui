"use client"

import { format } from "date-fns"
import { ExternalLink, FileText, Globe, MoreHorizontal, RefreshCw, Square, X, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { KnowledgeStatusBadge } from "@/components/knowledge/knowledge-status-badge"
import { Pagination } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { KnowledgeProgress } from "@/components/knowledge/knowledge-progress"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface KnowledgeSource {
  id: string
  sourceType: "documentation" | "website" | "video" | "file"
  sourceUrl?: string
  sourceName: string
  fileName?: string
  status: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"
  jobId: string | null
  workflowId: string | null
  pagesStored?: number
  linksStored?: number
  screensExtracted?: number
  tasksExtracted?: number
  extractionErrors?: Array<{
    message: string
    phase?: string
    timestamp?: string
  }>
  name?: string
  description?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  syncHistory?: Array<{
    jobId: string
    workflowId?: string
    status: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"
    triggerType: "initial" | "resync"
    startedAt: string | Date
    completedAt?: string | Date
    phase?: string
    progress?: number
    errorMessages?: string[] // Renamed from 'errors' to avoid Mongoose reserved pathname
    warnings?: string[]
  }>
}

interface KnowledgeListTableProps {
  organizationId: string
  initialData?: KnowledgeSource[]
  initialPagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export function KnowledgeListTable({
  organizationId,
  initialData = [],
  initialPagination,
}: KnowledgeListTableProps) {
  const router = useRouter()
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeSource[]>(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(initialPagination?.page || 1)
  const [pagination, setPagination] = useState(initialPagination)
  const [resyncingIds, setResyncingIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set())
  const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set())

  const fetchKnowledge = async (newPage: number = page, newStatus: string = statusFilter) => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("organizationId", organizationId)
      params.set("page", String(newPage))
      params.set("limit", "25")
      if (newStatus !== "all") {
        params.set("status", newStatus)
      }

      const response = await fetch(`/api/knowledge?${params.toString()}`)
      if (!response.ok) {
        throw new Error("Failed to fetch knowledge")
      }

      const result = (await response.json()) as {
        data?: KnowledgeSource[]
        pagination?: {
          page: number
          limit: number
          total: number
          totalPages: number
          hasNext: boolean
          hasPrev: boolean
        }
      }
      if (result.data) {
        setKnowledgeList(result.data)
      }
      if (result.pagination) {
        setPagination(result.pagination)
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load knowledge"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchKnowledge(newPage, statusFilter)
  }

  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus)
    setPage(1)
    fetchKnowledge(1, newStatus)
  }

  const handleResync = async (knowledgeId: string) => {
    setResyncingIds((prev) => new Set(prev).add(knowledgeId))
    try {
      const response = await fetch(`/api/knowledge/${knowledgeId}/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to re-sync knowledge")
      }

      await fetchKnowledge(page, statusFilter)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to re-sync knowledge"
      setError(errorMessage)
    } finally {
      setResyncingIds((prev) => {
        const next = new Set(prev)
        next.delete(knowledgeId)
        return next
      })
    }
  }

  const handleDelete = async (knowledgeId: string) => {
    setDeletingId(knowledgeId)
    try {
      const response = await fetch(`/api/knowledge/${knowledgeId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete knowledge")
      }

      await fetchKnowledge(page, statusFilter)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete knowledge"
      setError(errorMessage)
    } finally {
      setDeletingId(null)
    }
  }

  const handleStop = async (knowledgeId: string, jobId: string) => {
    setStoppingIds((prev) => new Set(prev).add(knowledgeId))
    setError(null)
    try {
      const response = await fetch(`/api/knowledge/${knowledgeId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = (await response.json()) as { data?: KnowledgeSource; error?: string }

      if (!response.ok) {
        throw new Error(data.error || "Failed to stop job")
      }

      // If backend marked as failed, show error but still refresh
      if (data.error) {
        setError(data.error)
      }

      await fetchKnowledge(page, statusFilter)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to stop job"
      setError(errorMessage)
    } finally {
      setStoppingIds((prev) => {
        const next = new Set(prev)
        next.delete(knowledgeId)
        return next
      })
    }
  }

  const handleCancel = async (knowledgeId: string, jobId: string) => {
    setCancelingIds((prev) => new Set(prev).add(knowledgeId))
    setError(null)
    try {
      const response = await fetch(`/api/knowledge/${knowledgeId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      const data = (await response.json()) as { data?: KnowledgeSource; error?: string }

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel job")
      }

      // If backend marked as failed, show error but still refresh
      if (data.error) {
        setError(data.error)
      }

      await fetchKnowledge(page, statusFilter)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to cancel job"
      setError(errorMessage)
    } finally {
      setCancelingIds((prev) => {
        const next = new Set(prev)
        next.delete(knowledgeId)
        return next
      })
    }
  }

  const getLastSyncTime = (knowledge: KnowledgeSource): string => {
    if (knowledge.completedAt) {
      return format(new Date(knowledge.completedAt), "MMM d, yyyy")
    }
    if (knowledge.startedAt) {
      return format(new Date(knowledge.startedAt), "MMM d, yyyy")
    }
    return format(new Date(knowledge.createdAt), "MMM d, yyyy")
  }

  return (
    <div className="space-y-4">
      {/* Status Filter */}
      <div className="flex items-center gap-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusFilterChange("all")}
          className="h-7 text-xs"
        >
          All
        </Button>
        <Button
          variant={statusFilter === "completed" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusFilterChange("completed")}
          className="h-7 text-xs"
        >
          Completed
        </Button>
        <Button
          variant={statusFilter === "running" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusFilterChange("running")}
          className="h-7 text-xs"
        >
          Syncing
        </Button>
        <Button
          variant={statusFilter === "failed" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusFilterChange("failed")}
          className="h-7 text-xs"
        >
          Failed
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-9 text-xs font-semibold">Name</TableHead>
              <TableHead className="h-9 text-xs font-semibold">Source</TableHead>
              <TableHead className="h-9 text-xs font-semibold">Status</TableHead>
              <TableHead className="h-9 text-xs font-semibold">Last Sync</TableHead>
              <TableHead className="h-9 text-xs font-semibold">Pages</TableHead>
              <TableHead className="h-9 text-xs font-semibold w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-8" />
                    </TableCell>
                  </TableRow>
                ))}
              </>
            ) : knowledgeList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24">
                  <Empty className="border-0 p-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Globe className="h-5 w-5" />
                      </EmptyMedia>
                      <EmptyTitle className="text-sm font-semibold">No knowledge found</EmptyTitle>
                      <EmptyDescription className="text-xs">
                        Create your first knowledge source to get started
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              knowledgeList.map((knowledge) => {
                const isResyncing = resyncingIds.has(knowledge.id)
                const isDeleting = deletingId === knowledge.id
                const isActive = ["pending", "queued", "running"].includes(knowledge.status)

                return (
                  <TableRow
                    key={knowledge.id}
                    className={cn(
                      "cursor-pointer hover:bg-muted/30",
                      isActive && "bg-primary/5"
                    )}
                    onClick={() => router.push(`/knowledge/${knowledge.id}`)}
                  >
                    <TableCell className="py-2">
                      <div className="space-y-0.5">
                        <div className="text-sm font-semibold">
                          {knowledge.name || knowledge.sourceName}
                        </div>
                        {knowledge.description && (
                          <div className="text-xs text-foreground opacity-85 line-clamp-1">
                            {knowledge.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1.5">
                        {knowledge.sourceType === "website" || knowledge.sourceType === "documentation" || knowledge.sourceType === "video" ? (
                          <Globe className="h-3 w-3 text-foreground opacity-60 shrink-0" />
                        ) : (
                          <FileText className="h-3 w-3 text-foreground opacity-60 shrink-0" />
                        )}
                        {knowledge.sourceUrl ? (
                          <a
                            href={knowledge.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-foreground opacity-85 hover:text-primary transition-colors truncate flex items-center gap-1"
                          >
                            <span className="truncate max-w-[200px]">{knowledge.sourceUrl}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-xs text-foreground opacity-85 truncate max-w-[200px]">
                            {knowledge.fileName || knowledge.sourceName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="space-y-1.5">
                        <KnowledgeStatusBadge status={knowledge.status} />
                        {isActive && knowledge.jobId && (
                          <KnowledgeProgress
                            knowledgeId={knowledge.id}
                            jobId={knowledge.jobId}
                            workflowId={knowledge.workflowId}
                            onComplete={() => fetchKnowledge(page, statusFilter)}
                            className="text-xs"
                          />
                        )}
                        {knowledge.status === "failed" && knowledge.extractionErrors && knowledge.extractionErrors.length > 0 && (
                          <div className="text-xs text-destructive font-medium">
                            {knowledge.extractionErrors.length} error{knowledge.extractionErrors.length !== 1 ? "s" : ""}
                          </div>
                        )}
                        {knowledge.status === "completed" && knowledge.pagesStored === 0 && knowledge.linksStored === 0 && (
                          <div className="text-xs text-destructive font-medium">
                            ⚠️ No knowledge extracted
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-foreground opacity-85">
                      {getLastSyncTime(knowledge)}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-foreground opacity-85">
                      {knowledge.status === "completed" && knowledge.pagesStored
                        ? `${knowledge.pagesStored} pages`
                        : "—"}
                    </TableCell>
                    <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/knowledge/${knowledge.id}`)
                            }}
                            className="text-xs"
                          >
                            View Details
                          </DropdownMenuItem>
                          {/* Stop and Cancel - Only for queued/running jobs */}
                          {["pending", "queued", "running"].includes(knowledge.status) && knowledge.jobId && (
                            <>
                              <DropdownMenuSeparator />
                              {/* Stop (Pause) - Only for running jobs */}
                              {knowledge.status === "running" && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleStop(knowledge.id, knowledge.jobId!)
                                  }}
                                  disabled={stoppingIds.has(knowledge.id) || cancelingIds.has(knowledge.id)}
                                  className="text-xs"
                                >
                                  {stoppingIds.has(knowledge.id) ? (
                                    <>
                                      <Spinner className="mr-2 h-3 w-3" />
                                      Stopping...
                                    </>
                                  ) : (
                                    <>
                                      <Square className="mr-2 h-3 w-3" />
                                      Stop
                                    </>
                                  )}
                                </DropdownMenuItem>
                              )}
                              {/* Cancel - For queued or running jobs */}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCancel(knowledge.id, knowledge.jobId!)
                                }}
                                disabled={stoppingIds.has(knowledge.id) || cancelingIds.has(knowledge.id)}
                                className="text-xs"
                              >
                                {cancelingIds.has(knowledge.id) ? (
                                  <>
                                    <Spinner className="mr-2 h-3 w-3" />
                                    Canceling...
                                  </>
                                ) : (
                                  <>
                                    <X className="mr-2 h-3 w-3" />
                                    Cancel
                                  </>
                                )}
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              handleResync(knowledge.id)
                            }}
                            disabled={isResyncing || ["pending", "queued", "running"].includes(knowledge.status) || stoppingIds.has(knowledge.id) || cancelingIds.has(knowledge.id)}
                            className="text-xs"
                          >
                            {isResyncing ? (
                              <>
                                <Spinner className="mr-2 h-3 w-3" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="mr-2 h-3 w-3" />
                                Re-sync
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm("Are you sure you want to delete this knowledge? This action cannot be undone.")) {
                                handleDelete(knowledge.id)
                              }
                            }}
                            disabled={isDeleting || stoppingIds.has(knowledge.id) || cancelingIds.has(knowledge.id)}
                            className="text-xs text-destructive focus:text-destructive"
                          >
                            {isDeleting ? (
                              <>
                                <Spinner className="mr-2 h-3 w-3" />
                                Deleting...
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-2 h-3 w-3" />
                                Delete
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={pagination.limit}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  )
}
