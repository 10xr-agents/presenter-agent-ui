import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Building2 } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AutoReloadSettings } from "@/components/billing/auto-reload-settings"
import { BalanceCard } from "@/components/billing/balance-card"
import { SubscriptionCard } from "@/components/billing/subscription-card"
import { EmptyState } from "@/components/ui/empty-state"
import { auth } from "@/lib/auth"
import { getOrCreateBillingAccount } from "@/lib/billing/pay-as-you-go"
import { connectDB } from "@/lib/db/mongoose"
import { Subscription } from "@/lib/models/billing"
import { getTenantState } from "@/lib/utils/tenant-state"
import { spacing } from "@/lib/utils/design-system"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

export default async function BillingPage() {
  // Session check is handled by layout
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    return null // This should never happen due to layout check
  }

  // Check tenant state - billing is organization-only
  const tenantState = await getTenantState(session.user.id)
  if (tenantState === "normal") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Billing & Subscription"
          description="Manage your subscription and billing"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Billing" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Organization Required</CardTitle>
            <CardDescription>
              Billing and subscription management is available for organizations. Create or join an organization to access billing features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/organization/create">
                <Building2 className="mr-2 h-4 w-4" />
                Create Organization
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  await connectDB()

  // Get user's subscription
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscription = await (Subscription as any).findOne({
    userId: session.user.id,
    status: "active",
  })

  // Get active organization from Better Auth
  let organizationId = "default-org" // Fallback
  try {
    const activeOrgResult = await authApi.getActiveOrganization({
      headers: headersList,
    })
    if (activeOrgResult.data) {
      organizationId = activeOrgResult.data.id
    }
  } catch {
    // Use fallback
  }

  const billingAccount = await getOrCreateBillingAccount(organizationId)

  return (
    <div className={spacing.section}>
      <PageHeader
        title="Billing & Subscription"
        description="Manage your subscription and billing"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Billing" },
        ]}
      />

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
