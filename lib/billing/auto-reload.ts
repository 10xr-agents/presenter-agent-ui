import { connectDB } from "@/lib/db/mongoose"
import { BillingAccount } from "@/lib/models/billing-account"
import { addBalance } from "./pay-as-you-go"
import { stripe } from "./stripe"

// Check if auto-reload is needed and trigger it
export async function checkAndTriggerAutoReload(
  organizationId: string
): Promise<{ triggered: boolean; success: boolean; error?: string }> {
  await connectDB()

  const account = await (BillingAccount as any).findOne({ organizationId })

  if (!account || account.billingType !== "pay_as_you_go") {
    return { triggered: false, success: false, error: "Account not found or not pay-as-you-go" }
  }

  // Check if auto-reload is enabled
  if (!account.autoReloadEnabled) {
    return { triggered: false, success: false }
  }

  // Check if balance is below threshold
  const currentBalance = account.balanceCents || 0
  const threshold = account.autoReloadThresholdCents || 1000

  if (currentBalance > threshold) {
    return { triggered: false, success: false }
  }

  // Trigger auto-reload
  const reloadAmount = account.autoReloadAmountCents || 10000

  try {
    // Charge payment method via Stripe
    if (!account.primaryPaymentMethod?.stripePaymentMethodId) {
      return {
        triggered: true,
        success: false,
        error: "No payment method configured",
      }
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: reloadAmount,
      currency: account.currencyCode || "usd",
      payment_method: account.primaryPaymentMethod.stripePaymentMethodId,
      confirmation_method: "manual",
      confirm: true,
      metadata: {
        organizationId,
        type: "auto_reload",
      },
    })

    if (paymentIntent.status === "succeeded") {
      // Add balance to account
      await addBalance(organizationId, reloadAmount)

      // TODO: Send email notification
      // await queueEmail({
      //   to: account.billingEmailAddresses[0],
      //   subject: "Account Auto-Reloaded",
      //   body: `Your account has been automatically reloaded with $${(reloadAmount / 100).toFixed(2)}.`,
      // })

      return { triggered: true, success: true }
    } else {
      return {
        triggered: true,
        success: false,
        error: `Payment failed: ${paymentIntent.status}`,
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Auto-reload error:", error)
    return {
      triggered: true,
      success: false,
      error: message,
    }
  }
}

// Get accounts that need auto-reload check
export async function getAccountsNeedingAutoReload(): Promise<string[]> {
  await connectDB()

  const accounts = await (BillingAccount as any).find({
    billingType: "pay_as_you_go",
    status: "active",
    autoReloadEnabled: true,
  })

  const organizationIds: string[] = []

  for (const account of accounts) {
    const balance = account.balanceCents || 0
    const threshold = account.autoReloadThresholdCents || 1000

    if (balance <= threshold) {
      organizationIds.push(account.organizationId)
    }
  }

  return organizationIds
}
