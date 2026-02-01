import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { pauseJob } from "@/lib/browser-automation/client"
import { connectDB } from "@/lib/db/mongoose"
import { WebsiteKnowledge } from "@/lib/models/website-knowledge"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

/**
 * POST /api/website-knowledge/[id]/pause
 * Pause (Stop) a running knowledge exploration job
 */
export async function POST(
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

    // Get tenant state and organization ID
    const tenantState = await getTenantOperatingMode(session.user.id)
    let organizationId: string | null = null
    if (tenantState === "organization") {
      organizationId = await getActiveOrganizationId()
    }
    
    // In normal mode, use user ID; in organization mode, use organization ID
    const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

    const knowledge = await (WebsiteKnowledge as any).findById(id).lean()

    if (!knowledge) {
      return NextResponse.json({ error: "Website knowledge not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Only allow pausing if job is running (exploring)
    if (knowledge.status !== "exploring") {
      return NextResponse.json(
        { error: `Cannot pause job with status: ${knowledge.status}. Only running jobs can be paused.` },
        { status: 400 }
      )
    }

    if (!knowledge.explorationJobId) {
      return NextResponse.json(
        { error: "No exploration job ID found" },
        { status: 400 }
      )
    }

    console.log("[Website Knowledge] Pausing job", {
      knowledgeId: id,
      jobId: knowledge.explorationJobId,
      currentStatus: knowledge.status,
    })

    try {
      // Attempt to pause the job via browser automation service
      const pauseResponse = await pauseJob(knowledge.explorationJobId)

      console.log("[Website Knowledge] Job pause response", {
        knowledgeId: id,
        jobId: knowledge.explorationJobId,
        responseStatus: pauseResponse.status,
      })

      // Note: We don't update the knowledge status to "paused" because
      // the protocol uses "paused" as a job state, but our knowledge status
      // remains "exploring" until explicitly resumed or canceled
      // The job itself is paused in the browser automation service

      return NextResponse.json({
        data: {
          id: knowledge._id.toString(),
          websiteUrl: knowledge.websiteUrl,
          websiteDomain: knowledge.websiteDomain,
          status: knowledge.status, // Keep as "exploring" - pause is a job-level state
          explorationJobId: knowledge.explorationJobId,
          message: "Job paused successfully",
        },
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorWithStatus = error as Error & { statusCode?: number; isNotFound?: boolean }
      
      // Check if job doesn't exist or cannot be paused
      const isJobNotFound = errorWithStatus.isNotFound || 
                            errorWithStatus.statusCode === 404 ||
                            errorMessage.toLowerCase().includes("not found") || 
                            (errorMessage.toLowerCase().includes("job") && errorMessage.toLowerCase().includes("404")) ||
                            errorMessage.toLowerCase().includes("cannot pause") ||
                            errorMessage.toLowerCase().includes("cannot be paused")

      console.error("[Website Knowledge] Failed to pause job", {
        knowledgeId: id,
        jobId: knowledge.explorationJobId,
        error: errorMessage,
        statusCode: errorWithStatus.statusCode,
        isJobNotFound,
      })

      // If job doesn't exist or cannot be paused, mark as failed
      if (isJobNotFound) {
        console.warn("[Website Knowledge] Job not found or cannot be paused, marking as failed", {
          knowledgeId: id,
          jobId: knowledge.explorationJobId,
          currentStatus: knowledge.status,
        })

        // Update knowledge record to failed state
        const docToUpdate = await (WebsiteKnowledge as any).findById(id)
        if (docToUpdate) {
          docToUpdate.status = "failed"
          
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
              status: "failed",
              completedAt: new Date(),
              errorCount: (syncHistory[currentSyncIndex].errorCount || 0) + 1,
            }
          }
          
          docToUpdate.syncHistory = syncHistory
          await docToUpdate.save()
        }

        // Fetch fresh lean document for response
        const updatedKnowledge = await (WebsiteKnowledge as any).findById(id).lean()

        // Serialize syncHistory for response
        const serializeSyncHistory = (syncHistory: unknown) => {
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

        Sentry.captureMessage("Website knowledge job pause failed - job not found", {
          level: "warning",
          tags: {
            operation: "pause_job_failed",
            knowledgeId: id,
            jobId: knowledge.explorationJobId,
          },
          extra: {
            websiteUrl: knowledge.websiteUrl,
            websiteDomain: knowledge.websiteDomain,
            error: errorMessage,
          },
        })

        return NextResponse.json({
          data: {
            id: updatedKnowledge._id.toString(),
            websiteUrl: updatedKnowledge.websiteUrl,
            websiteDomain: updatedKnowledge.websiteDomain,
            status: "failed",
            explorationJobId: updatedKnowledge.explorationJobId,
            pagesStored: updatedKnowledge.pagesStored,
            linksStored: updatedKnowledge.linksStored,
            name: updatedKnowledge.name,
            description: updatedKnowledge.description,
            startedAt: updatedKnowledge.startedAt?.toISOString(),
            completedAt: updatedKnowledge.completedAt?.toISOString(),
            createdAt: updatedKnowledge.createdAt.toISOString(),
            updatedAt: updatedKnowledge.updatedAt.toISOString(),
            syncHistory: serializeSyncHistory(updatedKnowledge.syncHistory),
          },
          error: "Job not found or cannot be paused. Marked as failed.",
        }, { status: 200 })
      }

      // For other errors, return error response
      Sentry.captureException(error, {
        tags: {
          operation: "pause_job",
          knowledgeId: id,
          jobId: knowledge.explorationJobId,
        },
      })

      return NextResponse.json(
        { error: errorMessage || "Failed to pause job" },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    console.error("Pause knowledge job error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, {
      tags: {
        operation: "pause_knowledge_job",
        knowledgeId: id,
      },
    })
    return NextResponse.json(
      { error: errorMessage || "Failed to pause knowledge job" },
      { status: 500 }
    )
  }
}
