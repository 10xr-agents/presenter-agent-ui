import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getFreeTierUsageSummary } from "@/lib/usage/free-tier"
import { getOrganizationUsageLimits } from "@/lib/usage/limits"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// GET /api/usage/limits - Get usage limits for organization
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("Unauthorized", 401)
    }

    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get("organizationId")

    if (!organizationId) {
      return errorResponse("organizationId is required", 400)
    }

    // Get limits from both systems (for compatibility)
    const freeTierSummary = await getFreeTierUsageSummary(organizationId)
    const newLimits = await getOrganizationUsageLimits(organizationId)

    return successResponse({
      tier: "free", // Default tier
      minutes: freeTierSummary.minutes,
      screenAgents: freeTierSummary.screenAgents,
      limits: newLimits.map((limit) => ({
        limitType: limit.limitType,
        limitValue: limit.limitValue,
        currentUsage: limit.currentUsage,
        remaining: Math.max(0, limit.limitValue - limit.currentUsage),
        usagePercentage: Math.round((limit.currentUsage / limit.limitValue) * 100),
        warningThresholds: {
          threshold1: limit.warningThreshold1,
          threshold2: limit.warningThreshold2,
          threshold3: limit.warningThreshold3,
        },
        warningsSent: limit.warningsSent,
        resetPeriod: limit.resetPeriod,
        lastResetAt: limit.lastResetAt,
      })),
    })
  } catch (error: unknown) {
    console.error("Get usage limits error:", error)
    const message = error instanceof Error ? error.message : "Failed to get usage limits"
    return errorResponse(message, 500)
  }
}
