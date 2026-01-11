import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrCreateBillingAccount } from "@/lib/billing/pay-as-you-go"
import { getOrCreateCustomer, stripe } from "@/lib/billing/stripe"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// POST /api/billing/payment-method - Add/update payment method
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("Unauthorized", 401)
    }

    const body = (await req.json()) as {
      organizationId: string
      paymentMethodId: string
    }

    const { organizationId, paymentMethodId } = body

    if (!organizationId || !paymentMethodId) {
      return errorResponse("organizationId and paymentMethodId are required", 400)
    }

    // Get or create Stripe customer
    const customer = await getOrCreateCustomer(
      session.user.id,
      session.user.email,
      session.user.name || undefined
    )

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    })

    // Set as default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    })

    // Get payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)

    // Update billing account with payment method
    const account = await getOrCreateBillingAccount(organizationId)

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
      billingName: paymentMethod.billing_details?.name || undefined,
    }

    await (account as any).save()

    return successResponse({
      success: true,
      paymentMethod: account.primaryPaymentMethod,
    })
  } catch (error: unknown) {
    console.error("Add payment method error:", error)
    const message = error instanceof Error ? error.message : "Failed to add payment method"
    return errorResponse(message, 500)
  }
}

// DELETE /api/billing/payment-method - Remove payment method
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("Unauthorized", 401)
    }

    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get("organizationId")
    const paymentMethodId = searchParams.get("paymentMethodId")

    if (!organizationId || !paymentMethodId) {
      return errorResponse("organizationId and paymentMethodId are required", 400)
    }

    // Detach payment method from customer
    await stripe.paymentMethods.detach(paymentMethodId)

    // Update billing account
    const account = await getOrCreateBillingAccount(organizationId)

    if (account.primaryPaymentMethod?.stripePaymentMethodId === paymentMethodId) {
      account.primaryPaymentMethod = undefined
      await (account as any).save()
    }

    return successResponse({
      success: true,
    })
  } catch (error: unknown) {
    console.error("Remove payment method error:", error)
    const message = error instanceof Error ? error.message : "Failed to remove payment method"
    return errorResponse(message, 500)
  }
}
