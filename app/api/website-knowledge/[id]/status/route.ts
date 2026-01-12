import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getJobStatus, pauseJob, resumeJob } from "@/lib/browser-automation/client"
import { connectDB } from "@/lib/db/mongoose"
import { WebsiteKnowledge } from "@/lib/models/website-knowledge"

/**
 * GET /api/website-knowledge/[id]/status - Get real-time job status
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

    console.log("[Website Knowledge] Fetching status via endpoint", {
      knowledgeId: id,
      jobId: knowledge.explorationJobId,
    })
    
    const jobStatus = await getJobStatus(knowledge.explorationJobId)

    // Ensure progress exists with defaults
    const progress = jobStatus.progress || {
      completed: 0,
      queued: 0,
      failed: 0,
      current_url: null,
    }

    console.log("[Website Knowledge] Status retrieved via endpoint", {
      knowledgeId: id,
      jobId: knowledge.explorationJobId,
      status: jobStatus.status,
      progress: {
        completed: progress.completed ?? 0,
        queued: progress.queued ?? 0,
        failed: progress.failed ?? 0,
      },
    })

    return NextResponse.json({
      data: {
        job_id: jobStatus.job_id,
        status: jobStatus.status,
        progress: {
          completed: progress.completed ?? 0,
          queued: progress.queued ?? 0,
          failed: progress.failed ?? 0,
          current_url: progress.current_url ?? null,
          estimated_time_remaining: progress.estimated_time_remaining,
          processing_rate: progress.processing_rate,
          recent_pages: progress.recent_pages,
        },
        started_at: jobStatus.started_at,
        updated_at: jobStatus.updated_at,
      },
    })
  } catch (error: unknown) {
    console.error("Status fetch error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to fetch status" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/website-knowledge/[id]/status - Control job (pause/resume)
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
  const body = (await req.json()) as { action: "pause" | "resume" }
  const { action } = body

  if (!["pause", "resume"].includes(action)) {
    return NextResponse.json({ error: "Invalid action. Use 'pause' or 'resume'" }, { status: 400 })
  }

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

    if (action === "pause") {
      await pauseJob(knowledge.explorationJobId)
    } else {
      await resumeJob(knowledge.explorationJobId)
    }

    return NextResponse.json({ success: true, action })
  } catch (error: unknown) {
    console.error("Job control error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to control job" },
      { status: 500 }
    )
  }
}
