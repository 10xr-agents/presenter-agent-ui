import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getSessionUsage } from "@/lib/usage/metering"

/**
 * GET /api/usage/metering/session/[sessionId] - Get usage events for a specific session
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
    const events = await getSessionUsage(sessionId)

    return NextResponse.json({
      events: events.map((event) => ({
        id: event._id.toString(),
        eventType: event.eventType,
        quantity: event.quantity,
        unitCostCents: event.unitCostCents,
        totalCostCents: event.totalCostCents,
        eventTimestamp: event.eventTimestamp,
        createdAt: event.createdAt,
      })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching session usage:", error)
    return NextResponse.json(
      { error: message || "Failed to fetch session usage" },
      { status: 500 }
    )
  }
}
