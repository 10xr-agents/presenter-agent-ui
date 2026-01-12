import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { cancelJob, getJobResults, getJobStatus } from "@/lib/browser-automation/client"
import { connectDB } from "@/lib/db/mongoose"
import { type IWebsiteKnowledge, WebsiteKnowledge } from "@/lib/models/website-knowledge"

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

    const knowledge = await (WebsiteKnowledge as any).findById(id)

    if (!knowledge) {
      return NextResponse.json({ error: "Website knowledge not found" }, { status: 404 })
    }

    // Fetch latest job status if exploration is in progress
    let jobStatus = null
    if (knowledge.explorationJobId && ["pending", "exploring"].includes(knowledge.status)) {
      try {
        jobStatus = await getJobStatus(knowledge.explorationJobId)
        
        // Update local status based on job status
        if (jobStatus.status === "completed" && knowledge.status !== "completed") {
          // Fetch results to update summary
          try {
            const results = await getJobResults(knowledge.explorationJobId, false)
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
          } catch (error: unknown) {
            console.error("Failed to fetch job results:", error)
          }
        } else if (jobStatus.status === "failed" && knowledge.status !== "failed") {
          await (WebsiteKnowledge as any).findByIdAndUpdate(id, {
            status: "failed",
          })
          knowledge.status = "failed"
        } else if (jobStatus.status === "running" && knowledge.status !== "exploring") {
          await (WebsiteKnowledge as any).findByIdAndUpdate(id, {
            status: "exploring",
          })
          knowledge.status = "exploring"
        }
      } catch (error: unknown) {
        console.error("Failed to fetch job status:", error)
      }
    }

    return NextResponse.json({
      data: {
        id: knowledge._id.toString(),
        websiteUrl: knowledge.websiteUrl,
        websiteDomain: knowledge.websiteDomain,
        status: knowledge.status,
        explorationJobId: knowledge.explorationJobId,
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
        // Wait for current page to complete before cancelling (graceful shutdown)
        await cancelJob(knowledge.explorationJobId, true)
      } catch (error: unknown) {
        console.error("Failed to cancel job:", error)
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
