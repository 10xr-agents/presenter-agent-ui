"use client"

import { AlertCircle, CheckCircle2, Globe, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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

      const response = await fetch(`/api/website-knowledge?${params.toString()}`)
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
      const response = await fetch(`/api/website-knowledge/${knowledgeToDelete}`, {
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

  const handleResync = async (knowledgeId: string, websiteUrl: string) => {
    setResyncingIds((prev) => new Set(prev).add(knowledgeId))
    try {
      const response = await fetch("/api/website-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl,
          organizationId,
          maxPages: 50,
          maxDepth: 3,
          strategy: "BFS",
          // Re-sync uses same configuration as original
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to re-sync knowledge")
      }

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

  const getStatusBadge = (status: WebsiteKnowledge["status"]) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="outline" className="border-green-600 text-green-600">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        )
      case "exploring":
      case "pending":
        return (
          <Badge variant="outline" className="border-primary text-primary">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            {status === "exploring" ? "Exploring" : "Queued"}
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="outline" className="border-destructive text-destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      case "cancelled":
        return (
          <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
            Cancelled
          </Badge>
        )
      default:
        return null
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
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search knowledge..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="exploring">Exploring</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Knowledge List */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-muted/30">
              <CardContent className="pt-6">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full mb-4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredKnowledge.length === 0 ? (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Globe className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-1">No knowledge found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {knowledgeList.length === 0
                  ? "Create your first knowledge source to get started"
                  : "No knowledge matches your filters"}
              </p>
              {knowledgeList.length === 0 && (
                <Button asChild size="sm">
                  <Link href="/knowledge/new">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Create Knowledge
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredKnowledge.map((knowledge) => (
            <Card
              key={knowledge.id}
              className={cn(
                "bg-muted/30 transition-colors hover:bg-muted/50",
                knowledge.status === "completed" && "ring-1 ring-green-600/20"
              )}
            >
              <CardContent className="pt-6">
                <div className="space-y-3">
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
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {knowledge.websiteUrl}
                      </p>
                    </div>
                    {getStatusBadge(knowledge.status)}
                  </div>

                  {/* Progress for in-progress items */}
                  {["pending", "exploring"].includes(knowledge.status) && knowledge.explorationJobId && (
                    <WebsiteKnowledgeProgress
                      knowledgeId={knowledge.id}
                      onComplete={() => fetchKnowledge()}
                      className="text-xs"
                    />
                  )}

                  {/* Stats for completed items */}
                  {knowledge.status === "completed" && knowledge.pagesStored && (
                    <div className="text-xs text-muted-foreground">
                      {knowledge.pagesStored} pages • {knowledge.linksStored || 0} links
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="text-xs text-muted-foreground">
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
                      onClick={() => handleResync(knowledge.id, knowledge.websiteUrl)}
                      disabled={resyncingIds.has(knowledge.id) || ["pending", "exploring"].includes(knowledge.status)}
                      className="h-7 text-xs flex-1"
                    >
                      {resyncingIds.has(knowledge.id) ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
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
              </CardContent>
            </Card>
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
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
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
