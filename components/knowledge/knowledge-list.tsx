"use client"

import { Globe, Plus, RefreshCw, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { KnowledgeSearchFilters } from "@/components/knowledge/knowledge-search-filters"
import { KnowledgeStatusBadge } from "@/components/knowledge/knowledge-status-badge"
import { WebsiteKnowledgeProgress } from "@/components/website-knowledge/website-knowledge-progress"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface WebsiteKnowledge {
  id: string
  websiteUrl: string
  websiteDomain: string
  status: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"
  explorationJobId: string | null
  pagesStored?: number
  linksStored?: number
  externalLinksDetected?: number
  name?: string
  description?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

interface KnowledgeListProps {
  organizationId: string
}

export function KnowledgeList({ organizationId }: KnowledgeListProps) {
  const router = useRouter()
  const [knowledgeList, setKnowledgeList] = useState<WebsiteKnowledge[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [knowledgeToDelete, setKnowledgeToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [resyncingIds, setResyncingIds] = useState<Set<string>>(new Set())

  const fetchKnowledge = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("organizationId", organizationId)
      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }

      const response = await fetch(`/api/knowledge?${params.toString()}`)
      if (!response.ok) {
        throw new Error("Failed to fetch knowledge")
      }

      const result = (await response.json()) as { data?: WebsiteKnowledge[] }
      setKnowledgeList(result.data || [])
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load knowledge"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (organizationId) {
      fetchKnowledge()
      // Refresh periodically to catch status updates
      const interval = setInterval(fetchKnowledge, 5000)
      return () => clearInterval(interval)
    }
  }, [organizationId, statusFilter])

  const handleDelete = async (knowledgeId: string) => {
    setKnowledgeToDelete(knowledgeId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!knowledgeToDelete) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/knowledge/${knowledgeToDelete}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete knowledge")
      }

      await fetchKnowledge()
      setDeleteDialogOpen(false)
      setKnowledgeToDelete(null)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete knowledge"
      setError(errorMessage)
    } finally {
      setIsDeleting(false)
    }
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

      // Refresh the knowledge list to show updated status
      await fetchKnowledge()
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


  const filteredKnowledge = knowledgeList.filter((item) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        item.name?.toLowerCase().includes(query) ||
        item.websiteUrl.toLowerCase().includes(query) ||
        item.websiteDomain.toLowerCase().includes(query)
      )
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <KnowledgeSearchFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Knowledge List */}
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredKnowledge.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Globe className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold">No knowledge found</EmptyTitle>
            <EmptyDescription className="text-xs">
              {knowledgeList.length === 0
                ? "Create your first knowledge source to get started"
                : "No knowledge matches your filters"}
            </EmptyDescription>
            {knowledgeList.length === 0 && (
              <Button asChild size="sm" className="mt-2">
                <Link href="/knowledge/new">
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Create Knowledge
                </Link>
              </Button>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredKnowledge.map((knowledge) => (
            <div
              key={knowledge.id}
              className={cn(
                "border rounded-lg p-4 space-y-3 transition-colors hover:bg-muted/30",
                knowledge.status === "completed" && "ring-1 ring-green-600/20"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/knowledge/${knowledge.id}`}
                    className="block group"
                  >
                    <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                      {knowledge.name || knowledge.websiteDomain}
                    </h3>
                  </Link>
                  <p className="text-xs text-foreground opacity-85 truncate mt-0.5">
                    {knowledge.websiteUrl}
                  </p>
                </div>
                <KnowledgeStatusBadge status={knowledge.status} />
              </div>

                  {/* Progress for in-progress items */}
                  {["pending", "queued", "running"].includes(knowledge.status) && knowledge.explorationJobId && (
                    <WebsiteKnowledgeProgress
                      knowledgeId={knowledge.id}
                      onComplete={() => fetchKnowledge()}
                      className="text-xs"
                    />
                  )}

                  {/* Stats for completed items */}
                  {knowledge.status === "completed" && knowledge.pagesStored && (
                    <div className="text-xs text-foreground opacity-85">
                      {knowledge.pagesStored} pages • {knowledge.linksStored || 0} links
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="text-xs text-foreground opacity-85">
                    {knowledge.completedAt
                      ? `Completed ${new Date(knowledge.completedAt).toLocaleDateString()}`
                      : knowledge.startedAt
                        ? `Started ${new Date(knowledge.startedAt).toLocaleDateString()}`
                        : `Created ${new Date(knowledge.createdAt).toLocaleDateString()}`}
                  </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleResync(knowledge.id)}
                  disabled={resyncingIds.has(knowledge.id) || ["pending", "queued", "running"].includes(knowledge.status)}
                  className="h-7 text-xs flex-1"
                >
                  {resyncingIds.has(knowledge.id) ? (
                    <>
                      <Spinner className="mr-1 h-3 w-3" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Re-sync
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(knowledge.id)}
                  className="h-7 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this knowledge? This action cannot be undone and will cancel any ongoing exploration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Spinner className="mr-2 h-3.5 w-3.5" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
