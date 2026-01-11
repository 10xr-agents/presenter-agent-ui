import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasPermission } from "@/lib/config/roles"
import { connectDB } from "@/lib/db/mongoose"
import { prisma } from "@/lib/db/prisma"
import { BillingAccount } from "@/lib/models/billing-account"
import { ScreenAgent } from "@/lib/models/screen-agent"
import { aggregateUsageMetrics } from "@/lib/usage/metering"

/**
 * Middleware to check admin access
 */
async function requireAdmin(_req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check if user has admin permission
  // In production, get user's role from database
  const userRole = "platform_admin" // TODO: Get from session or database
  const isAdmin = hasPermission(userRole, "admin", "view_analytics")
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return null
}

/**
 * GET /api/admin/organizations - List all organizations with stats
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdmin(req)
  if (authError) {
    return authError
  }

  try {
    await connectDB()

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)
    const search = searchParams.get("search") || ""

    // Get all organizations from Better Auth
    const organizations = await prisma.organization.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    })

    // Get stats for each organization
    const organizationsWithStats = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      organizations.map(async (org: any) => {
        // Get billing account
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const billingAccount = await (BillingAccount as any).findOne({
          organizationId: org.id,
        })

        // Get screen agent count
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const screenAgentCount = await (ScreenAgent as any).countDocuments({
          organizationId: org.id,
        })

        // Get usage stats (last 30 days)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const usageStats = await aggregateUsageMetrics(org.id, thirtyDaysAgo)

        // Get member count
        const memberCount = org.members.length
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ownerCount = org.members.filter((m: any) => m.role === "owner").length

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          logo: org.logo,
          createdAt: org.createdAt,
          memberCount,
          ownerCount,
          screenAgentCount,
          billingAccount: billingAccount
            ? {
                balanceCents: billingAccount.balanceCents,
                billingType: billingAccount.billingType,
                status: billingAccount.status,
              }
            : null,
          usageStats: {
            totalMinutes: usageStats.totalQuantity,
            totalCost: usageStats.totalCost,
            eventCount: usageStats.eventCount,
          },
        }
      })
    )

    return NextResponse.json({
      organizations: organizationsWithStats,
      total: organizations.length,
      limit,
      offset,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching organizations:", error)
    return NextResponse.json(
      { error: message || "Failed to fetch organizations" },
      { status: 500 }
    )
  }
}
