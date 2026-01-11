import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isUsageApproachingLimit } from "@/lib/usage/free-tier"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// GET /api/usage/warnings - Get usage warnings
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

    const warnings = await isUsageApproachingLimit(organizationId)

    return successResponse(warnings)
  } catch (error: unknown) {
    console.error("Get usage warnings error:", error)
    const message = error instanceof Error ? error.message : "Failed to get usage warnings"
    return errorResponse(message, 500)
  }
}
