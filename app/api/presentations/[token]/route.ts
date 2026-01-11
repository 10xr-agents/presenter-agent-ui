import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateLiveKitToken } from "@/lib/presentations/livekit"
import { getSessionByToken, updateSessionStatus } from "@/lib/presentations/session-manager"
import { authenticateViewer } from "@/lib/presentations/viewer-auth"
import { getScreenAgentById } from "@/lib/screen-agents/manager"

/**
 * GET /api/presentations/[token] - Get session details by token (public access)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  try {
    const session = await getSessionByToken(token)

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Get screen agent details
    const screenAgent = await getScreenAgentById(session.screenAgentId)
    if (!screenAgent) {
      return NextResponse.json(
        { error: "Screen agent not found" },
        { status: 404 }
      )
    }

    // Check if viewer authentication is required
    const viewerEmail = req.headers.get("x-viewer-email") || undefined
    const viewerName = req.headers.get("x-viewer-name") || undefined

    if (screenAgent.viewerAuthRequired && !viewerEmail) {
      return NextResponse.json(
        { error: "Viewer email is required for this session" },
        { status: 401 }
      )
    }

    // Authenticate viewer if email provided
    if (viewerEmail) {
      const authResult = await authenticateViewer(token, viewerEmail)
      if (!authResult.authenticated) {
        return NextResponse.json(
          { error: authResult.error || "Authentication failed" },
          { status: 401 }
        )
      }
    }

    // Generate LiveKit token for viewer
    const roomName = session.liveKitRoomId
    const liveKitToken = await generateLiveKitToken({
      roomName,
      participantName: viewerName || "Viewer",
      participantIdentity: viewerEmail || `viewer_${session._id.toString()}`,
      permissions: {
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
      },
    })

    return NextResponse.json({
      session: {
        id: session._id.toString(),
        screenAgentId: session.screenAgentId,
        completionStatus: session.completionStatus,
        viewerEmail: session.viewerInfo?.email,
        viewerName: session.viewerInfo?.name,
        startedAt: session.startedAt,
        durationSeconds: session.durationSeconds,
      },
      screenAgent: {
        id: screenAgent._id.toString(),
        name: screenAgent.name,
        description: screenAgent.description,
      },
      liveKit: {
        roomName,
        token: liveKitToken,
      },
    })
  } catch (error: unknown) {
    console.error("Get session by token error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to get session" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/presentations/[token] - Update session status
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const body = (await req.json()) as {
    status?: "pending" | "active" | "completed" | "ended" | "failed"
  }

  if (!body.status) {
    return NextResponse.json(
      { error: "status is required" },
      { status: 400 }
    )
  }

  try {
    const session = await getSessionByToken(token)

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    const updatedSession = await updateSessionStatus(
      session._id.toString(),
      body.status
    )

    return NextResponse.json({
      session: {
        id: updatedSession._id.toString(),
        completionStatus: updatedSession.completionStatus,
        startedAt: updatedSession.startedAt,
        endedAt: updatedSession.endedAt,
      },
    })
  } catch (error: unknown) {
    console.error("Update session status error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update session" },
      { status: 500 }
    )
  }
}
