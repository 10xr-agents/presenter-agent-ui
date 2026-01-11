import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { SessionRecording } from "@/lib/models/session-recording"
import { getScreenAgentById, hasScreenAgentAccess } from "@/lib/screen-agents/manager"

/**
 * GET /api/analytics/insights/[sessionId] - Get insights for a presentation session
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { sessionId } = await params

  try {
    await connectDB()

    // Get recording for this session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recording = await (SessionRecording as any).findOne({
      presentationSessionId: sessionId,
    })

    if (!recording) {
      return NextResponse.json(
        { error: "Session recording not found" },
        { status: 404 }
      )
    }

    // Verify user has access to the screen agent
    const screenAgent = await getScreenAgentById(recording.screenAgentId)
    if (!screenAgent) {
      return NextResponse.json(
        { error: "Screen agent not found" },
        { status: 404 }
      )
    }

    const hasAccess = await hasScreenAgentAccess(
      recording.screenAgentId,
      session.user.id,
      recording.organizationId
    )

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    return NextResponse.json({
      recording: {
        id: recording._id.toString(),
        presentationSessionId: recording.presentationSessionId,
        screenAgentId: recording.screenAgentId,
        status: recording.status,
        analysisStatus: recording.analysisStatus,
        recordingUrl: recording.recordingUrl,
        recordingDurationSeconds: recording.recordingDurationSeconds,
        recordedAt: recording.recordedAt,
        processedAt: recording.processedAt,
      },
      insights: {
        clusteredQuestions: recording.clusteredQuestions || [],
        extractedTopics: recording.extractedTopics || [],
        insights: recording.insights || null,
      },
    })
  } catch (error: unknown) {
    console.error("Insights API error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to get insights" },
      { status: 500 }
    )
  }
}
