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

    // Find the existing knowledge record
    const knowledge = await (WebsiteKnowledge as any).findById(id)

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
        authentication: knowledge.websiteCredentials
          ? {
              username: knowledge.websiteCredentials.username,
              password: knowledge.websiteCredentials.password,
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

    // Initialize syncHistory if it doesn't exist
    const syncHistory = knowledge.syncHistory || []

    // Add new sync run to history
    const newSyncRun = {
      jobId: newExplorationJobId || "",
      status: newStatus,
      triggerType: "resync" as const,
      startedAt: new Date(),
      completedAt: undefined,
      pagesProcessed: undefined,
      linksProcessed: undefined,
      errorCount: undefined,
    }

    syncHistory.push(newSyncRun)

    // Update the existing knowledge record (don't create a new one)
    const updatedKnowledge = await (WebsiteKnowledge as any).findByIdAndUpdate(
      id,
      {
        explorationJobId: newExplorationJobId,
        status: newStatus,
        syncHistory,
        startedAt: newStatus !== "failed" ? new Date() : knowledge.startedAt,
        // Reset completion status and results for the new sync
        completedAt: undefined,
        pagesStored: undefined,
        linksStored: undefined,
        externalLinksDetected: undefined,
        explorationErrors: undefined,
      },
      { new: true }
    )

    console.log("[Website Knowledge] Resync completed", {
      knowledgeId: id,
      jobId: newExplorationJobId,
      status: newStatus,
      syncHistoryLength: syncHistory.length,
    })

    return NextResponse.json({
      data: {
        id: updatedKnowledge._id.toString(),
        websiteUrl: updatedKnowledge.websiteUrl,
        websiteDomain: updatedKnowledge.websiteDomain,
        status: updatedKnowledge.status,
        explorationJobId: updatedKnowledge.explorationJobId,
        syncHistory: updatedKnowledge.syncHistory,
        updatedAt: updatedKnowledge.updatedAt,
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
