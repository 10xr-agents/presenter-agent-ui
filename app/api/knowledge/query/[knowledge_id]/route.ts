import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeSource } from "@/lib/models/knowledge-source"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

function getKnowledgeExtractionApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_KNOWLEDGE_EXTRACTION_API_URL ||
    process.env.KNOWLEDGE_EXTRACTION_API_URL ||
    "http://localhost:8000"
  )
}

/**
 * GET /api/knowledge/query/{knowledge_id} - Get all knowledge by knowledge_id
 * 
 * PRIMARY ENDPOINT - Retrieve all knowledge entities (screens, tasks, actions, transitions, 
 * business functions, workflows) associated with a knowledge_id.
 * 
 * Query Behavior:
 * - If `job_id` is provided: Returns knowledge for that specific job (historical view)
 * - If `job_id` is not provided: Returns latest knowledge (most recent job) for the knowledge_id
 * 
 * This endpoint proxies to the Knowledge Extraction Service API:
 * GET /api/knowledge/query/{knowledge_id}?job_id={job_id}
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ knowledge_id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { knowledge_id } = await params
  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get("job_id")

  try {
    await connectDB()

    // Get tenant state and organization ID
    const tenantState = await getTenantState(session.user.id)
    let organizationId: string | null = null
    if (tenantState === "organization") {
      organizationId = await getActiveOrganizationId()
    }

    // In normal mode, use user ID; in organization mode, use organization ID
    const knowledgeOrgId =
      tenantState === "normal"
        ? session.user.id
        : organizationId || session.user.id

    // Verify the knowledge source exists and belongs to the user's organization
    const knowledge = await (KnowledgeSource as any).findById(knowledge_id).lean()

    if (!knowledge) {
      return NextResponse.json({ error: "Knowledge source not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Proxy request to Knowledge Extraction Service
    const apiBaseUrl = getKnowledgeExtractionApiUrl()
    const queryParams = jobId ? `?job_id=${encodeURIComponent(jobId)}` : ""
    const apiUrl = `${apiBaseUrl}/api/knowledge/query/${knowledge_id}${queryParams}`

    console.log("[Knowledge Query] Proxying request to Knowledge Extraction Service", {
      knowledgeId: knowledge_id,
      jobId: jobId || "latest",
      apiUrl,
    })

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      // If job not found, return 404
      if (response.status === 404) {
        return NextResponse.json(
          { error: jobId ? "Job not found" : "Knowledge not found" },
          { status: 404 }
        )
      }

      // For other errors, try to get error message from response
      let errorMessage = "Failed to query knowledge"
      try {
        const errorData = (await response.json()) as { error?: string; detail?: string }
        errorMessage = errorData.error || errorData.detail || errorMessage
      } catch {
        // If response is not JSON, use status text
        errorMessage = response.statusText || errorMessage
      }

      console.error("[Knowledge Query] Knowledge Extraction Service error", {
        knowledgeId: knowledge_id,
        jobId,
        status: response.status,
        error: errorMessage,
      })

      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

    const knowledgeData = (await response.json()) as {
      knowledge_id: string
      job_id: string
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

    console.log("[Knowledge Query] Successfully retrieved knowledge", {
      knowledgeId: knowledge_id,
      jobId: knowledgeData.job_id,
      statistics: knowledgeData.statistics,
    })

    return NextResponse.json({
      data: knowledgeData,
    })
  } catch (error: unknown) {
    console.error("[Knowledge Query] Error querying knowledge", {
      knowledgeId: knowledge_id,
      jobId,
      error: error instanceof Error ? error.message : String(error),
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, {
      tags: {
        operation: "query_knowledge",
        knowledgeId: knowledge_id,
        jobId: jobId || "latest",
      },
    })

    return NextResponse.json(
      { error: errorMessage || "Failed to query knowledge" },
      { status: 500 }
    )
  }
}