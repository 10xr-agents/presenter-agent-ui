import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  addBalance,
  getOrCreateBillingAccount,
  MINIMUM_INITIAL_BALANCE_CENTS,
} from "@/lib/billing/pay-as-you-go"
import { getOrCreateCustomer, stripe } from "@/lib/billing/stripe"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// POST /api/billing/add-balance - Add balance to account
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("Unauthorized", 401)
    }

    const body = (await req.json()) as {
      organizationId: string
      amountCents: number
      paymentMethodId: string
    }

    const { organizationId, amountCents, paymentMethodId } = body

    if (!organizationId || !amountCents || !paymentMethodId) {
      return errorResponse("organizationId, amountCents, and paymentMethodId are required", 400)
    }

    // Validate minimum amount
    if (amountCents < MINIMUM_INITIAL_BALANCE_CENTS) {
      return errorResponse(
        `Minimum balance amount is $${MINIMUM_INITIAL_BALANCE_CENTS / 100}`,
        400
      )
    }

    // Get or create Stripe customer
    const customer = await getOrCreateCustomer(
      session.user.id,
      session.user.email,
      session.user.name || undefined
    )

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: customer.id,
      payment_method: paymentMethodId,
      confirmation_method: "manual",
      confirm: true,
      metadata: {
        organizationId,
        type: "balance_load",
        userId: session.user.id,
      },
    })

    if (paymentIntent.status !== "succeeded") {
      return errorResponse(`Payment failed: ${paymentIntent.status}`, 400)
    }

    // Add balance to account
    const account = await addBalance(organizationId, amountCents)

    // Update payment method in billing account if needed
    if (!account.primaryPaymentMethod) {
      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id,
      })

      // Get payment method details
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)

      // Update billing account with payment method
      account.primaryPaymentMethod = {
        type: "card",
        stripePaymentMethodId: paymentMethodId,
        lastFour: paymentMethod.card?.last4,
        expirationDate: paymentMethod.card?.exp_month && paymentMethod.card?.exp_year
          ? new Date(paymentMethod.card.exp_year, paymentMethod.card.exp_month - 1)
          : undefined,
        cardBrand:
          paymentMethod.card?.brand === "visa"
            ? "visa"
            : paymentMethod.card?.brand === "mastercard"
              ? "mastercard"
              : paymentMethod.card?.brand === "amex"
                ? "amex"
                : paymentMethod.card?.brand === "discover"
                  ? "discover"
                  : "other",
      }

      await (account as any).save()
    }

    // TODO: Send email notification
    // await queueEmail({
    //   to: session.user.email,
    //   subject: "Balance Added",
    //   body: `Your account has been credited with $${(amountCents / 100).toFixed(2)}.`,
    // })

    return successResponse({
      success: true,
      newBalanceCents: account.balanceCents || 0,
      paymentIntentId: paymentIntent.id,
    })
  } catch (error: unknown) {
    console.error("Add balance error:", error)
    const message = error instanceof Error ? error.message : "Failed to add balance"
    return errorResponse(message, 500)
  }
}
