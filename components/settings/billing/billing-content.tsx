"use client"

import { useEffect, useState } from "react"
import { AutoReloadSettings } from "@/components/billing/auto-reload-settings"
import { BalanceCard } from "@/components/billing/balance-card"
import { SubscriptionCard } from "@/components/billing/subscription-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { TenantOperatingMode } from "@/lib/utils/tenant-state"

interface BillingContentProps {
  organizationId: string
  tenantState: TenantOperatingMode
}

interface BillingData {
  billingAccount: {
    balanceCents: number
    currencyCode: string
    primaryPaymentMethod?: {
      type: string
      lastFour?: string
      cardBrand?: string
    }
    autoReloadEnabled: boolean
    autoReloadThresholdCents: number
    autoReloadAmountCents: number
  }
  subscription?: {
    planId: string
    status: string
  }
}

export function BillingContent({ organizationId, tenantState }: BillingContentProps) {
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBillingData = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/settings/billing?organizationId=${organizationId}`)
        if (response.ok) {
          const result = (await response.json()) as { data?: BillingData }
          setData(result.data || null)
        }
      } catch (err: unknown) {
        console.error("Failed to fetch billing data:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchBillingData()
  }, [organizationId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Billing Information</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Unable to load billing information</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Balance and Auto-Reload - Resend style: compact grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <BalanceCard
          organizationId={organizationId}
          balanceCents={data.billingAccount.balanceCents}
          currencyCode={data.billingAccount.currencyCode}
          primaryPaymentMethod={data.billingAccount.primaryPaymentMethod}
          autoReloadEnabled={data.billingAccount.autoReloadEnabled}
          autoReloadThresholdCents={data.billingAccount.autoReloadThresholdCents}
          autoReloadAmountCents={data.billingAccount.autoReloadAmountCents}
        />

        <AutoReloadSettings
          organizationId={organizationId}
          enabled={data.billingAccount.autoReloadEnabled}
          thresholdCents={data.billingAccount.autoReloadThresholdCents}
          amountCents={data.billingAccount.autoReloadAmountCents}
        />
      </div>

      {/* Subscription */}
      {data.subscription && (
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Current Subscription</CardTitle>
            <CardDescription className="text-xs">
              Manage your subscription plan and billing cycle
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionCard currentPlan={data.subscription.planId} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
