import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeSource } from "@/lib/models/knowledge-source"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"
// Note: Pause functionality will be implemented when the knowledge extraction API supports it
// For now, this endpoint is a placeholder

/**
 * POST /api/knowledge/[id]/pause
 * Pause (Stop) a running knowledge extraction job
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
    const tenantState = await getTenantState(session.user.id)
    let organizationId: string | null = null
    if (tenantState === "organization") {
      organizationId = await getActiveOrganizationId()
    }
    
    // In normal mode, use user ID; in organization mode, use organization ID
    const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

    const knowledge = await (KnowledgeSource as any).findById(id).lean()

    if (!knowledge) {
      return NextResponse.json({ error: "Knowledge source not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Only allow pausing if job is running
    if (knowledge.status !== "running") {
      return NextResponse.json(
        { error: `Cannot pause job with status: ${knowledge.status}. Only running jobs can be paused.` },
        { status: 400 }
      )
    }

    if (!knowledge.jobId) {
      return NextResponse.json(
        { error: "No job ID found" },
        { status: 400 }
      )
    }

    console.log("[Knowledge] Pausing job", {
      knowledgeId: id,
      jobId: knowledge.jobId,
      currentStatus: knowledge.status,
    })

    try {
      // Attempt to pause the job via knowledge extraction API
      // Note: Pause functionality will be implemented when the API supports it
      // For now, return an error indicating it's not available
      return NextResponse.json(
        { error: "Pause functionality is not yet available in the knowledge extraction API" },
        { status: 501 }
      )
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

      console.error("[Knowledge] Failed to pause job", {
        knowledgeId: id,
        jobId: knowledge.jobId,
        error: errorMessage,
        statusCode: errorWithStatus.statusCode,
        isJobNotFound,
      })

      // If job doesn't exist or cannot be paused, mark as failed
      if (isJobNotFound) {
        console.warn("[Knowledge] Job not found or cannot be paused, marking as failed", {
          knowledgeId: id,
          jobId: knowledge.jobId,
          currentStatus: knowledge.status,
        })

        // Update knowledge record to failed state
        const docToUpdate = await (KnowledgeSource as any).findById(id)
        if (docToUpdate) {
          docToUpdate.status = "failed"
          
          // Update sync history
          const syncHistory = Array.isArray(docToUpdate.syncHistory) 
            ? docToUpdate.syncHistory.map((sync: unknown) => {
                const s = sync as { jobId?: unknown; status?: unknown; [key: string]: unknown }
                return {
                  jobId: String(s.jobId || ""),
                  workflowId: s.workflowId ? String(s.workflowId) : undefined,
                  status: String(s.status || "pending"),
                  triggerType: String(s.triggerType || "initial"),
                  startedAt: s.startedAt instanceof Date ? s.startedAt : (s.startedAt ? new Date(s.startedAt as string) : new Date()),
                  completedAt: s.completedAt instanceof Date ? s.completedAt : (s.completedAt ? new Date(s.completedAt as string) : undefined),
                  phase: s.phase ? String(s.phase) : undefined,
                  progress: typeof s.progress === "number" ? s.progress : undefined,
                  errorMessages: Array.isArray(s.errorMessages) ? s.errorMessages.map((e) => String(e)) : (Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : []), // Support both old 'errors' and new 'errorMessages' for backward compatibility
                  warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
                  pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
                  linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
                  errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
                }
              })
            : []
          
          const currentSyncIndex = syncHistory.findIndex(
            (sync: { jobId: string }) => sync.jobId === knowledge.jobId
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
        const updatedKnowledge = await (KnowledgeSource as any).findById(id).lean()

        // Serialize syncHistory for response
        const serializeSyncHistory = (syncHistory: unknown) => {
          if (!Array.isArray(syncHistory)) return []
          return syncHistory.map((sync: unknown) => {
            const s = sync as {
              _id?: unknown
              jobId?: unknown
              workflowId?: unknown
              status?: unknown
              triggerType?: unknown
              startedAt?: unknown
              completedAt?: unknown
              phase?: unknown
              progress?: unknown
              errorMessages?: unknown // Renamed from 'errors' to avoid Mongoose reserved pathname
            errors?: unknown // Keep for backward compatibility during migration
              warnings?: unknown
              pagesProcessed?: unknown
              linksProcessed?: unknown
              errorCount?: unknown
            }
            return {
              jobId: String(s.jobId || ""),
              workflowId: s.workflowId ? String(s.workflowId) : undefined,
              status: String(s.status || "pending"),
              triggerType: String(s.triggerType || "initial"),
              startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : (s.startedAt ? String(s.startedAt) : new Date().toISOString()),
              completedAt: s.completedAt instanceof Date ? s.completedAt.toISOString() : (s.completedAt ? String(s.completedAt) : undefined),
              phase: s.phase ? String(s.phase) : undefined,
              progress: typeof s.progress === "number" ? s.progress : undefined,
                errorMessages: Array.isArray(s.errorMessages) ? s.errorMessages.map((e) => String(e)) : (Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : []), // Support both old 'errors' and new 'errorMessages' for backward compatibility
              warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
              pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
              linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
              errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
            }
          })
        }

        Sentry.captureMessage("Knowledge job pause failed - job not found", {
          level: "warning",
          tags: {
            operation: "pause_job_failed",
            knowledgeId: id,
            jobId: knowledge.jobId,
          },
          extra: {
            sourceType: knowledge.sourceType,
            sourceUrl: knowledge.sourceUrl,
            sourceName: knowledge.sourceName,
            error: errorMessage,
          },
        })

        return NextResponse.json({
          data: {
            id: updatedKnowledge._id.toString(),
            sourceType: updatedKnowledge.sourceType,
            sourceUrl: updatedKnowledge.sourceUrl,
            sourceName: updatedKnowledge.sourceName,
            fileName: updatedKnowledge.fileName,
            status: "failed",
            jobId: updatedKnowledge.jobId,
            workflowId: updatedKnowledge.workflowId,
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
          jobId: knowledge.jobId,
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
