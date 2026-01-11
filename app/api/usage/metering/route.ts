import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { aggregateUsageMetrics, type UsageEventType } from "@/lib/usage/metering"

/**
 * GET /api/usage/metering - Get aggregated usage metrics
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId")
  const eventType = searchParams.get("eventType") as UsageEventType | null
  const startDate = searchParams.get("startDate")
    ? new Date(searchParams.get("startDate")!)
    : undefined
  const endDate = searchParams.get("endDate")
    ? new Date(searchParams.get("endDate")!)
    : undefined

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 }
    )
  }

  try {
    const metrics = await aggregateUsageMetrics(
      organizationId,
      startDate,
      endDate,
      eventType || undefined
    )

    return NextResponse.json({
      totalQuantity: metrics.totalQuantity,
      totalCost: metrics.totalCost,
      eventCount: metrics.eventCount,
      startDate: metrics.startDate.toISOString(),
      endDate: metrics.endDate.toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching usage metrics:", error)
    return NextResponse.json(
      { error: message || "Failed to fetch usage metrics" },
      { status: 500 }
    )
  }
}
