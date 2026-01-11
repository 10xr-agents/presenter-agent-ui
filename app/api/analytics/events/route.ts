import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import {
  type AnalyticsEventType,
  trackEngagementScore,
  trackEvent,
  trackPageNavigation,
  trackQuestion,
  trackSessionCompletion,
  trackSessionEnd,
  trackSessionStart,
} from "@/lib/analytics/tracker"
import { auth } from "@/lib/auth"

/**
 * POST /api/analytics/events - Track an analytics event
 */
export async function POST(req: NextRequest) {
  // Optional auth - allow public tracking for presentation sessions
  const session = await auth.api.getSession({ headers: await headers() })

  const body = (await req.json()) as {
    sessionId?: string
    screenAgentId?: string
    organizationId?: string
    eventType?: AnalyticsEventType
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventData?: Record<string, any>
    viewerEmail?: string
  }

  const {
    sessionId,
    screenAgentId,
    organizationId,
    eventType,
    eventData,
    viewerEmail,
  } = body

  if (!sessionId || !screenAgentId || !organizationId || !eventType) {
    return NextResponse.json(
      { error: "sessionId, screenAgentId, organizationId, and eventType are required" },
      { status: 400 }
    )
  }

  try {
    const event = await trackEvent({
      sessionId,
      screenAgentId,
      organizationId,
      eventType,
      eventData,
      userId: session?.user.id,
      viewerEmail,
    })

    return NextResponse.json(
      {
        event: {
          id: event._id.toString(),
          eventType: event.eventType,
          eventTimestamp: event.eventTimestamp,
        },
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Track event error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to track event" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/analytics/events - List analytics events
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId")
  const screenAgentId = searchParams.get("screenAgentId")
  const organizationId = searchParams.get("organizationId")
  const eventType = searchParams.get("eventType")
  const limit = parseInt(searchParams.get("limit") || "100", 10)
  const offset = parseInt(searchParams.get("offset") || "0", 10)

  try {
    const { connectDB } = await import("@/lib/db/mongoose")
    const { AnalyticsEvent } = await import("@/lib/models/analytics-event")
    await connectDB()

    const query: {
      presentationSessionId?: string
      screenAgentId?: string
      organizationId?: string
      eventType?: string
    } = {}

    if (sessionId) query.presentationSessionId = sessionId
    if (screenAgentId) query.screenAgentId = screenAgentId
    if (organizationId) query.organizationId = organizationId
    if (eventType) query.eventType = eventType

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = await (AnalyticsEvent as any)
      .find(query)
      .sort({ eventTimestamp: -1 })
      .limit(limit)
      .skip(offset)

    return NextResponse.json({
      events: events.map((e: any) => ({
        id: e._id.toString(),
        presentationSessionId: e.presentationSessionId,
        screenAgentId: e.screenAgentId,
        organizationId: e.organizationId,
        eventType: e.eventType,
        properties: e.properties,
        eventTimestamp: e.eventTimestamp,
      })),
    })
  } catch (error: unknown) {
    console.error("List events error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to list events" },
      { status: 500 }
    )
  }
}

/**
 * Convenience endpoints for specific event types
 */
export async function PUT(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    action?: string
    sessionId?: string
    screenAgentId?: string
    organizationId?: string
    question?: string
    pageUrl?: string
    pageTitle?: string
    durationMinutes?: number
    completionRate?: number
    score?: number
    viewerEmail?: string
  }

  const {
    action,
    sessionId,
    screenAgentId,
    organizationId,
    question,
    pageUrl,
    pageTitle,
    durationMinutes,
    completionRate,
    score,
    viewerEmail,
  } = body

  if (!sessionId || !screenAgentId || !organizationId || !action) {
    return NextResponse.json(
      { error: "sessionId, screenAgentId, organizationId, and action are required" },
      { status: 400 }
    )
  }

  try {
    let event

    switch (action) {
      case "question":
        if (!question) {
          return NextResponse.json(
            { error: "question is required for question action" },
            { status: 400 }
          )
        }
        event = await trackQuestion(
          sessionId,
          screenAgentId,
          organizationId,
          question,
          viewerEmail
        )
        break

      case "page_navigation":
        if (!pageUrl) {
          return NextResponse.json(
            { error: "pageUrl is required for page_navigation action" },
            { status: 400 }
          )
        }
        event = await trackPageNavigation(
          sessionId,
          screenAgentId,
          organizationId,
          pageUrl,
          pageTitle,
          viewerEmail
        )
        break

      case "session_start":
        event = await trackSessionStart(
          sessionId,
          screenAgentId,
          organizationId,
          viewerEmail
        )
        break

      case "session_end":
        event = await trackSessionEnd(
          sessionId,
          screenAgentId,
          organizationId,
          durationMinutes,
          viewerEmail
        )
        break

      case "session_complete":
        event = await trackSessionCompletion(
          sessionId,
          screenAgentId,
          organizationId,
          completionRate,
          viewerEmail
        )
        break

      case "engagement_score":
        if (score === undefined) {
          return NextResponse.json(
            { error: "score is required for engagement_score action" },
            { status: 400 }
          )
        }
        event = await trackEngagementScore(
          sessionId,
          screenAgentId,
          organizationId,
          score,
          viewerEmail
        )
        break

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      event: {
        id: event._id.toString(),
        eventType: event.eventType,
        eventTimestamp: event.eventTimestamp,
      },
    })
  } catch (error: unknown) {
    console.error("Track event error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to track event" },
      { status: 500 }
    )
  }
}
