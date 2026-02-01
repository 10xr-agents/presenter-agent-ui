import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { PresentationSession } from "@/lib/models/presentation-session"
import { ScreenAgent } from "@/lib/models/screen-agent"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDB()

    const tenantState = await getTenantOperatingMode(session.user.id)
    let organizationId: string | null = null

    if (tenantState === "organization") {
      organizationId = await getActiveOrganizationId()
    }

    // Determine scope for queries
    const queryScope = tenantState === "organization" && organizationId
      ? { organizationId }
      : { ownerId: session.user.id }

    // Get total Screen Agents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalAgents = await (ScreenAgent as any).countDocuments(queryScope)

    // Get current month and day boundaries
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    // Get agent IDs for filtering sessions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agents = await (ScreenAgent as any).find(queryScope)
    const agentIds = agents.map((a: any) => a._id.toString())

    // Get monthly sessions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monthlySessions = await (PresentationSession as any).countDocuments({
      screenAgentId: { $in: agentIds },
      startedAt: { $gte: startOfMonth },
    })

    // Get daily sessions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dailySessions = await (PresentationSession as any).countDocuments({
      screenAgentId: { $in: agentIds },
      startedAt: { $gte: startOfDay },
    })

    // Get monthly minutes (aggregate total duration)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monthlyMinutesResult = await (PresentationSession as any).aggregate([
      {
        $match: {
          screenAgentId: { $in: agentIds },
          startedAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalMinutes: {
            $sum: {
              $divide: ["$durationSeconds", 60],
            },
          },
        },
      },
    ])

    const monthlyMinutes = monthlyMinutesResult[0]?.totalMinutes || 0

    // Get daily minutes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dailyMinutesResult = await (PresentationSession as any).aggregate([
      {
        $match: {
          screenAgentId: { $in: agentIds },
          startedAt: { $gte: startOfDay },
        },
      },
      {
        $group: {
          _id: null,
          totalMinutes: {
            $sum: {
              $divide: ["$durationSeconds", 60],
            },
          },
        },
      },
    ])

    const dailyMinutes = dailyMinutesResult[0]?.totalMinutes || 0

    // Default limits (Free tier)
    const metrics = {
      screenAgents: {
        total: totalAgents,
        limit: 10,
      },
      sessions: {
        monthly: {
          used: monthlySessions,
          limit: 1000,
        },
        daily: {
          used: dailySessions,
          limit: 50,
        },
      },
      minutes: {
        monthly: {
          used: Math.round(monthlyMinutes),
          limit: 5000,
        },
        daily: {
          used: Math.round(dailyMinutes),
          limit: 200,
        },
      },
      team: {
        domains: {
          used: 1,
          limit: 1,
        },
      },
    }

    return NextResponse.json({ metrics })
  } catch (error: unknown) {
    console.error("Get usage metrics error:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch usage metrics"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
