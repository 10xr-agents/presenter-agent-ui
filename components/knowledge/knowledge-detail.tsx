"use client"

import { AlertCircle, CheckCircle2, ExternalLink, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WebsiteKnowledgeProgress } from "@/components/website-knowledge/website-knowledge-progress"
import { cn } from "@/lib/utils"

interface WebsiteKnowledge {
  id: string
  websiteUrl: string
  websiteDomain: string
  status: "pending" | "exploring" | "completed" | "failed" | "cancelled"
  explorationJobId: string | null
  maxPages?: number
  maxDepth?: number
  strategy?: "BFS" | "DFS"
  includePaths?: string[]
  excludePaths?: string[]
  pagesStored?: number
  linksStored?: number
  externalLinksDetected?: number
  explorationErrors?: Array<{
    url: string
    error: string
    error_type?: "network" | "timeout" | "http_4xx" | "http_5xx" | "parsing" | "other"
    retry_count?: number
  }>
  name?: string
  description?: string
  tags?: string[]
  timesReferenced: number
  lastReferencedAt?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

interface KnowledgeDetailProps {
  knowledge: WebsiteKnowledge
  organizationId: string
}

interface ExplorationResults {
  pages?: Array<{
    url: string
    title: string
    content: string
    metadata?: Record<string, unknown>
  }>
  links?: Array<{
    from: string
    to: string
    type: "internal" | "external"
    text?: string | null
  }>
  results: {
    pages_stored: number
    links_stored: number
    external_links_detected: number
    errors: Array<{
      url: string
      error: string
      error_type?: "network" | "timeout" | "http_4xx" | "http_5xx" | "parsing" | "other"
      retry_count?: number
      last_attempted_at?: string
    }>
  }
  website_metadata?: {
    title?: string
    description?: string
  }
}

export function KnowledgeDetail({ knowledge, organizationId }: KnowledgeDetailProps) {
  const router = useRouter()
  const [results, setResults] = useState<ExplorationResults | null>(null)
  const [isLoadingResults, setIsLoadingResults] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResyncing, setIsResyncing] = useState(false)

  const fetchResults = async () => {
    if (!knowledge.explorationJobId || knowledge.status !== "completed") {
      return
    }

    setIsLoadingResults(true)
    setError(null)
    try {
      const response = await fetch(`/api/website-knowledge/${knowledge.id}/results`)
      if (!response.ok) {
        throw new Error("Failed to fetch results")
      }

      const data = (await response.json()) as { data?: ExplorationResults }
      if (data.data) {
        setResults(data.data)
        // Update knowledge with website metadata if available
        if (data.data.website_metadata) {
          // Metadata is already in results, no need to update knowledge object
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load results"
      setError(errorMessage)
    } finally {
      setIsLoadingResults(false)
    }
  }

  useEffect(() => {
    if (knowledge.status === "completed") {
      fetchResults()
    }
  }, [knowledge.id, knowledge.status])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/website-knowledge/${knowledge.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete knowledge")
      }

      router.push("/knowledge")
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete knowledge"
      setError(errorMessage)
      setIsDeleting(false)
    }
  }

  const handleResync = async () => {
    setIsResyncing(true)
    try {
      const response = await fetch("/api/website-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: knowledge.websiteUrl,
          organizationId,
          maxPages: knowledge.maxPages || 50,
          maxDepth: knowledge.maxDepth || 3,
          strategy: knowledge.strategy || "BFS",
          includePaths: knowledge.includePaths && knowledge.includePaths.length > 0 ? knowledge.includePaths : undefined,
          excludePaths: knowledge.excludePaths && knowledge.excludePaths.length > 0 ? knowledge.excludePaths : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to re-sync knowledge")
      }

      const result = (await response.json()) as { data?: { id: string } }
      if (result.data?.id) {
        router.push(`/knowledge/${result.data.id}`)
        router.refresh()
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to re-sync knowledge"
      setError(errorMessage)
    } finally {
      setIsResyncing(false)
    }
  }

  const getStatusBadge = () => {
    switch (knowledge.status) {
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
            {knowledge.status === "exploring" ? "Exploring" : "Queued"}
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="outline" className="border-destructive text-destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={knowledge.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1"
                  >
                    {knowledge.websiteUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {results?.website_metadata?.title && (
                  <p className="text-xs font-medium">{results.website_metadata.title}</p>
                )}
                {results?.website_metadata?.description && (
                  <p className="text-xs text-muted-foreground">{results.website_metadata.description}</p>
                )}
                {knowledge.description && !results?.website_metadata?.description && (
                  <p className="text-xs text-muted-foreground">{knowledge.description}</p>
                )}
              </div>
              {getStatusBadge()}
            </div>

            {/* Progress for in-progress items */}
            {["pending", "exploring"].includes(knowledge.status) && knowledge.explorationJobId && (
              <WebsiteKnowledgeProgress
                knowledgeId={knowledge.id}
                onComplete={() => {
                  router.refresh()
                }}
              />
            )}

            {/* Stats for completed items */}
            {knowledge.status === "completed" && (
              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                <div>
                  <div className="text-2xl font-semibold">{knowledge.pagesStored || 0}</div>
                  <div className="text-xs text-muted-foreground">Pages</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">{knowledge.linksStored || 0}</div>
                  <div className="text-xs text-muted-foreground">Links</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">{knowledge.externalLinksDetected || 0}</div>
                  <div className="text-xs text-muted-foreground">External Links</div>
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Strategy: <span className="font-medium">{knowledge.strategy || "BFS"}</span>
                </span>
                {knowledge.maxPages && (
                  <span>
                    Max Pages: <span className="font-medium">{knowledge.maxPages}</span>
                  </span>
                )}
                {knowledge.maxDepth && (
                  <span>
                    Max Depth: <span className="font-medium">{knowledge.maxDepth}</span>
                  </span>
                )}
              </div>
              {(knowledge.includePaths && knowledge.includePaths.length > 0) ||
              (knowledge.excludePaths && knowledge.excludePaths.length > 0) ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {knowledge.includePaths && knowledge.includePaths.length > 0 && (
                    <div>
                      <span className="font-medium">Include:</span> {knowledge.includePaths.join(", ")}
                    </div>
                  )}
                  {knowledge.excludePaths && knowledge.excludePaths.length > 0 && (
                    <div>
                      <span className="font-medium">Exclude:</span> {knowledge.excludePaths.join(", ")}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Timestamps */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
              {knowledge.completedAt && (
                <span>
                  Completed: {new Date(knowledge.completedAt).toLocaleString()}
                </span>
              )}
              {knowledge.startedAt && (
                <span>
                  Started: {new Date(knowledge.startedAt).toLocaleString()}
                </span>
              )}
              <span>
                Created: {new Date(knowledge.createdAt).toLocaleString()}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResync}
                disabled={isResyncing || ["pending", "exploring"].includes(knowledge.status)}
                className="h-8 text-xs"
              >
                {isResyncing ? (
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
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                className="h-8 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exploration Results */}
      {knowledge.status === "completed" && (
        <Tabs defaultValue="pages" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pages">Pages ({knowledge.pagesStored || 0})</TabsTrigger>
            <TabsTrigger value="links">Links ({knowledge.linksStored || 0})</TabsTrigger>
            {knowledge.explorationErrors && knowledge.explorationErrors.length > 0 && (
              <TabsTrigger value="errors">
                Errors ({knowledge.explorationErrors.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="pages" className="space-y-4">
            {isLoadingResults ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-muted/30">
                    <CardContent className="pt-6">
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : results?.pages && results.pages.length > 0 ? (
              <div className="space-y-2">
                {results.pages.map((page, index) => (
                  <Card key={index} className="bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1 flex-1 min-w-0"
                          >
                            <span className="truncate">{page.title || page.url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{page.url}</p>
                        {page.content && (
                          <p className="text-xs text-muted-foreground line-clamp-3">
                            {page.content.substring(0, 200)}...
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="bg-muted/30">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No pages available
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="links" className="space-y-4">
            {isLoadingResults ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : results?.links && results.links.length > 0 ? (
              <div className="space-y-2">
                {results.links.slice(0, 100).map((link, index) => (
                  <Card key={index} className="bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground truncate flex-1">{link.from}</span>
                        <span className="text-muted-foreground">→</span>
                        <a
                          href={link.to}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate flex-1 flex items-center gap-1"
                        >
                          {link.to}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                        <Badge variant="outline" className="shrink-0">
                          {link.type}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {results.links.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 100 of {results.links.length} links
                  </p>
                )}
              </div>
            ) : (
              <Card className="bg-muted/30">
                <CardContent className="pt-6">
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No links available
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {knowledge.explorationErrors && knowledge.explorationErrors.length > 0 && (
            <TabsContent value="errors" className="space-y-4">
              <div className="space-y-2">
                {knowledge.explorationErrors.map((error, index) => {
                  const getErrorTypeBadge = () => {
                    if (!error.error_type) return null
                    const colors: Record<string, string> = {
                      network: "border-blue-600 text-blue-600",
                      timeout: "border-yellow-600 text-yellow-600",
                      http_4xx: "border-orange-600 text-orange-600",
                      http_5xx: "border-red-600 text-red-600",
                      parsing: "border-purple-600 text-purple-600",
                      other: "border-muted-foreground text-muted-foreground",
                    }
                    return (
                      <Badge variant="outline" className={colors[error.error_type] || ""}>
                        {error.error_type}
                      </Badge>
                    )
                  }

                  return (
                    <Alert key={index} variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{error.url}</div>
                            <div className="text-muted-foreground mt-0.5">{error.error}</div>
                            {error.retry_count !== undefined && error.retry_count > 0 && (
                              <div className="text-muted-foreground mt-0.5">
                                Retries: {error.retry_count}
                              </div>
                            )}
                          </div>
                          {getErrorTypeBadge()}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )
                })}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Knowledge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this knowledge? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
