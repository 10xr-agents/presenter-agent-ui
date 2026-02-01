import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrCreateBillingAccount } from "@/lib/billing/pay-as-you-go"
import { connectDB } from "@/lib/db/mongoose"
import { Subscription } from "@/lib/models/billing"

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

    // Get billing account
    const billingAccount = await getOrCreateBillingAccount(organizationId)

    // Get subscription (if exists)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subscription = await (Subscription as any).findOne({
      userId: session.user.id,
      status: "active",
    })

    return NextResponse.json({
      data: {
        billingAccount: {
          balanceCents: billingAccount.balanceCents || 0,
          currencyCode: billingAccount.currencyCode || "USD",
          primaryPaymentMethod: billingAccount.primaryPaymentMethod,
          autoReloadEnabled: billingAccount.autoReloadEnabled || false,
          autoReloadThresholdCents: billingAccount.autoReloadThresholdCents || 1000,
          autoReloadAmountCents: billingAccount.autoReloadAmountCents || 10000,
        },
        subscription: subscription
          ? {
              planId: subscription.planId,
              status: subscription.status,
            }
          : undefined,
      },
    })
  } catch (error: unknown) {
    console.error("Get billing data error:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch billing data"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
