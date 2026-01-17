"use client"

import { AlertCircle, ExternalLink, Globe, RefreshCw, Square, X, Trash2 } from "lucide-react"
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
import { KnowledgeProgress } from "@/components/knowledge/knowledge-progress"
import { KnowledgeValidationStatus } from "@/components/knowledge/knowledge-validation-status"
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
  maxPages?: number
  maxDepth?: number
  strategy?: "BFS" | "DFS"
  includePaths?: string[]
  excludePaths?: string[]
  pagesStored?: number
  linksStored?: number
  screensExtracted?: number
  tasksExtracted?: number
  externalLinksDetected?: number
  extractionErrors?: Array<{
    message: string
    phase?: string
    timestamp?: string
  }>
  validationConfidence?: "high" | "medium" | "low" | "none"
  validationIssues?: string[]
  name?: string
  description?: string
  tags?: string[]
  timesReferenced: number
  lastReferencedAt?: string
  startedAt?: string
  completedAt?: string
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
    pagesProcessed?: number
    linksProcessed?: number
    errorCount?: number
  }>
  organizationId?: string
  createdAt: string
  updatedAt: string
}

interface KnowledgeDetailProps {
  knowledge: KnowledgeSource
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
  const [isStopping, setIsStopping] = useState(false)
  const [isCanceling, setIsCanceling] = useState(false)
  const [validationInfo, setValidationInfo] = useState<{
    confidence?: "high" | "medium" | "low" | "none"
    issues?: string[]
    hasUsableContent?: boolean
  } | null>(null)

  const handleRefresh = useCallback(() => {
    router.refresh()
  }, [router])

  const handleConfigUpdate = useCallback(() => {
    router.refresh()
  }, [router])

  useEffect(() => {
    // Fetch validation info and results for completed knowledge
    if (knowledge.status === "completed" && knowledge.jobId) {
      const fetchValidationInfo = async () => {
        try {
          // For website knowledge, fetch from browser automation results API
          if (knowledge.sourceType === "website") {
            const response = await fetch(`/api/website-knowledge/${knowledge.id}/results`)
            if (response.ok) {
              const result = (await response.json()) as { data?: { validation?: typeof validationInfo } }
              if (result.data?.validation) {
                setValidationInfo(result.data.validation)
              }
            }
          }
        } catch (err: unknown) {
          console.error("[Knowledge Detail] Failed to fetch validation info", {
            knowledgeId: knowledge.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      fetchValidationInfo()
    }
    setIsLoadingResults(false)
  }, [knowledge.id, knowledge.status, knowledge.jobId, knowledge.sourceType])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/knowledge/${knowledge.id}`, {
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
      const response = await fetch(`/api/knowledge/${knowledge.id}/resync`, {
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

  const handleStop = async () => {
    if (!knowledge.jobId) return
    
    setIsStopping(true)
    setError(null)
    try {
      const response = await fetch(`/api/knowledge/${knowledge.id}/pause`, {
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

      // Refresh the page to show updated status
      router.refresh()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to stop job"
      setError(errorMessage)
    } finally {
      setIsStopping(false)
    }
  }

  const handleCancel = async () => {
    if (!knowledge.jobId) return
    
    setIsCanceling(true)
    setError(null)
    try {
      const response = await fetch(`/api/knowledge/${knowledge.id}/cancel`, {
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

      // Refresh the page to show updated status
      router.refresh()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to cancel job"
      setError(errorMessage)
    } finally {
      setIsCanceling(false)
    }
  }


  return (
    <div className="bg-background">
      {/* Integrated Tabs with Actions */}
      <Tabs defaultValue="overview" className="w-full">
        <div className="border-b">
          <div className="flex items-center justify-between">
            <TabsList className="h-9 bg-transparent p-0 border-0">
              <TabsTrigger 
                value="overview" 
                className="text-xs h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger 
                value="configuration" 
                className="text-xs h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground"
              >
                Configuration
              </TabsTrigger>
              <TabsTrigger 
                value="contents" 
                className="text-xs h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground"
              >
                Contents
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                className="text-xs h-9 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground"
              >
                Activity
              </TabsTrigger>
            </TabsList>
            
            {/* Primary Actions - Integrated with tabs */}
            <div className="flex items-center gap-2 px-4 py-2">
              {/* Stop and Cancel - Only show for queued/running jobs */}
              {["pending", "queued", "running"].includes(knowledge.status) && knowledge.jobId && (
                <>
                  {/* Stop (Pause) - Only for running jobs */}
                  {knowledge.status === "running" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStop}
                      disabled={isStopping || isCanceling}
                      className="h-8 text-xs bg-background hover:bg-accent"
                    >
                      {isStopping ? (
                        <>
                          <Spinner className="mr-1.5 h-3.5 w-3.5" />
                          Stopping...
                        </>
                      ) : (
                        <>
                          <Square className="mr-1.5 h-3.5 w-3.5" />
                          Stop
                        </>
                      )}
                    </Button>
                  )}
                  {/* Cancel - For queued or running jobs */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    disabled={isStopping || isCanceling}
                    className="h-8 text-xs bg-background hover:bg-accent"
                  >
                    {isCanceling ? (
                      <>
                        <Spinner className="mr-1.5 h-3.5 w-3.5" />
                        Canceling...
                      </>
                    ) : (
                      <>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        Cancel
                      </>
                    )}
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleResync}
                disabled={isResyncing || ["pending", "queued", "running"].includes(knowledge.status) || isStopping || isCanceling}
                className="h-8 text-xs bg-background hover:bg-accent"
              >
                {isResyncing ? (
                  <>
                    <Spinner className="mr-1.5 h-3.5 w-3.5" />
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
                disabled={isStopping || isCanceling}
                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </div>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-0">
          <div className="py-6 px-6 space-y-6">
            {/* Progress for in-progress items */}
            {["pending", "queued", "running"].includes(knowledge.status) && knowledge.jobId && (
              <div>
                <KnowledgeProgress
                  knowledgeId={knowledge.id}
                  jobId={knowledge.jobId}
                  workflowId={knowledge.workflowId}
                  onComplete={handleRefresh}
                />
              </div>
            )}

            {/* Stats for completed items */}
            {knowledge.status === "completed" && (
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <div className="text-2xl font-semibold">{knowledge.pagesStored || 0}</div>
                  <div className="text-xs text-foreground mt-0.5">Pages indexed</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">{knowledge.linksStored || 0}</div>
                  <div className="text-xs text-foreground mt-0.5">Links discovered</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">{knowledge.externalLinksDetected || 0}</div>
                  <div className="text-xs text-foreground mt-0.5">External links</div>
                </div>
              </div>
            )}

            {/* Configuration Summary */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="text-xs text-foreground">Crawl Settings</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <div>
                      <span className="text-foreground opacity-60">Strategy:</span>{" "}
                      <span className="font-medium">{knowledge.strategy || "BFS"}</span>
                    </div>
                    <div>
                      <span className="text-foreground opacity-60">Max Pages:</span>{" "}
                      <span className="font-medium">{knowledge.maxPages || 100}</span>
                    </div>
                    <div>
                      <span className="text-foreground opacity-60">Max Depth:</span>{" "}
                      <span className="font-medium">{knowledge.maxDepth || 10}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const configTab = document.querySelector('[value="configuration"]') as HTMLElement
                    configTab?.click()
                  }}
                  className="h-7 text-xs"
                >
                  View full configuration →
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="mt-0">
          <div className="py-6 px-6">
            <KnowledgeConfiguration
              knowledge={{
                ...knowledge,
                organizationId,
              }}
              onUpdate={handleConfigUpdate}
            />
          </div>
        </TabsContent>

        {/* Contents Tab */}
        <TabsContent value="contents" className="mt-0">
          <div className="py-6 px-6">
            {knowledge.status === "completed" ? (
              <div className="space-y-4">

              <Tabs defaultValue="pages" className="space-y-3">
              <TabsList className="h-9">
                <TabsTrigger value="pages" className="text-xs">Pages</TabsTrigger>
                <TabsTrigger value="links" className="text-xs">Links</TabsTrigger>
                {knowledge.extractionErrors && knowledge.extractionErrors.length > 0 && (
                  <TabsTrigger value="errors" className="text-xs">
                    Errors ({knowledge.extractionErrors.length})
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
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">No pages available</EmptyTitle>
                  <EmptyDescription className="text-xs">
                    Pages will appear here once extraction is complete.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
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
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">No links available</EmptyTitle>
                  <EmptyDescription className="text-xs">
                    Links will appear here once extraction is complete.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </TabsContent>

              {knowledge.extractionErrors && knowledge.extractionErrors.length > 0 && (
                <TabsContent value="errors" className="space-y-2">
                  {knowledge.extractionErrors.map((error, index) => {
                    return (
                      <Alert key={index} variant="destructive" className="py-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <AlertDescription className="text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              {error.phase && (
                                <div className="font-medium truncate">{error.phase}</div>
                              )}
                              <div className="text-foreground opacity-85 mt-0.5">{error.message}</div>
                              {error.timestamp && (
                                <div className="text-foreground opacity-85 mt-0.5">
                                  {new Date(error.timestamp).toLocaleString()}
                                </div>
                              )}
                            </div>
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
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">No contents available</EmptyTitle>
                  <EmptyDescription className="text-xs">
                    Knowledge sync must complete before contents are available.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-0">
          <div className="py-6 px-6">
            <KnowledgeSyncActivity
              knowledgeId={knowledge.id}
              currentStatus={knowledge.status}
              startedAt={knowledge.startedAt}
              completedAt={knowledge.completedAt}
              pagesStored={knowledge.pagesStored}
              linksStored={knowledge.linksStored}
              extractionErrors={knowledge.extractionErrors}
              syncHistory={knowledge.syncHistory}
              createdAt={knowledge.createdAt}
            />
          </div>
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
