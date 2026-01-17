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

    console.log("[Website Knowledge] PIPELINE STEP: Fetching job results via API endpoint", {
      knowledgeId: id,
      jobId: knowledge.explorationJobId,
      websiteUrl: knowledge.websiteUrl,
      stage: "api_results_fetch",
    })
    
    // Fetch results from Browser Automation Service
    // Validation is already done in getJobResults, but we log the trace here
    const jobResults = await getJobResults(knowledge.explorationJobId, false)

    console.log("[Website Knowledge] PIPELINE STEP: Job results retrieved and validated", {
      knowledgeId: id,
      jobId: knowledge.explorationJobId,
      status: jobResults.status,
      pagesStored: jobResults.results.pages_stored,
      linksStored: jobResults.results.links_stored,
      externalLinksDetected: jobResults.results.external_links_detected,
      errorCount: jobResults.results.errors.length,
      hasPagesArray: !!jobResults.pages,
      hasLinksArray: !!jobResults.links,
      pagesArrayLength: jobResults.pages?.length ?? 0,
      linksArrayLength: jobResults.links?.length ?? 0,
      stage: "api_results_ready",
    })
    
    // Log detailed page content summary if available
    if (jobResults.pages && jobResults.pages.length > 0) {
      const pagesWithContent = jobResults.pages.filter((p) => p.content && p.content.length > 0).length
      const pagesWithTitle = jobResults.pages.filter((p) => p.title && p.title.length > 0).length
      const avgContentLength = jobResults.pages
        .filter((p) => p.content && typeof p.content === "string")
        .reduce((sum, p) => sum + (p.content as string).length, 0) / pagesWithContent || 0
      
      console.log("[Website Knowledge] PIPELINE STEP: Page content analysis", {
        knowledgeId: id,
        jobId: knowledge.explorationJobId,
        totalPages: jobResults.pages.length,
        pagesWithContent,
        pagesWithTitle,
        avgContentLength: Math.round(avgContentLength),
        stage: "content_analysis",
      })
    }

    // Run validation to get confidence and issues
    let validationInfo: {
      confidence?: "high" | "medium" | "low" | "none"
      issues?: string[]
      hasUsableContent?: boolean
    } = {}
    
    try {
      const { validateJobResults } = await import("@/lib/browser-automation/validation")
      const validation = validateJobResults(jobResults, knowledge.explorationJobId)
      validationInfo = {
        confidence: validation.confidence,
        issues: validation.issues,
        hasUsableContent: validation.hasUsableContent,
      }
    } catch (validationError: unknown) {
      // Validation failed - this is expected for invalid results
      // We'll still return the results but mark confidence as "none"
      validationInfo = {
        confidence: "none",
        issues: [validationError instanceof Error ? validationError.message : String(validationError)],
        hasUsableContent: false,
      }
    }

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
        validation: validationInfo,
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
