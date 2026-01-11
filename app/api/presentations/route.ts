import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createLiveKitRoom, generateLiveKitToken } from "@/lib/presentations/livekit"
import { createPresentationSession } from "@/lib/presentations/session-manager"
import { getScreenAgentById } from "@/lib/screen-agents/manager"

/**
 * POST /api/presentations - Create a new presentation session
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    screenAgentId?: string
    viewerEmail?: string
    viewerName?: string
    organizationId?: string
  }

  const { screenAgentId, viewerEmail, viewerName, organizationId } = body

  if (!screenAgentId) {
    return NextResponse.json(
      { error: "screenAgentId is required" },
      { status: 400 }
    )
  }

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 }
    )
  }

  try {
    // Verify screen agent exists and user has access
    const screenAgent = await getScreenAgentById(screenAgentId)
    if (!screenAgent) {
      return NextResponse.json(
        { error: "Screen agent not found" },
        { status: 404 }
      )
    }

    // Create presentation session
    const presentationSession = await createPresentationSession({
      screenAgentId,
      viewerEmail,
      viewerName,
      organizationId,
    })

    // Room is already created in createPresentationSession
    const roomName = presentationSession.liveKitRoomId

    // Generate LiveKit token for the viewer
    const liveKitToken = await generateLiveKitToken({
      roomName: roomName,
      participantName: viewerName || "Viewer",
      participantIdentity: viewerEmail || `viewer_${presentationSession._id.toString()}`,
      permissions: {
        canPublish: false, // Viewers typically can't publish
        canSubscribe: true,
        canPublishData: false,
      },
    })

    // Generate LiveKit token for the agent (screen share)
    const agentToken = await generateLiveKitToken({
      roomName: roomName,
      participantName: screenAgent.name,
      participantIdentity: `agent_${screenAgentId}`,
      permissions: {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    })

    return NextResponse.json(
      {
        session: {
          id: presentationSession._id.toString(),
          sessionToken: presentationSession.sessionToken,
          completionStatus: presentationSession.completionStatus,
          createdAt: presentationSession.createdAt,
        },
        liveKit: {
          roomName: roomName,
          viewerToken: liveKitToken,
          agentToken: agentToken,
        },
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Create presentation session error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to create presentation session" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/presentations - List presentation sessions
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const screenAgentId = searchParams.get("screenAgentId")
  const status = searchParams.get("status")
  const limit = parseInt(searchParams.get("limit") || "50", 10)
  const offset = parseInt(searchParams.get("offset") || "0", 10)

  if (!screenAgentId) {
    return NextResponse.json(
      { error: "screenAgentId is required" },
      { status: 400 }
    )
  }

  try {
    const { listSessions } = await import("@/lib/presentations/session-manager")
    const sessions = await listSessions(screenAgentId, {
      status: status as "pending" | "active" | "completed" | "ended" | "failed" | undefined,
      limit,
      offset,
    })

    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s._id.toString(),
        screenAgentId: s.screenAgentId,
        sessionToken: s.sessionToken,
        viewerEmail: s.viewerInfo?.email,
        viewerName: s.viewerInfo?.name,
        completionStatus: s.completionStatus,
        durationSeconds: s.durationSeconds,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        createdAt: s.createdAt,
      })),
    })
  } catch (error: unknown) {
    console.error("List sessions error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to list sessions" },
      { status: 500 }
    )
  }
}
