import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrCreateBillingAccount } from "@/lib/billing/pay-as-you-go"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// GET /api/billing/account - Get billing account
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

    const account = await getOrCreateBillingAccount(organizationId)

    return successResponse({
      id: account._id.toString(),
      organizationId: account.organizationId,
      billingType: account.billingType,
      status: account.status,
      balanceCents: account.balanceCents || 0,
      autoReloadEnabled: account.autoReloadEnabled || false,
      autoReloadThresholdCents: account.autoReloadThresholdCents || 1000,
      autoReloadAmountCents: account.autoReloadAmountCents || 10000,
      minimumBalanceCents: account.minimumBalanceCents || 0,
      currencyCode: account.currencyCode || "USD",
      primaryPaymentMethod: account.primaryPaymentMethod,
      billingEmailAddresses: account.billingEmailAddresses || [],
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    })
  } catch (error: unknown) {
    console.error("Get billing account error:", error)
    const message = error instanceof Error ? error.message : "Failed to get billing account"
    return errorResponse(message, 500)
  }
}
