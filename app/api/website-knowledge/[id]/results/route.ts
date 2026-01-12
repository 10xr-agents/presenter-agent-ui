import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { WebsiteKnowledge } from "@/lib/models/website-knowledge"
import { getJobResults } from "@/lib/browser-automation/client"

/**
 * GET /api/website-knowledge/[id]/results - Get exploration results
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

    if (!knowledge.explorationJobId) {
      return NextResponse.json(
        { error: "No exploration job associated with this knowledge" },
        { status: 400 }
      )
    }

    console.log("[Website Knowledge] Fetching job results", {
      knowledgeId: id,
      jobId: knowledge.explorationJobId,
      websiteUrl: knowledge.websiteUrl,
    })
    
    // Fetch results from Browser Automation Service
    const jobResults = await getJobResults(knowledge.explorationJobId, false)

    console.log("[Website Knowledge] Job results retrieved", {
      knowledgeId: id,
      jobId: knowledge.explorationJobId,
      status: jobResults.status,
      pagesStored: jobResults.results.pages_stored,
      linksStored: jobResults.results.links_stored,
      errorCount: jobResults.results.errors.length,
    })

    return NextResponse.json({
      data: {
        pages: jobResults.pages,
        links: jobResults.links,
        results: {
          ...jobResults.results,
          errors: jobResults.results.errors.map((err) => ({
            url: err.url,
            error: err.error,
            error_type: err.error_type,
            retry_count: err.retry_count,
            last_attempted_at: err.last_attempted_at,
          })),
        },
        website_metadata: jobResults.website_metadata,
      },
    })
  } catch (error: unknown) {
    console.error("Results fetch error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to fetch results" },
      { status: 500 }
    )
  }
}
