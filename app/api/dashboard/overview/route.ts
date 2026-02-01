import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { PresentationSession } from "@/lib/models/presentation-session"
import { ScreenAgent } from "@/lib/models/screen-agent"
import { getTenantOperatingMode } from "@/lib/utils/tenant-state"

/**
 * GET /api/dashboard/overview
 * 
 * Returns high-level, action-oriented metrics for the dashboard.
 * This is NOT analytics - it's a quick overview for decision-making.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get("organizationId")

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      )
    }

    await connectDB()

    // Determine if this is normal mode (userId) or organization mode
    const tenantState = await getTenantOperatingMode(session.user.id)
    const isNormalMode = tenantState === "normal"

    // Get agent counts
     
    const allAgents = isNormalMode
      ? await (ScreenAgent as any).find({ ownerId: organizationId })
      : await (ScreenAgent as any).find({ organizationId })

    const totalAgents = allAgents.length
    const activeAgents = allAgents.filter((a: any) => a.status === "active").length
    const processingAgents = allAgents.filter(
      (a: any) => a.status === "draft" || a.status === "paused"
    ).length

    // Get recent session counts (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentSessions = await (PresentationSession as any).find({
      startedAt: { $gte: sevenDaysAgo },
    })

    // Filter sessions by agent ownership/organization
    const agentIds = allAgents.map((a: any) => a._id.toString())
    const filteredRecentSessions = recentSessions.filter((s: any) =>
      agentIds.includes(s.screenAgentId?.toString())
    )

    // Get total session count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allSessions = await (PresentationSession as any).find({})
    const filteredAllSessions = allSessions.filter((s: any) =>
      agentIds.includes(s.screenAgentId?.toString())
    )

    return NextResponse.json({
      data: {
        totalAgents,
        activeAgents,
        totalSessions: filteredAllSessions.length,
        recentSessions: filteredRecentSessions.length,
        processingAgents,
      },
    })
  } catch (error: unknown) {
    console.error("Dashboard overview error:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch dashboard overview"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
