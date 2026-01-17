import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { startExploration } from "@/lib/browser-automation/client"
import { connectDB } from "@/lib/db/mongoose"
import { WebsiteKnowledge } from "@/lib/models/website-knowledge"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

/**
 * POST /api/website-knowledge/[id]/resync - Re-sync an existing website knowledge
 * This updates the existing Knowledge record with a new exploration job, rather than creating a new record.
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

    // Get tenant state and organization ID for access verification
    const tenantState = await getTenantState(session.user.id)
    let organizationId: string | null = null
    if (tenantState === "organization") {
      organizationId = await getActiveOrganizationId()
    }
    
    // In normal mode, use user ID; in organization mode, use organization ID
    const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

    // Find the existing knowledge record (use lean for serialization safety)
    const knowledge = await (WebsiteKnowledge as any).findById(id).lean()

    if (!knowledge) {
      return NextResponse.json({ error: "Website knowledge not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Don't allow resync if there's already an active exploration
    if (["pending", "exploring"].includes(knowledge.status)) {
      return NextResponse.json(
        { error: "Cannot resync while an exploration is already in progress" },
        { status: 400 }
      )
    }

    console.log("[Website Knowledge] Starting resync", {
      knowledgeId: id,
      websiteUrl: knowledge.websiteUrl,
      organizationId: knowledge.organizationId,
      currentStatus: knowledge.status,
    })

    // Start new exploration job with existing configuration
    let newExplorationJobId: string | null = null
    let newStatus: "pending" | "exploring" | "failed" = "pending"

    try {
      console.log("[Website Knowledge] Calling browser automation service for resync", {
        websiteUrl: knowledge.websiteUrl,
        maxPages: knowledge.maxPages || 100,
        maxDepth: knowledge.maxDepth || 10,
        strategy: knowledge.strategy || "BFS",
        includePaths: knowledge.includePaths,
        excludePaths: knowledge.excludePaths,
      })

      const explorationResponse = await startExploration({
        start_url: knowledge.websiteUrl,
        max_pages: knowledge.maxPages || 100,
        max_depth: knowledge.maxDepth || 10,
        strategy: knowledge.strategy || "BFS",
        include_paths: knowledge.includePaths && knowledge.includePaths.length > 0 ? knowledge.includePaths : undefined,
        exclude_paths: knowledge.excludePaths && knowledge.excludePaths.length > 0 ? knowledge.excludePaths : undefined,
        authentication: knowledge.websiteCredentials &&
          knowledge.websiteCredentials.username &&
          knowledge.websiteCredentials.password
          ? {
              username: String(knowledge.websiteCredentials.username),
              password: String(knowledge.websiteCredentials.password),
            }
          : undefined,
      })
      newExplorationJobId = explorationResponse.job_id
      newStatus = explorationResponse.status === "queued" ? "pending" : "exploring"

      console.log("[Website Knowledge] Resync exploration job started", {
        knowledgeId: id,
        jobId: newExplorationJobId,
        status: explorationResponse.status,
        websiteUrl: knowledge.websiteUrl,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("[Website Knowledge] Failed to start resync exploration job", {
        knowledgeId: id,
        websiteUrl: knowledge.websiteUrl,
        error: errorMessage,
      })
      Sentry.captureException(error, {
        tags: {
          operation: "resync_exploration",
          knowledgeId: id,
          websiteUrl: knowledge.websiteUrl,
        },
      })
      newStatus = "failed"
    }

    // Update the existing knowledge record (don't create a new one)
    // Need to fetch non-lean document for update
    const docToUpdate = await (WebsiteKnowledge as any).findById(id)
    if (!docToUpdate) {
      return NextResponse.json({ error: "Website knowledge not found" }, { status: 404 })
    }

    // Get existing syncHistory from the Mongoose document (not from lean query)
    // This ensures we have properly formatted Mongoose subdocuments
    // Filter out invalid entries and ensure all required fields are present
    const existingSyncHistory = Array.isArray(docToUpdate.syncHistory) 
      ? docToUpdate.syncHistory
          .map((sync: unknown) => {
            const s = sync as {
              jobId?: unknown
              status?: unknown
              triggerType?: unknown
              startedAt?: unknown
              completedAt?: unknown
              pagesProcessed?: unknown
              linksProcessed?: unknown
              errorCount?: unknown
            }
            // Extract values - handle both Mongoose subdocuments and plain objects
            const jobId = s.jobId ? String(s.jobId) : ""
            const status = s.status ? String(s.status) : "pending"
            const triggerType = s.triggerType ? String(s.triggerType) : "initial"
            const startedAt = s.startedAt instanceof Date 
              ? s.startedAt 
              : (s.startedAt ? new Date(s.startedAt as string) : new Date())
            
            // Return a plain object with all required fields
            return {
              jobId,
              status,
              triggerType,
              startedAt,
              completedAt: s.completedAt instanceof Date 
                ? s.completedAt 
                : (s.completedAt ? new Date(s.completedAt as string) : undefined),
              pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
              linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
              errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
            }
          })
          .filter((sync: { jobId: string; status: string; triggerType: string; startedAt: Date }) => {
            // Filter out entries missing required fields
            return sync.jobId && sync.status && sync.triggerType && sync.startedAt
          })
      : []

    // Add new sync run to history
    const newSyncRun = {
      jobId: newExplorationJobId || "",
      status: newStatus,
      triggerType: "resync" as const,
      startedAt: new Date(),
      completedAt: undefined as Date | undefined,
      pagesProcessed: undefined as number | undefined,
      linksProcessed: undefined as number | undefined,
      errorCount: undefined as number | undefined,
    }

    existingSyncHistory.push(newSyncRun)

    docToUpdate.explorationJobId = newExplorationJobId
    docToUpdate.status = newStatus
    docToUpdate.syncHistory = existingSyncHistory
    if (newStatus !== "failed") {
      docToUpdate.startedAt = new Date()
    }
    // Reset completion status and results for the new sync
    docToUpdate.completedAt = undefined
    docToUpdate.pagesStored = undefined
    docToUpdate.linksStored = undefined
    docToUpdate.externalLinksDetected = undefined
    docToUpdate.explorationErrors = undefined
    
    await docToUpdate.save()

    // Fetch lean document for response
    const updatedKnowledge = await (WebsiteKnowledge as any).findById(id).lean()

    console.log("[Website Knowledge] Resync completed", {
      knowledgeId: id,
      jobId: newExplorationJobId,
      status: newStatus,
      syncHistoryLength: existingSyncHistory.length,
    })

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

    return NextResponse.json({
      data: {
        id: updatedKnowledge._id.toString(),
        websiteUrl: String(updatedKnowledge.websiteUrl || ""),
        websiteDomain: String(updatedKnowledge.websiteDomain || ""),
        status: String(updatedKnowledge.status || "pending"),
        explorationJobId: updatedKnowledge.explorationJobId ? String(updatedKnowledge.explorationJobId) : null,
        syncHistory: serializeSyncHistory(updatedKnowledge.syncHistory),
        updatedAt: updatedKnowledge.updatedAt instanceof Date 
          ? updatedKnowledge.updatedAt.toISOString() 
          : String(updatedKnowledge.updatedAt || new Date()),
      },
    })
  } catch (error: unknown) {
    console.error("[Website Knowledge] Resync error", {
      knowledgeId: id,
      error: error instanceof Error ? error.message : String(error),
    })
    Sentry.captureException(error, {
      tags: {
        operation: "resync_website_knowledge",
        knowledgeId: id,
      },
    })
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to resync website knowledge" },
      { status: 500 }
    )
  }
}
