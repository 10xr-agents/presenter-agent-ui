"use client"

import { AlertCircle, ExternalLink, Globe, RefreshCw, Square, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { KnowledgeConfiguration } from "@/components/knowledge/knowledge-configuration"
import { KnowledgeProgress } from "@/components/knowledge/knowledge-progress"
import { KnowledgeStatusBadge } from "@/components/knowledge/knowledge-status-badge"
import { KnowledgeSyncActivity } from "@/components/knowledge/knowledge-sync-activity"
import { KnowledgeValidationStatus } from "@/components/knowledge/knowledge-validation-status"
import { KnowledgeVisualization } from "@/components/knowledge/knowledge-visualization"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null) // null means latest job
  const [knowledgeData, setKnowledgeData] = useState<{
    screens?: unknown[]
    tasks?: unknown[]
    actions?: unknown[]
    transitions?: unknown[]
    business_functions?: unknown[]
    workflows?: unknown[]
    statistics?: {
      screens_count?: number
      tasks_count?: number
      actions_count?: number
      transitions_count?: number
      business_functions_count?: number
      workflows_count?: number
      total_entities?: number
    }
  } | null>(null)
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false)

  const handleRefresh = useCallback(() => {
    router.refresh()
  }, [router])

  const handleConfigUpdate = useCallback(() => {
    router.refresh()
  }, [router])

  // Fetch knowledge data when job selection changes
  useEffect(() => {
    const fetchKnowledgeData = async () => {
      // Only fetch if knowledge is completed
      if (knowledge.status !== "completed") {
        setKnowledgeData(null)
        return
      }

      setIsLoadingKnowledge(true)
      try {
        const queryParams = selectedJobId
          ? `?job_id=${encodeURIComponent(selectedJobId)}`
          : ""
        const response = await fetch(`/api/knowledge/query/${knowledge.id}${queryParams}`)
        
        if (!response.ok) {
          if (response.status === 404) {
            // Job not found, clear knowledge data
            setKnowledgeData(null)
            return
          }
          throw new Error("Failed to fetch knowledge data")
        }

        const result = (await response.json()) as {
          data?: {
            screens?: unknown[]
            tasks?: unknown[]
            actions?: unknown[]
            transitions?: unknown[]
            business_functions?: unknown[]
            workflows?: unknown[]
            statistics?: {
              screens_count?: number
              tasks_count?: number
              actions_count?: number
              transitions_count?: number
              business_functions_count?: number
              workflows_count?: number
              total_entities?: number
            }
          }
        }

        if (result.data) {
          setKnowledgeData({
            screens: result.data.screens || [],
            tasks: result.data.tasks || [],
            actions: result.data.actions || [],
            transitions: result.data.transitions || [],
            business_functions: result.data.business_functions || [],
            workflows: result.data.workflows || [],
            statistics: result.data.statistics,
          })
        }
      } catch (err: unknown) {
        console.error("[Knowledge Detail] Failed to fetch knowledge data", {
          knowledgeId: knowledge.id,
          jobId: selectedJobId || "latest",
          error: err instanceof Error ? err.message : String(err),
        })
        setKnowledgeData(null)
      } finally {
        setIsLoadingKnowledge(false)
      }
    }

    fetchKnowledgeData()
  }, [knowledge.id, knowledge.status, selectedJobId])

  useEffect(() => {
    // Validation info is now provided by the knowledge extraction service
    // No need to fetch from legacy website-knowledge API
    setIsLoadingResults(false)
  }, [knowledge.id, knowledge.status, knowledge.jobId, knowledge.sourceType])

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteDialogOpen(false)
    try {
      const response = await fetch(`/api/knowledge/${knowledge.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete knowledge")
      }

      // Navigate to knowledge list and refresh
      router.push("/knowledge")
      router.refresh()
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
      {/* Tabs with Actions */}
      <Tabs defaultValue="overview" className="w-full">
        {/* Tabs Header Row with Actions */}
        <div className="flex items-center justify-between gap-4 mb-8 border-b border-zinc-200 dark:border-zinc-800">
          <TabsList className="h-9 bg-transparent p-0 border-0 border-b border-zinc-200 dark:border-zinc-800">
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
          
          {/* Primary Actions */}
          <div className="flex items-center gap-2 py-2">
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
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
                disabled={
                  isStopping || 
                  isCanceling ||
                  // Disable delete for active jobs - user must cancel first
                  (["pending", "queued", "running"].includes(knowledge.status) && knowledge.jobId !== null)
                }
                className="h-8 text-xs"
                title={
                  ["pending", "queued", "running"].includes(knowledge.status) && knowledge.jobId
                    ? "Cancel the job before deleting"
                    : "Delete knowledge"
                }
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-0">
          <div className="space-y-6">
            {/* Progress for in-progress items */}
            {["pending", "queued", "running"].includes(knowledge.status) && knowledge.jobId && (
              <Card className="bg-muted/30">
                <CardContent className="pt-6">
                  <h3 className="text-sm font-semibold mb-4">Extraction Progress</h3>
                  <KnowledgeProgress
                    knowledgeId={knowledge.id}
                    jobId={knowledge.jobId}
                    workflowId={knowledge.workflowId}
                    onComplete={handleRefresh}
                  />
                </CardContent>
              </Card>
            )}

            {/* Stats for completed items */}
            {knowledge.status === "completed" && (
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-semibold">{knowledge.pagesStored || 0}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Pages indexed</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-semibold">{knowledge.linksStored || 0}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Links discovered</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="text-2xl font-semibold">{knowledge.externalLinksDetected || 0}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">External links</div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Configuration Summary */}
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Crawl Settings</h3>
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
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Strategy:</span>{" "}
                    <span className="font-medium">{knowledge.strategy || "BFS"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max Pages:</span>{" "}
                    <span className="font-medium">{knowledge.maxPages || 100}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max Depth:</span>{" "}
                    <span className="font-medium">{knowledge.maxDepth || 10}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="mt-0">
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <KnowledgeConfiguration
                knowledge={{
                  ...knowledge,
                  organizationId,
                }}
                onUpdate={handleConfigUpdate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contents Tab */}
        <TabsContent value="contents" className="mt-0">
          <div className="space-y-6">
            {knowledge.status === "completed" ? (
              <div className="space-y-4">
                {/* Job Selection Indicator */}
                {selectedJobId && knowledge.syncHistory && knowledge.syncHistory.length > 1 && (
                  <Alert>
                    <AlertDescription className="text-xs">
                      Viewing knowledge from job: <span className="font-mono text-xs">{selectedJobId}</span>
                      {" "}(not latest)
                    </AlertDescription>
                  </Alert>
                )}

                {/* Knowledge Statistics */}
                {knowledgeData?.statistics && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {knowledgeData.statistics.screens_count !== undefined && (
                      <Card className="bg-muted/30">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-semibold">{knowledgeData.statistics.screens_count}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Screens</div>
                        </CardContent>
                      </Card>
                    )}
                    {knowledgeData.statistics.tasks_count !== undefined && (
                      <Card className="bg-muted/30">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-semibold">{knowledgeData.statistics.tasks_count}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Tasks</div>
                        </CardContent>
                      </Card>
                    )}
                    {knowledgeData.statistics.actions_count !== undefined && (
                      <Card className="bg-muted/30">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-semibold">{knowledgeData.statistics.actions_count}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Actions</div>
                        </CardContent>
                      </Card>
                    )}
                    {knowledgeData.statistics.transitions_count !== undefined && (
                      <Card className="bg-muted/30">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-semibold">{knowledgeData.statistics.transitions_count}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Transitions</div>
                        </CardContent>
                      </Card>
                    )}
                    {knowledgeData.statistics.business_functions_count !== undefined && (
                      <Card className="bg-muted/30">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-semibold">{knowledgeData.statistics.business_functions_count}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Business Functions</div>
                        </CardContent>
                      </Card>
                    )}
                    {knowledgeData.statistics.workflows_count !== undefined && (
                      <Card className="bg-muted/30">
                        <CardContent className="pt-6">
                          <div className="text-2xl font-semibold">{knowledgeData.statistics.workflows_count}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">Workflows</div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {/* Loading State */}
                {isLoadingKnowledge && (
                  <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2">
                        <Spinner className="h-4 w-4" />
                        <span className="text-xs text-muted-foreground">Loading knowledge data...</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* No Knowledge Data */}
                {!isLoadingKnowledge && (!knowledgeData || (knowledgeData.statistics?.total_entities === 0)) && (
                  <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                      <Empty className="border-0 p-0">
                        <EmptyHeader>
                          <EmptyTitle className="text-sm font-semibold">No knowledge extracted</EmptyTitle>
                          <EmptyDescription className="text-xs">
                            {selectedJobId
                              ? "This job did not extract any knowledge entities."
                              : "No knowledge entities have been extracted yet."}
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </CardContent>
                  </Card>
                )}

                {/* Knowledge Visualization - Show in understandable format */}
                {knowledgeData && (
                  <KnowledgeVisualization
                    knowledgeData={{
                      screens: knowledgeData.screens as Array<{
                        screen_id?: string
                        name?: string
                        url?: string
                        description?: string
                        [key: string]: unknown
                      }>,
                      tasks: knowledgeData.tasks as Array<{
                        task_id?: string
                        name?: string
                        description?: string
                        steps?: Array<{ action_id?: string; screen_id?: string; [key: string]: unknown }>
                        [key: string]: unknown
                      }>,
                      actions: knowledgeData.actions as Array<{
                        action_id?: string
                        name?: string
                        type?: string
                        target_screen_id?: string
                        [key: string]: unknown
                      }>,
                      transitions: knowledgeData.transitions as Array<{
                        transition_id?: string
                        source_screen_id?: string
                        target_screen_id?: string
                        trigger_action_id?: string
                        conditions?: string[]
                        [key: string]: unknown
                      }>,
                      business_functions: knowledgeData.business_functions as Array<{
                        business_function_id?: string
                        name?: string
                        description?: string
                        related_screens?: string[]
                        [key: string]: unknown
                      }>,
                      workflows: knowledgeData.workflows as Array<{
                        workflow_id?: string
                        name?: string
                        description?: string
                        steps?: Array<{ screen_id?: string; task_id?: string; [key: string]: unknown }>
                        [key: string]: unknown
                      }>,
                      statistics: knowledgeData.statistics,
                    }}
                    isLoading={isLoadingKnowledge}
                  />
                )}

                {/* Legacy Pages/Links Tabs - Keep for backward compatibility with website knowledge */}
                {knowledge.pagesStored !== undefined && (
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
                        <span className="text-xs text-muted-foreground">
                          {knowledge.pagesStored || 0} {knowledge.pagesStored === 1 ? "page" : "pages"} indexed
                        </span>
                      </div>
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
                        <Card className="bg-muted/30">
                          <CardContent className="pt-6 p-0">
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
                          </CardContent>
                        </Card>
                      ) : (
                        <Card className="bg-muted/30">
                          <CardContent className="pt-6">
                            <Empty className="border-0 p-0">
                              <EmptyHeader>
                                <EmptyTitle className="text-sm font-semibold">No pages available</EmptyTitle>
                                <EmptyDescription className="text-xs">
                                  Pages will appear here once extraction is complete.
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          </CardContent>
                        </Card>
                      )}
                    </TabsContent>

                    <TabsContent value="links" className="space-y-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">
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
                        <Card className="bg-muted/30">
                          <CardContent className="pt-6 p-0">
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
                          </CardContent>
                          {results.links.length > 100 && (
                            <div className="border-t p-2 text-center">
                              <p className="text-xs text-muted-foreground">
                                Showing first 100 of {results.links.length} links
                              </p>
                            </div>
                          )}
                        </Card>
                      ) : (
                        <Card className="bg-muted/30">
                          <CardContent className="pt-6">
                            <Empty className="border-0 p-0">
                              <EmptyHeader>
                                <EmptyTitle className="text-sm font-semibold">No links available</EmptyTitle>
                                <EmptyDescription className="text-xs">
                                  Links will appear here once extraction is complete.
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          </CardContent>
                        </Card>
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
                                    <div className="text-sm mt-0.5">{error.message}</div>
                                    {error.timestamp && (
                                      <div className="text-xs text-muted-foreground mt-0.5">
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
                )}
              </div>
            ) : (
              <Empty className="border-dashed border-zinc-200 dark:border-zinc-800 bg-background">
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
            onJobSelect={setSelectedJobId}
            selectedJobId={selectedJobId}
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
              {["pending", "queued", "running"].includes(knowledge.status) && knowledge.jobId !== null ? (
                <>
                  This knowledge has an active job. The job will be canceled automatically before deletion.
                  <br />
                  <br />
                  Are you sure you want to delete this knowledge? This action cannot be undone.
                </>
              ) : (
                "Are you sure you want to delete this knowledge? This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 dark:bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-700 focus-visible:ring-red-600 dark:focus-visible:ring-red-500"
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
