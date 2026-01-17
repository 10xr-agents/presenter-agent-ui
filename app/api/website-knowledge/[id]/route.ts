import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { cancelJob, getJobResults, getJobStatus } from "@/lib/browser-automation/client"
import { connectDB } from "@/lib/db/mongoose"
import { type IWebsiteKnowledge, WebsiteKnowledge } from "@/lib/models/website-knowledge"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

// Serialize syncHistory to remove _id fields and convert dates
function serializeSyncHistory(syncHistory: unknown) {
  if (!Array.isArray(syncHistory)) return []
  return syncHistory.map((sync: unknown) => {
    const s = sync as {
      _id?: unknown
      jobId?: unknown
      status?: unknown
      triggerType?: unknown
      startedAt?: unknown
      completedAt?: unknown
      pagesProcessed?: unknown
      linksProcessed?: unknown
      errorCount?: unknown
    }
    return {
      jobId: String(s.jobId || ""),
      status: String(s.status || "pending"),
      triggerType: String(s.triggerType || "initial"),
      startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : (s.startedAt ? String(s.startedAt) : new Date().toISOString()),
      completedAt: s.completedAt instanceof Date ? s.completedAt.toISOString() : (s.completedAt ? String(s.completedAt) : undefined),
      pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
      linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
      errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
    }
  })
}

/**
 * GET /api/website-knowledge/[id] - Get website knowledge details and status
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    await connectDB()

    let knowledge = await (WebsiteKnowledge as any).findById(id).lean()

    if (!knowledge) {
      return NextResponse.json({ error: "Website knowledge not found" }, { status: 404 })
    }

    // Fetch latest job status if exploration is in progress
    let jobStatus = null
    if (knowledge.explorationJobId && ["pending", "exploring"].includes(knowledge.status)) {
      try {
        console.log("[Website Knowledge] Fetching job status", {
          knowledgeId: id,
          jobId: knowledge.explorationJobId,
          currentStatus: knowledge.status,
        })
        
        jobStatus = await getJobStatus(knowledge.explorationJobId)
        
        console.log("[Website Knowledge] Job status retrieved", {
          knowledgeId: id,
          jobId: knowledge.explorationJobId,
          serviceStatus: jobStatus.status,
          currentKnowledgeStatus: knowledge.status,
          progress: jobStatus.progress ? {
            completed: jobStatus.progress.completed ?? 0,
            queued: jobStatus.progress.queued ?? 0,
            failed: jobStatus.progress.failed ?? 0,
          } : null,
        })
        
        // Update local status based on job status
        // Map browser automation service status to our status
        const statusMap: Record<string, "pending" | "exploring" | "completed" | "failed" | "cancelled"> = {
          "idle": "pending",
          "queued": "pending",
          "running": "exploring",
          "completed": "completed",
          "failed": "failed",
          "cancelled": "cancelled",
          "cancelling": "cancelled",
        }
        
        const mappedStatus = statusMap[jobStatus.status] || knowledge.status
        
        // If service returns "queued" or "pending" but we have progress data, job is likely running
        // Also check if job has been running for a while (indicates it's actually exploring)
        const hasProgress = jobStatus.progress && (
          (jobStatus.progress.completed ?? 0) > 0 ||
          (jobStatus.progress.queued ?? 0) > 0 ||
          (jobStatus.progress.failed ?? 0) > 0
        )
        
        // Handle case where service returns "queued" but job is actually running
        const effectiveStatus = ((jobStatus.status === "queued" || jobStatus.status === "idle") && hasProgress && knowledge.status === "pending")
          ? "exploring"
          : mappedStatus
        
        // Update status if it has changed
        if (effectiveStatus !== knowledge.status && ["pending", "exploring", "completed", "failed", "cancelled"].includes(effectiveStatus)) {
          // Fetch non-lean document for update
          const docToUpdate = await (WebsiteKnowledge as any).findById(id)
          if (docToUpdate) {
            if (effectiveStatus === "exploring" && knowledge.status === "pending") {
              // Job started running
              docToUpdate.status = "exploring"
              
              // Update sync history
              const syncHistory = Array.isArray(docToUpdate.syncHistory) 
                ? docToUpdate.syncHistory.map((sync: unknown) => {
                    const s = sync as { jobId?: unknown; status?: unknown; [key: string]: unknown }
                    return {
                      jobId: String(s.jobId || ""),
                      status: String(s.status || "pending"),
                      triggerType: String(s.triggerType || "initial"),
                      startedAt: s.startedAt instanceof Date ? s.startedAt : (s.startedAt ? new Date(s.startedAt as string) : new Date()),
                      completedAt: s.completedAt instanceof Date ? s.completedAt : (s.completedAt ? new Date(s.completedAt as string) : undefined),
                      pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
                      linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
                      errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
                    }
                  })
                : []
              
              const currentSyncIndex = syncHistory.findIndex(
                (sync: { jobId: string }) => sync.jobId === knowledge.explorationJobId
              )
              if (currentSyncIndex >= 0) {
                syncHistory[currentSyncIndex] = {
                  ...syncHistory[currentSyncIndex],
                  status: "exploring",
                }
                docToUpdate.syncHistory = syncHistory
              }
              
              await docToUpdate.save()
              
              // Refresh knowledge object for response
              const refreshedKnowledge = await (WebsiteKnowledge as any).findById(id).lean()
              Object.assign(knowledge, refreshedKnowledge)
              
              console.log("[Website Knowledge] Job started, updated status to exploring", {
                knowledgeId: id,
                jobId: knowledge.explorationJobId,
                serviceStatus: jobStatus.status,
                hasProgress,
              })
            }
          }
        }
        
        if (jobStatus.status === "completed" && knowledge.status !== "completed") {
          console.log("[Website Knowledge] Job completed, updating knowledge", {
            knowledgeId: id,
            jobId: knowledge.explorationJobId,
          })
          
          // Fetch results to update summary
          try {
            console.log("[Website Knowledge] PIPELINE STEP: Fetching job results", {
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
              websiteUrl: knowledge.websiteUrl,
              stage: "results_fetch",
            })
            
            const results = await getJobResults(knowledge.explorationJobId, false)
            
            console.log("[Website Knowledge] PIPELINE STEP: Results fetched, validating knowledge extraction", {
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
              status: results.status,
              pagesStored: results.results.pages_stored,
              linksStored: results.results.links_stored,
              hasPagesArray: !!results.pages,
              hasLinksArray: !!results.links,
              pagesArrayLength: results.pages?.length ?? 0,
              linksArrayLength: results.links?.length ?? 0,
              stage: "results_validation",
            })
            
            // CRITICAL: Validate that we actually extracted usable knowledge
            // The validation is already done in getJobResults, but we log it here for traceability
            if (results.results.pages_stored === 0 && results.results.links_stored === 0) {
              const error = "Job completed but extracted zero pages and zero links - no knowledge was extracted"
              console.error("[Website Knowledge] CRITICAL FAILURE - Zero knowledge extracted", {
                knowledgeId: id,
                jobId: knowledge.explorationJobId,
                websiteUrl: knowledge.websiteUrl,
                error,
                errorCount: results.results.errors.length,
                errors: results.results.errors,
              })
              Sentry.captureMessage("Browser automation job completed with zero extracted knowledge", {
                level: "error",
                tags: {
                  operation: "store_knowledge_results",
                  knowledgeId: id,
                  jobId: knowledge.explorationJobId,
                  failure_type: "zero_knowledge_extracted",
                },
                extra: {
                  knowledgeId: id,
                  jobId: knowledge.explorationJobId,
                  websiteUrl: knowledge.websiteUrl,
                  pagesStored: results.results.pages_stored,
                  linksStored: results.results.links_stored,
                  errorCount: results.results.errors.length,
                },
              })
              // Mark as failed instead of completed
              await (WebsiteKnowledge as any).findByIdAndUpdate(id, {
                status: "failed",
                explorationErrors: results.results.errors.map((err) => ({
                  url: err.url,
                  error: err.error,
                  error_type: err.error_type,
                  retry_count: err.retry_count,
                  last_attempted_at: err.last_attempted_at,
                })),
                completedAt: new Date(),
              })
              knowledge.status = "failed"
              throw new Error(error)
            }
            
            // Validate pages have content if pages array is present
            if (results.pages && results.pages.length > 0) {
              const pagesWithContent = results.pages.filter((p) => p.content && p.content.length > 0).length
              const pagesWithoutContent = results.pages.length - pagesWithContent
              
              console.log("[Website Knowledge] PIPELINE STEP: Validating page content", {
                knowledgeId: id,
                jobId: knowledge.explorationJobId,
                totalPages: results.pages.length,
                pagesWithContent,
                pagesWithoutContent,
                stage: "content_validation",
              })
              
              if (pagesWithContent === 0) {
                const error = "All extracted pages are missing content - no usable knowledge"
                console.error("[Website Knowledge] CRITICAL FAILURE - Pages missing content", {
                  knowledgeId: id,
                  jobId: knowledge.explorationJobId,
                  websiteUrl: knowledge.websiteUrl,
                  error,
                  totalPages: results.pages.length,
                })
                Sentry.captureMessage("All browser automation pages missing content", {
                  level: "error",
                  tags: {
                    operation: "store_knowledge_results",
                    knowledgeId: id,
                    jobId: knowledge.explorationJobId,
                    failure_type: "pages_missing_content",
                  },
                  extra: {
                    knowledgeId: id,
                    jobId: knowledge.explorationJobId,
                    websiteUrl: knowledge.websiteUrl,
                    totalPages: results.pages.length,
                    pagesStored: results.results.pages_stored,
                  },
                })
                // Mark as failed
                await (WebsiteKnowledge as any).findByIdAndUpdate(id, {
                  status: "failed",
                  explorationErrors: [
                    ...results.results.errors,
                    {
                      url: knowledge.websiteUrl,
                      error: error,
                      error_type: "parsing" as const,
                      retry_count: undefined,
                      last_attempted_at: undefined,
                    },
                  ].map((err) => ({
                    url: err.url,
                    error: err.error,
                    error_type: err.error_type,
                    retry_count: "retry_count" in err ? err.retry_count : undefined,
                    last_attempted_at: "last_attempted_at" in err ? err.last_attempted_at : undefined,
                  })),
                  completedAt: new Date(),
                })
                knowledge.status = "failed"
                throw new Error(error)
              }
            }
            
            console.log("[Website Knowledge] PIPELINE STEP: Storing validated knowledge results", {
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
              pagesStored: results.results.pages_stored,
              linksStored: results.results.links_stored,
              externalLinksDetected: results.results.external_links_detected,
              errorCount: results.results.errors.length,
              stage: "storage",
            })
            
            // Update sync history for the current job
            const syncHistory = knowledge.syncHistory || []
            const currentSyncIndex = syncHistory.findIndex(
              (sync: { jobId: string }) => sync.jobId === knowledge.explorationJobId
            )
            
            if (currentSyncIndex >= 0) {
              syncHistory[currentSyncIndex] = {
                ...syncHistory[currentSyncIndex],
                status: "completed",
                completedAt: new Date(),
                pagesProcessed: results.results.pages_stored,
                linksProcessed: results.results.links_stored,
                errorCount: results.results.errors.length,
              }
            }
            
            await (WebsiteKnowledge as any).findByIdAndUpdate(id, {
              status: "completed",
              pagesStored: results.results.pages_stored,
              linksStored: results.results.links_stored,
              externalLinksDetected: results.results.external_links_detected,
              explorationErrors: results.results.errors.map((err) => ({
                url: err.url,
                error: err.error,
                error_type: err.error_type,
                retry_count: err.retry_count,
                last_attempted_at: err.last_attempted_at,
              })),
              completedAt: new Date(),
              syncHistory,
            })
            
            console.log("[Website Knowledge] PIPELINE STEP: Knowledge results stored successfully", {
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
              pagesStored: results.results.pages_stored,
              linksStored: results.results.links_stored,
              stage: "storage_complete",
            })
            
            knowledge.status = "completed"
            knowledge.pagesStored = results.results.pages_stored
            knowledge.linksStored = results.results.links_stored
            knowledge.externalLinksDetected = results.results.external_links_detected
            knowledge.explorationErrors = results.results.errors.map((err) => ({
              url: err.url,
              error: err.error,
              error_type: err.error_type,
              retry_count: err.retry_count,
              last_attempted_at: err.last_attempted_at,
            }))
            knowledge.completedAt = new Date()
            
            console.log("[Website Knowledge] Marked as completed", {
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
              pagesStored: results.results.pages_stored,
              linksStored: results.results.links_stored,
              errorCount: results.results.errors.length,
            })
          } catch (error: unknown) {
            console.error("[Website Knowledge] Failed to fetch results after completion", {
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
              error: error instanceof Error ? error.message : String(error),
            })
            Sentry.captureException(error, {
              tags: {
                operation: "fetch_job_results",
                knowledgeId: id,
                jobId: knowledge.explorationJobId,
              },
            })
          }
        } else if (jobStatus.status === "failed" && knowledge.status !== "failed") {
          console.warn("[Website Knowledge] Job failed, updating status", {
            knowledgeId: id,
            jobId: knowledge.explorationJobId,
            websiteUrl: knowledge.websiteUrl,
          })
          
          // Update sync history for the failed job
          // Need to fetch fresh document to get syncHistory array
          const updatedKnowledge = await (WebsiteKnowledge as any).findById(id)
          const syncHistory = updatedKnowledge.syncHistory || []
          const currentSyncIndex = syncHistory.findIndex(
            (sync: { jobId: string }) => sync.jobId === knowledge.explorationJobId
          )
          
          if (currentSyncIndex >= 0) {
            syncHistory[currentSyncIndex] = {
              ...syncHistory[currentSyncIndex],
              status: "failed",
              completedAt: new Date(),
            }
          }
          
          await (WebsiteKnowledge as any).findByIdAndUpdate(id, {
            status: "failed",
            syncHistory,
          })
          knowledge.status = "failed"
          
          Sentry.captureMessage("Website knowledge exploration failed", {
            level: "warning",
            tags: {
              operation: "exploration_failed",
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
            },
            extra: {
              websiteUrl: knowledge.websiteUrl,
              websiteDomain: knowledge.websiteDomain,
            },
          })
        } else if ((jobStatus.status === "running" || jobStatus.status === "queued") && knowledge.status === "pending") {
          // Job has started running - update status to exploring
          // Note: "queued" jobs may also be actively processing, so we update to exploring
          console.log("[Website Knowledge] Job started running, updating to exploring", {
            knowledgeId: id,
            jobId: knowledge.explorationJobId,
            serviceStatus: jobStatus.status,
          })
          
          // Update sync history for the running job
          // Need to fetch fresh document to get syncHistory array
          const updatedKnowledge = await (WebsiteKnowledge as any).findById(id)
          const syncHistory = updatedKnowledge.syncHistory || []
          const currentSyncIndex = syncHistory.findIndex(
            (sync: { jobId: string }) => sync.jobId === knowledge.explorationJobId
          )
          
          if (currentSyncIndex >= 0) {
            syncHistory[currentSyncIndex] = {
              ...syncHistory[currentSyncIndex],
              status: "exploring",
            }
          }
          
          await (WebsiteKnowledge as any).findByIdAndUpdate(id, {
            status: "exploring",
            syncHistory,
          })
          
          // Refresh knowledge object for response
          const refreshedKnowledge = await (WebsiteKnowledge as any).findById(id).lean()
          Object.assign(knowledge, refreshedKnowledge)
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorWithStatus = error as Error & { statusCode?: number; isNotFound?: boolean }
        const isJobNotFound = errorWithStatus.isNotFound || 
                              errorWithStatus.statusCode === 404 ||
                              errorMessage.toLowerCase().includes("not found") || 
                              (errorMessage.toLowerCase().includes("job") && errorMessage.toLowerCase().includes("404"))
        
        console.error("[Website Knowledge] Failed to fetch job status", {
          knowledgeId: id,
          jobId: knowledge.explorationJobId,
          error: errorMessage,
          statusCode: errorWithStatus.statusCode,
          isJobNotFound,
        })
        
        // If job is not found (404), mark the sync as failed
        if (isJobNotFound) {
          console.warn("[Website Knowledge] Job not found, marking sync as failed", {
            knowledgeId: id,
            jobId: knowledge.explorationJobId,
            currentStatus: knowledge.status,
          })
          
          // Update sync history for the missing job
          const syncHistory = knowledge.syncHistory || []
          const currentSyncIndex = syncHistory.findIndex(
            (sync: { jobId: string }) => sync.jobId === knowledge.explorationJobId
          )
          
          if (currentSyncIndex >= 0) {
            syncHistory[currentSyncIndex] = {
              ...syncHistory[currentSyncIndex],
              status: "failed",
              completedAt: new Date(),
              errorCount: 1,
            }
          }
          
          // Update knowledge record to failed status
          await (WebsiteKnowledge as any).findByIdAndUpdate(id, {
            status: "failed",
            syncHistory,
          })
          
          // Refresh knowledge object for response
          const refreshedKnowledge = await (WebsiteKnowledge as any).findById(id).lean()
          Object.assign(knowledge, refreshedKnowledge)
          
          Sentry.captureMessage("Website knowledge job not found - marked as failed", {
            level: "warning",
            tags: {
              operation: "job_not_found",
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
            },
          })
        } else {
          // For other errors, just log but don't change status (might be transient)
          Sentry.captureException(error, {
            tags: {
              operation: "fetch_job_status",
              knowledgeId: id,
              jobId: knowledge.explorationJobId,
            },
          })
        }
      }
    }

    // Ensure we have a lean object for serialization
    const knowledgeLean = knowledge._id ? knowledge : await (WebsiteKnowledge as any).findById(id).lean()
    
    return NextResponse.json({
      data: {
        id: knowledgeLean._id.toString(),
        websiteUrl: String(knowledgeLean.websiteUrl || ""),
        websiteDomain: String(knowledgeLean.websiteDomain || ""),
        status: String(knowledgeLean.status || "pending"),
        explorationJobId: knowledgeLean.explorationJobId ? String(knowledgeLean.explorationJobId) : null,
        syncHistory: serializeSyncHistory(knowledgeLean.syncHistory),
        maxPages: typeof knowledgeLean.maxPages === "number" ? knowledgeLean.maxPages : undefined,
        maxDepth: typeof knowledgeLean.maxDepth === "number" ? knowledgeLean.maxDepth : undefined,
        strategy: knowledgeLean.strategy ? String(knowledgeLean.strategy) : undefined,
        includePaths: Array.isArray(knowledgeLean.includePaths) ? knowledgeLean.includePaths.map(String) : undefined,
        excludePaths: Array.isArray(knowledgeLean.excludePaths) ? knowledgeLean.excludePaths.map(String) : undefined,
        pagesStored: typeof knowledgeLean.pagesStored === "number" ? knowledgeLean.pagesStored : undefined,
        linksStored: typeof knowledgeLean.linksStored === "number" ? knowledgeLean.linksStored : undefined,
        externalLinksDetected: typeof knowledgeLean.externalLinksDetected === "number" ? knowledgeLean.externalLinksDetected : undefined,
        explorationErrors: Array.isArray(knowledgeLean.explorationErrors) 
          ? knowledgeLean.explorationErrors.map((e: unknown) => ({
              url: String((e as { url?: unknown }).url || ""),
              error: String((e as { error?: unknown }).error || ""),
              error_type: (e as { error_type?: unknown }).error_type ? String((e as { error_type: unknown }).error_type) : undefined,
              retry_count: typeof (e as { retry_count?: unknown }).retry_count === "number" ? (e as { retry_count: number }).retry_count : undefined,
            }))
          : undefined,
        name: knowledgeLean.name ? String(knowledgeLean.name) : undefined,
        description: knowledgeLean.description ? String(knowledgeLean.description) : undefined,
        tags: Array.isArray(knowledgeLean.tags) ? knowledgeLean.tags.map(String) : undefined,
        timesReferenced: typeof knowledgeLean.timesReferenced === "number" ? knowledgeLean.timesReferenced : 0,
        lastReferencedAt: knowledgeLean.lastReferencedAt instanceof Date 
          ? knowledgeLean.lastReferencedAt.toISOString() 
          : (knowledgeLean.lastReferencedAt ? String(knowledgeLean.lastReferencedAt) : undefined),
        startedAt: knowledgeLean.startedAt instanceof Date 
          ? knowledgeLean.startedAt.toISOString() 
          : (knowledgeLean.startedAt ? String(knowledgeLean.startedAt) : undefined),
        completedAt: knowledgeLean.completedAt instanceof Date 
          ? knowledgeLean.completedAt.toISOString() 
          : (knowledgeLean.completedAt ? String(knowledgeLean.completedAt) : undefined),
        createdAt: knowledgeLean.createdAt instanceof Date 
          ? knowledgeLean.createdAt.toISOString() 
          : String(knowledgeLean.createdAt || new Date()),
        updatedAt: knowledgeLean.updatedAt instanceof Date 
          ? knowledgeLean.updatedAt.toISOString() 
          : String(knowledgeLean.updatedAt || new Date()),
        // Note: websiteCredentials are NOT included in response for security
        // They are only used internally when starting/resyncing exploration jobs
        hasAuthentication: !!knowledgeLean.websiteCredentials,
        // Include live job status if available
        jobStatus: jobStatus
          ? {
              status: jobStatus.status,
              progress: jobStatus.progress,
              started_at: jobStatus.started_at,
              updated_at: jobStatus.updated_at,
            }
          : null,
      },
    })
  } catch (error: unknown) {
    console.error("Website knowledge fetch error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to fetch website knowledge" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/website-knowledge/[id] - Update website knowledge configuration
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // Get tenant state and organization ID for access verification
  const tenantState = await getTenantState(session.user.id)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }
  
  // In normal mode, use user ID; in organization mode, use organization ID
  const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  const body = (await req.json()) as {
    name?: string
    description?: string
    maxPages?: number
    maxDepth?: number
    strategy?: "BFS" | "DFS"
    includePaths?: string[]
    excludePaths?: string[]
    websiteCredentials?: {
      username: string
      password: string
    } | null // null means remove credentials
  }

  try {
    await connectDB()

    const knowledge = await (WebsiteKnowledge as any).findById(id)

    if (!knowledge) {
      return NextResponse.json({ error: "Website knowledge not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Build update object
    const updateData: {
      name?: string
      description?: string
      maxPages?: number
      maxDepth?: number
      strategy?: "BFS" | "DFS"
      includePaths?: string[]
      excludePaths?: string[]
      websiteCredentials?: { username: string; password: string } | null
    } = {}

    if (body.name !== undefined) updateData.name = body.name || undefined
    if (body.description !== undefined) updateData.description = body.description || undefined
    if (body.maxPages !== undefined) updateData.maxPages = body.maxPages
    if (body.maxDepth !== undefined) updateData.maxDepth = body.maxDepth
    if (body.strategy !== undefined) updateData.strategy = body.strategy
    if (body.includePaths !== undefined) {
      updateData.includePaths = body.includePaths && body.includePaths.length > 0 ? body.includePaths : undefined
    }
    if (body.excludePaths !== undefined) {
      updateData.excludePaths = body.excludePaths && body.excludePaths.length > 0 ? body.excludePaths : undefined
    }
    if (body.websiteCredentials !== undefined) {
      if (body.websiteCredentials === null) {
        // Remove credentials
        updateData.websiteCredentials = null
      } else {
        // Update credentials (TODO: Encrypt before storage)
        updateData.websiteCredentials = {
          username: body.websiteCredentials.username,
          password: body.websiteCredentials.password,
        }
      }
    }

    const updatedKnowledge = await (WebsiteKnowledge as any).findByIdAndUpdate(
      id,
      updateData,
      { new: true, lean: true }
    )

    if (!updatedKnowledge) {
      return NextResponse.json({ error: "Failed to update knowledge" }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        id: updatedKnowledge._id.toString(),
        name: updatedKnowledge.name,
        description: updatedKnowledge.description,
        maxPages: updatedKnowledge.maxPages,
        maxDepth: updatedKnowledge.maxDepth,
        strategy: updatedKnowledge.strategy,
        includePaths: updatedKnowledge.includePaths,
        excludePaths: updatedKnowledge.excludePaths,
        hasAuthentication: !!updatedKnowledge.websiteCredentials,
        updatedAt: updatedKnowledge.updatedAt,
      },
    })
  } catch (error: unknown) {
    console.error("Website knowledge update error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update website knowledge" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/website-knowledge/[id] - Cancel exploration and delete website knowledge
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    await connectDB()

    const knowledge = await (WebsiteKnowledge as any).findById(id)

    if (!knowledge) {
      return NextResponse.json({ error: "Website knowledge not found" }, { status: 404 })
    }

    // Cancel exploration job if it's still running
    if (knowledge.explorationJobId && ["pending", "exploring"].includes(knowledge.status)) {
      try {
        console.log("[Website Knowledge] Cancelling job before deletion", {
          knowledgeId: id,
          jobId: knowledge.explorationJobId,
          websiteUrl: knowledge.websiteUrl,
        })
        
        // Wait for current page to complete before cancelling (graceful shutdown)
        await cancelJob(knowledge.explorationJobId, true)
        
        console.log("[Website Knowledge] Job cancelled successfully", {
          knowledgeId: id,
          jobId: knowledge.explorationJobId,
        })
      } catch (error: unknown) {
        console.error("[Website Knowledge] Failed to cancel job", {
          knowledgeId: id,
          jobId: knowledge.explorationJobId,
          error: error instanceof Error ? error.message : String(error),
        })
        Sentry.captureException(error, {
          tags: {
            operation: "cancel_job",
            knowledgeId: id,
            jobId: knowledge.explorationJobId,
          },
        })
        // Continue with deletion even if cancel fails
      }
    }

    // Delete the record
    await (WebsiteKnowledge as any).findByIdAndDelete(id)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Website knowledge deletion error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to delete website knowledge" },
      { status: 500 }
    )
  }
}
