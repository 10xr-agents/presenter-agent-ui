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
          jobStatus: jobStatus.status,
          progress: jobStatus.progress ? {
            completed: jobStatus.progress.completed ?? 0,
            queued: jobStatus.progress.queued ?? 0,
            failed: jobStatus.progress.failed ?? 0,
          } : null,
        })
        
        // Update local status based on job status
        if (jobStatus.status === "completed" && knowledge.status !== "completed") {
          console.log("[Website Knowledge] Job completed, updating knowledge", {
            knowledgeId: id,
            jobId: knowledge.explorationJobId,
          })
          
          // Fetch results to update summary
          try {
            const results = await getJobResults(knowledge.explorationJobId, false)
            
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
        } else if (jobStatus.status === "running" && knowledge.status !== "exploring") {
          console.log("[Website Knowledge] Job running, updating to exploring", {
            knowledgeId: id,
            jobId: knowledge.explorationJobId,
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

    return NextResponse.json({
      data: {
        id: knowledge._id.toString(),
        websiteUrl: knowledge.websiteUrl,
        websiteDomain: knowledge.websiteDomain,
        status: knowledge.status,
        explorationJobId: knowledge.explorationJobId,
        syncHistory: serializeSyncHistory(knowledge.syncHistory),
        maxPages: knowledge.maxPages,
        maxDepth: knowledge.maxDepth,
        strategy: knowledge.strategy,
        includePaths: knowledge.includePaths,
        excludePaths: knowledge.excludePaths,
        pagesStored: knowledge.pagesStored,
        linksStored: knowledge.linksStored,
        externalLinksDetected: knowledge.externalLinksDetected,
        explorationErrors: knowledge.explorationErrors,
        name: knowledge.name,
        description: knowledge.description,
        tags: knowledge.tags,
        timesReferenced: knowledge.timesReferenced,
        lastReferencedAt: knowledge.lastReferencedAt,
        startedAt: knowledge.startedAt,
        completedAt: knowledge.completedAt,
        createdAt: knowledge.createdAt,
        updatedAt: knowledge.updatedAt,
        // Note: websiteCredentials are NOT included in response for security
        // They are only used internally when starting/resyncing exploration jobs
        hasAuthentication: !!knowledge.websiteCredentials,
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
