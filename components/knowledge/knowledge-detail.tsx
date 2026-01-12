"use client"

import { AlertCircle, ExternalLink, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KnowledgeStatusBadge } from "@/components/knowledge/knowledge-status-badge"
import { KnowledgeSyncActivity } from "@/components/knowledge/knowledge-sync-activity"
import { KnowledgeConfiguration } from "@/components/knowledge/knowledge-configuration"
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

  const handleRefresh = useCallback(() => {
    router.refresh()
  }, [router])

  const handleConfigUpdate = useCallback(() => {
    router.refresh()
  }, [router])

  useEffect(() => {
    // Only fetch results if status is completed and we have a job ID
    if (knowledge.status === "completed" && knowledge.explorationJobId) {
      const fetchResults = async () => {
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
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : "Failed to load results"
          setError(errorMessage)
        } finally {
          setIsLoadingResults(false)
        }
      }

      fetchResults()
    }
    // Only depend on the actual values we care about, not the entire knowledge object
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knowledge.id, knowledge.status, knowledge.explorationJobId])

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
      const response = await fetch(`/api/website-knowledge/${knowledge.id}/resync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to re-sync knowledge")
      }

      // Refresh the page to show updated status and sync history
      router.refresh()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to re-sync knowledge"
      setError(errorMessage)
    } finally {
      setIsResyncing(false)
    }
  }


  return (
    <div className="space-y-6">
      {/* Primary Actions Header */}
      <div className="flex items-center justify-end gap-2 pb-4 border-b">
        <Button
          variant="outline"
          size="sm"
          onClick={handleResync}
          disabled={isResyncing || ["pending", "exploring"].includes(knowledge.status)}
          className="h-8 text-xs"
        >
          {isResyncing ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
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
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="h-9 bg-transparent p-0 border-b">
          <TabsTrigger 
            value="overview" 
            className="text-xs h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger 
            value="configuration" 
            className="text-xs h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Configuration
          </TabsTrigger>
          <TabsTrigger 
            value="contents" 
            className="text-xs h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Contents
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="text-xs h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Source Information */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-foreground opacity-60 shrink-0" />
              <a
                href={knowledge.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1.5 flex-1 min-w-0"
              >
                <span className="truncate">{knowledge.websiteUrl}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
            {results?.website_metadata?.title && (
              <p className="text-sm font-medium">{results.website_metadata.title}</p>
            )}
            {results?.website_metadata?.description && (
              <p className="text-xs text-foreground opacity-85">{results.website_metadata.description}</p>
            )}
            {knowledge.description && !results?.website_metadata?.description && (
              <p className="text-xs text-foreground opacity-85">{knowledge.description}</p>
            )}
          </div>

          {/* Progress for in-progress items */}
          {["pending", "exploring"].includes(knowledge.status) && knowledge.explorationJobId && (
            <div className="pt-4 border-t">
              <WebsiteKnowledgeProgress
                knowledgeId={knowledge.id}
                onComplete={handleRefresh}
              />
            </div>
          )}

          {/* Stats for completed items */}
          {knowledge.status === "completed" && (
            <div className="grid grid-cols-3 gap-6 pt-4 border-t">
              <div>
                <div className="text-2xl font-semibold">{knowledge.pagesStored || 0}</div>
                <div className="text-xs text-foreground opacity-85 mt-0.5">Pages</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{knowledge.linksStored || 0}</div>
                <div className="text-xs text-foreground opacity-85 mt-0.5">Links</div>
              </div>
              <div>
                <div className="text-2xl font-semibold">{knowledge.externalLinksDetected || 0}</div>
                <div className="text-xs text-foreground opacity-85 mt-0.5">External Links</div>
              </div>
            </div>
          )}

          {/* Quick Info */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground opacity-60">Configuration</span>
              <a
                href="#configuration"
                onClick={(e) => {
                  e.preventDefault()
                  const configTab = document.querySelector('[value="configuration"]') as HTMLElement
                  configTab?.click()
                }}
                className="text-primary hover:underline font-medium"
              >
                View full configuration →
              </a>
            </div>
          </div>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="space-y-6 mt-6">
          <KnowledgeConfiguration
            knowledge={{
              ...knowledge,
              organizationId,
            }}
            onUpdate={handleConfigUpdate}
          />
        </TabsContent>

        {/* Contents Tab */}
        <TabsContent value="contents" className="space-y-6 mt-6">
          {knowledge.status === "completed" ? (
            <div className="space-y-4">
              {/* Contents Summary */}
              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="text-xs font-semibold">Summary</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-foreground opacity-60">Pages indexed:</span>{" "}
                    <span className="font-medium">{knowledge.pagesStored || 0}</span>
                  </div>
                  <div>
                    <span className="text-foreground opacity-60">Links discovered:</span>{" "}
                    <span className="font-medium">{knowledge.linksStored || 0}</span>
                  </div>
                  {knowledge.externalLinksDetected !== undefined && (
                    <div>
                      <span className="text-foreground opacity-60">External links:</span>{" "}
                      <span className="font-medium">{knowledge.externalLinksDetected}</span>
                    </div>
                  )}
                  {knowledge.completedAt && (
                    <div>
                      <span className="text-foreground opacity-60">Last updated:</span>{" "}
                      <span className="font-medium">
                        {new Date(knowledge.completedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t">
                  <div className="text-xs text-foreground opacity-85">
                    This Knowledge is indexed and searchable by your agents.
                  </div>
                </div>
              </div>

              <Tabs defaultValue="pages" className="space-y-3">
              <TabsList className="h-9">
                <TabsTrigger value="pages" className="text-xs">Pages</TabsTrigger>
                <TabsTrigger value="links" className="text-xs">Links</TabsTrigger>
                {knowledge.explorationErrors && knowledge.explorationErrors.length > 0 && (
                  <TabsTrigger value="errors" className="text-xs">
                    Errors ({knowledge.explorationErrors.length})
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="pages" className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-foreground opacity-60">
                {knowledge.pagesStored || 0} {knowledge.pagesStored === 1 ? "page" : "pages"} indexed
              </span>
            </div>
            {isLoadingResults ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border rounded-lg p-3">
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            ) : results?.pages && results.pages.length > 0 ? (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 text-xs font-semibold">Page</TableHead>
                      <TableHead className="h-9 text-xs font-semibold">URL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.pages.map((page, index) => (
                      <TableRow key={index}>
                        <TableCell className="py-2">
                          <a
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1"
                          >
                            <span>{page.title || page.url}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell className="py-2">
                          <p className="text-xs text-foreground opacity-85 truncate max-w-md">
                            {page.url}
                          </p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center">
                <p className="text-xs text-foreground opacity-85">
                  No pages available
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="links" className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-foreground opacity-60">
                {knowledge.linksStored || 0} {knowledge.linksStored === 1 ? "link" : "links"} discovered
              </span>
            </div>
            {isLoadingResults ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : results?.links && results.links.length > 0 ? (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-9 text-xs font-semibold">From</TableHead>
                      <TableHead className="h-9 text-xs font-semibold">To</TableHead>
                      <TableHead className="h-9 text-xs font-semibold">Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.links.slice(0, 100).map((link, index) => (
                      <TableRow key={index}>
                        <TableCell className="py-2">
                          <p className="text-xs text-foreground opacity-85 truncate max-w-md">
                            {link.from}
                          </p>
                        </TableCell>
                        <TableCell className="py-2">
                          <a
                            href={link.to}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <span className="truncate max-w-md">{link.to}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-xs">
                            {link.type}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {results.links.length > 100 && (
                  <div className="border-t p-2 text-center">
                    <p className="text-xs text-foreground opacity-85">
                      Showing first 100 of {results.links.length} links
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center">
                <p className="text-xs text-foreground opacity-85">
                  No links available
                </p>
              </div>
            )}
          </TabsContent>

              {knowledge.explorationErrors && knowledge.explorationErrors.length > 0 && (
                <TabsContent value="errors" className="space-y-2">
                  {knowledge.explorationErrors.map((error, index) => {
                    const getErrorTypeBadge = () => {
                      if (!error.error_type) return null
                      const colors: Record<string, string> = {
                        network: "border-blue-600 text-blue-600",
                        timeout: "border-yellow-600 text-yellow-600",
                        http_4xx: "border-orange-600 text-orange-600",
                        http_5xx: "border-red-600 text-red-600",
                        parsing: "border-purple-600 text-purple-600",
                        other: "border-foreground/50 text-foreground",
                      }
                      return (
                        <Badge variant="outline" className={cn("text-xs", colors[error.error_type] || "")}>
                          {error.error_type}
                        </Badge>
                      )
                    }

                    return (
                      <Alert key={index} variant="destructive" className="py-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <AlertDescription className="text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{error.url}</div>
                              <div className="text-foreground opacity-85 mt-0.5">{error.error}</div>
                              {error.retry_count !== undefined && error.retry_count > 0 && (
                                <div className="text-foreground opacity-85 mt-0.5">
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
                </TabsContent>
              )}
              </Tabs>
            </div>
          ) : (
            <div className="border rounded-lg p-8 text-center">
              <p className="text-xs text-foreground opacity-85">
                Knowledge sync must complete before contents are available.
              </p>
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-6 mt-6">
          <KnowledgeSyncActivity
            knowledgeId={knowledge.id}
            currentStatus={knowledge.status}
            startedAt={knowledge.startedAt}
            completedAt={knowledge.completedAt}
            pagesStored={knowledge.pagesStored}
            linksStored={knowledge.linksStored}
            explorationErrors={knowledge.explorationErrors}
            syncHistory={knowledge.syncHistory}
            createdAt={knowledge.createdAt}
          />
        </TabsContent>
      </Tabs>

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
