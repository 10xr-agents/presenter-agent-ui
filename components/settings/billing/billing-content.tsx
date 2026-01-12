"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { BalanceCard } from "@/components/billing/balance-card"
import { AutoReloadSettings } from "@/components/billing/auto-reload-settings"
import { SubscriptionCard } from "@/components/billing/subscription-card"
import type { TenantState } from "@/lib/utils/tenant-state"

interface BillingContentProps {
  organizationId: string
  tenantState: TenantState
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
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Unable to load billing information</p>
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

      {/* Subscription - Resend style: compact section */}
      {data.subscription && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Current Subscription</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage your subscription plan and billing cycle
            </p>
          </div>
          <SubscriptionCard currentPlan={data.subscription.planId} />
        </div>
      )}
    </div>
  )
}
