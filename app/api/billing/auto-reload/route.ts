import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { updateAutoReloadSettings } from "@/lib/billing/pay-as-you-go"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// PATCH /api/billing/auto-reload - Update auto-reload settings
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("Unauthorized", 401)
    }

    const body = (await req.json()) as {
      organizationId: string
      enabled?: boolean
      thresholdCents?: number
      amountCents?: number
    }

    const { organizationId, enabled, thresholdCents, amountCents } = body

    if (!organizationId) {
      return errorResponse("organizationId is required", 400)
    }

    const account = await updateAutoReloadSettings(organizationId, {
      enabled,
      thresholdCents,
      amountCents,
    })

    return successResponse({
      success: true,
      autoReloadEnabled: account.autoReloadEnabled || false,
      autoReloadThresholdCents: account.autoReloadThresholdCents || 1000,
      autoReloadAmountCents: account.autoReloadAmountCents || 10000,
    })
  } catch (error: unknown) {
    console.error("Update auto-reload error:", error)
    const message = error instanceof Error ? error.message : "Failed to update auto-reload settings"
    return errorResponse(message, 500)
  }
}
