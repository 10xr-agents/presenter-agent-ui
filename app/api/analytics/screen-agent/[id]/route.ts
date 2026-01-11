import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { aggregateScreenAgentAnalytics } from "@/lib/analytics/aggregator"
import { getSessionEngagementMetrics } from "@/lib/analytics/engagement-scorer"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { PresentationSession } from "@/lib/models/presentation-session"
import { getScreenAgentById } from "@/lib/screen-agents/manager"

/**
 * GET /api/analytics/screen-agent/[id] - Get screen agent-level analytics
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
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get("days") || "30", 10)

  try {
    // Verify screen agent exists and user has access
    const screenAgent = await getScreenAgentById(id)
    if (!screenAgent) {
      return NextResponse.json(
        { error: "Screen agent not found" },
        { status: 404 }
      )
    }

    await connectDB()

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get analytics aggregation
    const analytics = await aggregateScreenAgentAnalytics(id, startDate, endDate)

    // Get session metrics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions = await (PresentationSession as any).find({
      screenAgentId: id,
      startedAt: { $gte: startDate, $lte: endDate },
    })

    const totalMinutes = sessions.reduce((sum: number, s: any) => {
      const minutes = s.durationSeconds ? Math.ceil(s.durationSeconds / 60) : 0
      return sum + minutes
    }, 0)

    // Calculate costs (placeholder)
    const costPerMinute = 0.1 // Placeholder rate
    const totalCosts = totalMinutes * costPerMinute

    // Get unique viewers
    const uniqueViewers = new Set<string>()
    for (const s of sessions) {
      if (s.viewerInfo?.email) {
        uniqueViewers.add(s.viewerInfo.email)
      }
    }

    // Get engagement metrics for each session
    const sessionEngagement = await Promise.all(
      sessions.slice(0, 20).map(async (s: any) => {
        try {
          const metrics = await getSessionEngagementMetrics(s._id.toString())
          return {
            sessionId: s._id.toString(),
            engagementScore: await getSessionEngagementMetrics(s._id.toString()).then(
              (m) =>
                Math.round(
                  (m.totalQuestions * 5 +
                    m.totalPageNavigations * 2 +
                    Math.min((m.sessionDuration / 30) * 25, 25) +
                    Math.min(m.interactions * 1.5, 15) +
                    m.completionRate * 10)
                )
            ),
            metrics,
          }
        } catch (error: unknown) {
          return {
            sessionId: s._id.toString(),
            engagementScore: 0,
            metrics: {
              totalQuestions: 0,
              totalPageNavigations: 0,
              sessionDuration: 0,
              interactions: 0,
              completionRate: 0,
            },
          }
        }
      })
    )

    // Get recent sessions
    const recentSessions = sessions
      .sort((a: any, b: any) => {
        const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0
        const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 20)
      .map((s: any) => ({
        id: s._id.toString(),
        viewerEmail: s.viewerInfo?.email,
        viewerName: s.viewerInfo?.name,
        status: s.completionStatus,
        durationSeconds: s.durationSeconds,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      }))

    return NextResponse.json({
      screenAgent: {
        id: screenAgent._id.toString(),
        name: screenAgent.name,
        description: screenAgent.description,
      },
      metrics: {
        totalSessions: analytics.totalSessions,
        totalMinutes: totalMinutes,
        totalCosts: Math.round(totalCosts * 100) / 100,
        uniqueViewers: uniqueViewers.size,
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
      sessionEngagement: sessionEngagement.slice(0, 10),
      recentSessions,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    })
  } catch (error: unknown) {
    console.error("Screen agent analytics error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to get screen agent analytics" },
      { status: 500 }
    )
  }
}
