import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { hasPermission } from "@/lib/config/roles"
import { connectDB } from "@/lib/db/mongoose"
import { prisma } from "@/lib/db/prisma"
import { BillingAccount } from "@/lib/models/billing-account"
import { ScreenAgent } from "@/lib/models/screen-agent"
import { UsageEvent } from "@/lib/models/usage-event"
import { aggregateUsageMetrics } from "@/lib/usage/metering"

/**
 * Middleware to check admin access
 */
async function requireAdmin(_req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userRole = "platform_admin" // TODO: Get from session or database
  const isAdmin = hasPermission(userRole, "admin", "view_analytics")
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return null
}

/**
 * GET /api/admin/organizations/[id] - Get organization details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(req)
  if (authError) {
    return authError
  }

  const { id } = await params

  try {
    await connectDB()

    // Get organization from Better Auth
    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    })

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    // Get billing account
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billingAccount = await (BillingAccount as any).findOne({
      organizationId: id,
    })

    // Get screen agents
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screenAgents = await (ScreenAgent as any).find({ organizationId: id })

    // Get usage stats (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const usageStats = await aggregateUsageMetrics(id, thirtyDaysAgo)

    // Get recent usage events (last 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentUsage = await (UsageEvent as any)
      .find({ organizationId: id })
      .sort({ eventTimestamp: -1 })
      .limit(10)

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        metadata: organization.metadata,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      members: organization.members.map((member: any) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        user: {
          id: member.user.id,
          name: member.user.name,
          email: member.user.email,
          emailVerified: member.user.emailVerified,
        },
      })),
      billingAccount: billingAccount
        ? {
            id: billingAccount._id.toString(),
            balanceCents: billingAccount.balanceCents,
            billingType: billingAccount.billingType,
            status: billingAccount.status,
            enterpriseContract: billingAccount.enterpriseContract,
            autoReloadEnabled: billingAccount.autoReloadEnabled,
          }
        : null,
      screenAgents: screenAgents.map((agent: any) => ({
        id: agent._id.toString(),
        name: agent.name,
        status: agent.status,
        createdAt: agent.createdAt,
      })),
      usageStats: {
        totalMinutes: usageStats.totalQuantity,
        totalCost: usageStats.totalCost,
        eventCount: usageStats.eventCount,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recentUsage: recentUsage.map((event: any) => ({
          id: event._id.toString(),
          eventType: event.eventType,
          quantity: event.quantity,
          totalCostCents: event.totalCostCents,
          eventTimestamp: event.eventTimestamp,
        })),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error fetching organization:", error)
    return NextResponse.json(
      { error: message || "Failed to fetch organization" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/organizations/[id] - Update organization (admin only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdmin(req)
  if (authError) {
    return authError
  }

  const { id } = await params
  const body = (await req.json()) as {
    name?: string
    slug?: string
    metadata?: string
  }

  try {
    await connectDB()

    // Update organization in Better Auth
    const organization = await prisma.organization.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.slug,
        metadata: body.metadata,
      },
    })

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        metadata: organization.metadata,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Error updating organization:", error)
    return NextResponse.json(
      { error: message || "Failed to update organization" },
      { status: 500 }
    )
  }
}
