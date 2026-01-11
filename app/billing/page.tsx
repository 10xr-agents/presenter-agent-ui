import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AutoReloadSettings } from "@/components/billing/auto-reload-settings"
import { BalanceCard } from "@/components/billing/balance-card"
import { SubscriptionCard } from "@/components/billing/subscription-card"
import { auth } from "@/lib/auth"
import { getOrCreateBillingAccount } from "@/lib/billing/pay-as-you-go"
import { connectDB } from "@/lib/db/mongoose"
import { Subscription } from "@/lib/models/billing"

export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  await connectDB()

  // Get user's subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = await (Subscription as any).findOne({
    userId: session.user.id,
    status: "active",
  })

  // Get or create billing account for organization
  // TODO: Get organization ID from Better Auth active organization context
  const organizationId = "default-org" // TODO: Get from Better Auth active organization
  const billingAccount = await getOrCreateBillingAccount(organizationId)

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground">Manage your subscription and billing</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <BalanceCard
          organizationId={organizationId}
          balanceCents={billingAccount.balanceCents || 0}
          currencyCode={billingAccount.currencyCode || "USD"}
          primaryPaymentMethod={billingAccount.primaryPaymentMethod}
          autoReloadEnabled={billingAccount.autoReloadEnabled || false}
          autoReloadThresholdCents={billingAccount.autoReloadThresholdCents || 1000}
          autoReloadAmountCents={billingAccount.autoReloadAmountCents || 10000}
        />

        <AutoReloadSettings
          organizationId={organizationId}
          enabled={billingAccount.autoReloadEnabled || false}
          thresholdCents={billingAccount.autoReloadThresholdCents || 1000}
          amountCents={billingAccount.autoReloadAmountCents || 10000}
        />
      </div>

      {subscription && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-4">Current Subscription</h2>
          <SubscriptionCard currentPlan={subscription.planId} />
        </div>
      )}
    </div>
  )
}
