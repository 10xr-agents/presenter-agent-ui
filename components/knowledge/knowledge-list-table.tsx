"use client"

import { format } from "date-fns"
import { ExternalLink, Globe, Loader2, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react"
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
import { WebsiteKnowledgeProgress } from "@/components/website-knowledge/website-knowledge-progress"
import { cn } from "@/lib/utils"

interface WebsiteKnowledge {
  id: string
  websiteUrl: string
  websiteDomain: string
  status: "pending" | "exploring" | "completed" | "failed" | "cancelled"
  explorationJobId: string | null
  pagesStored?: number
  linksStored?: number
  name?: string
  description?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  syncHistory?: Array<{
    jobId: string
    status: "pending" | "exploring" | "completed" | "failed" | "cancelled"
    triggerType: "initial" | "resync"
    startedAt: string | Date
    completedAt?: string | Date
  }>
}

interface KnowledgeListTableProps {
  organizationId: string
  initialData?: WebsiteKnowledge[]
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
  const [knowledgeList, setKnowledgeList] = useState<WebsiteKnowledge[]>(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(initialPagination?.page || 1)
  const [pagination, setPagination] = useState(initialPagination)
  const [resyncingIds, setResyncingIds] = useState<Set<string>>(new Set())
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

      const response = await fetch(`/api/website-knowledge?${params.toString()}`)
      if (!response.ok) {
        throw new Error("Failed to fetch knowledge")
      }

      const result = (await response.json()) as {
        data?: WebsiteKnowledge[]
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
      const response = await fetch(`/api/website-knowledge/${knowledgeId}/resync`, {
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
      const response = await fetch(`/api/website-knowledge/${knowledgeId}`, {
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

  const getLastSyncTime = (knowledge: WebsiteKnowledge): string => {
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
          variant={statusFilter === "exploring" ? "default" : "outline"}
          size="sm"
          onClick={() => handleStatusFilterChange("exploring")}
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
                <TableCell colSpan={6} className="h-24 text-center">
                  <div className="flex flex-col items-center justify-center py-8">
                    <Globe className="h-6 w-6 text-foreground opacity-60 mb-2" />
                    <p className="text-xs font-semibold mb-1">No knowledge found</p>
                    <p className="text-xs text-foreground opacity-85">
                      Create your first knowledge source to get started
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              knowledgeList.map((knowledge) => {
                const isResyncing = resyncingIds.has(knowledge.id)
                const isDeleting = deletingId === knowledge.id
                const isActive = ["pending", "exploring"].includes(knowledge.status)

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
                          {knowledge.name || knowledge.websiteDomain}
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
                        <Globe className="h-3 w-3 text-foreground opacity-60 shrink-0" />
                        <a
                          href={knowledge.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-foreground opacity-85 hover:text-primary transition-colors truncate flex items-center gap-1"
                        >
                          <span className="truncate max-w-[200px]">{knowledge.websiteUrl}</span>
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <KnowledgeStatusBadge status={knowledge.status} />
                      {isActive && knowledge.explorationJobId && (
                        <div className="mt-1">
                          <WebsiteKnowledgeProgress
                            knowledgeId={knowledge.id}
                            onComplete={() => fetchKnowledge(page, statusFilter)}
                            className="text-xs"
                          />
                        </div>
                      )}
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
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              handleResync(knowledge.id)
                            }}
                            disabled={isResyncing || ["pending", "exploring"].includes(knowledge.status)}
                            className="text-xs"
                          >
                            {isResyncing ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
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
                            disabled={isDeleting}
                            className="text-xs text-destructive focus:text-destructive"
                          >
                            {isDeleting ? (
                              <>
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
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
