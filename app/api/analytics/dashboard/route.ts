import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { aggregateOrganizationAnalytics } from "@/lib/analytics/aggregator"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { PresentationSession } from "@/lib/models/presentation-session"
import { ScreenAgent } from "@/lib/models/screen-agent"

/**
 * GET /api/analytics/dashboard - Get organization-level dashboard metrics
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId")
  const days = parseInt(searchParams.get("days") || "30", 10)

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required" },
      { status: 400 }
    )
  }

  try {
    await connectDB()

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Determine if this is normal mode (userId) or organization mode
    // In normal mode, organizationId is actually the userId
    // Check if this looks like a user ID (no organization exists with this ID)
    // For now, we'll check if screen agents exist with ownerId matching this
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentsByOrg = await (ScreenAgent as any).find({ organizationId }).limit(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentsByOwner = await (ScreenAgent as any).find({ ownerId: organizationId }).limit(1)

    const isNormalMode = agentsByOwner.length > 0 && agentsByOrg.length === 0

    // Get analytics aggregation
    let analytics
    if (isNormalMode) {
      // For normal mode, aggregate by ownerId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const personalSessions = await (PresentationSession as any).find({
        startedAt: { $gte: startDate, $lte: endDate },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const personalAgents = await (ScreenAgent as any).find({ ownerId: organizationId })
      const personalAgentIds = personalAgents.map((a: any) => a._id.toString())
      const filteredSessions = personalSessions.filter((s: any) =>
        personalAgentIds.includes(s.screenAgentId?.toString())
      )

      // Calculate basic metrics for normal mode
      const totalSessions = filteredSessions.length
      const completedSessions = filteredSessions.filter((s: any) => s.completionStatus === "completed").length
      const totalDuration = filteredSessions.reduce((sum: number, s: any) => sum + (s.durationSeconds || 0), 0)

      analytics = {
        totalSessions,
        completionRate: totalSessions > 0 ? completedSessions / totalSessions : 0,
        averageSessionDuration: totalSessions > 0 ? totalDuration / totalSessions / 60 : 0, // in minutes
        averageEngagementScore: 0, // TODO: Calculate from engagement metrics
        totalQuestions: 0, // TODO: Calculate from events
        totalPageNavigations: 0, // TODO: Calculate from events
        topQuestions: [],
        eventBreakdown: {},
      }
    } else {
      // Organization mode - use existing aggregation
      analytics = await aggregateOrganizationAnalytics(
        organizationId,
        startDate,
        endDate
      )
    }

    // Get screen agent metrics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screenAgents = isNormalMode
      ? await (ScreenAgent as any).find({ ownerId: organizationId })
      : await (ScreenAgent as any).find({ organizationId })

    // Calculate total costs (minutes * rate - placeholder)
    // TODO: Calculate actual costs from usage events
    const costPerMinute = 0.1 // Placeholder rate
    const totalCosts = analytics.averageSessionDuration * analytics.totalSessions * costPerMinute

    // Get total minutes consumed (from sessions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions = await (PresentationSession as any).find({
      screenAgentId: { $in: screenAgents.map((a: any) => a._id.toString()) },
      startedAt: { $gte: startDate, $lte: endDate },
    })

    const totalMinutes = sessions.reduce((sum: number, s: any) => {
      const minutes = s.durationSeconds ? Math.ceil(s.durationSeconds / 60) : 0
      return sum + minutes
    }, 0)

    // Get top agents by session count
    const agentSessionCounts = new Map<string, number>()
    for (const session of sessions) {
      const agentId = session.screenAgentId.toString()
      agentSessionCounts.set(agentId, (agentSessionCounts.get(agentId) || 0) + 1)
    }

    const topAgents = screenAgents
      .map((agent: any) => ({
        id: agent._id.toString(),
        name: agent.name,
        sessionCount: agentSessionCounts.get(agent._id.toString()) || 0,
        minutesConsumed: sessions
          .filter((s: any) => s.screenAgentId.toString() === agent._id.toString())
          .reduce((sum: number, s: any) => {
            const minutes = s.durationSeconds ? Math.ceil(s.durationSeconds / 60) : 0
            return sum + minutes
          }, 0),
      }))
      .sort((a: { sessionCount: number }, b: { sessionCount: number }) => b.sessionCount - a.sessionCount)
      .slice(0, 10)

    // Get recent activity (recent sessions)
    const recentSessions = sessions
      .sort((a: any, b: any) => {
        const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0
        const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 10)
      .map((s: any) => ({
        id: s._id.toString(),
        screenAgentId: s.screenAgentId,
        screenAgentName: screenAgents.find(
          (a: any) => a._id.toString() === s.screenAgentId
        )?.name || "Unknown",
        viewerEmail: s.viewerInfo?.email,
        viewerName: s.viewerInfo?.name,
        status: s.completionStatus,
        durationSeconds: s.durationSeconds,
        startedAt: s.startedAt,
      }))

    return NextResponse.json({
      metrics: {
        totalAgents: screenAgents.length,
        totalCosts: Math.round(totalCosts * 100) / 100,
        totalMinutes: totalMinutes,
        totalViewers: analytics.totalSessions,
        averageSessionDuration: analytics.averageSessionDuration,
        completionRate: analytics.completionRate,
        averageEngagementScore: analytics.averageEngagementScore,
      },
      analytics: {
        totalQuestions: analytics.totalQuestions,
        totalPageNavigations: analytics.totalPageNavigations,
        topQuestions: analytics.topQuestions,
        eventBreakdown: analytics.eventBreakdown,
      },
      topAgents,
      recentActivity: recentSessions,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    })
  } catch (error: unknown) {
    console.error("Dashboard analytics error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to get dashboard analytics" },
      { status: 500 }
    )
  }
}
