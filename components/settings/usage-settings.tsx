"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { TenantState } from "@/lib/utils/tenant-state"

interface UsageSettingsProps {
  tenantState: TenantState
}

interface UsageMetrics {
  screenAgents: {
    total: number
    limit: number
  }
  sessions: {
    monthly: {
      used: number
      limit: number
    }
    daily: {
      used: number
      limit: number
    }
  }
  minutes: {
    monthly: {
      used: number
      limit: number
    }
    daily: {
      used: number
      limit: number
    }
  }
  team: {
    domains: {
      used: number
      limit: number
    }
  }
}

export function UsageSettings({ tenantState }: UsageSettingsProps) {
  const [metrics, setMetrics] = useState<UsageMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUsageMetrics = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/settings/usage")
        if (response.ok) {
          const data = (await response.json()) as { metrics?: UsageMetrics }
          setMetrics(data.metrics || null)
        }
      } catch (err: unknown) {
        console.error("Failed to fetch usage metrics:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchUsageMetrics()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="h-20 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const defaultMetrics: UsageMetrics = {
    screenAgents: {
      total: 0,
      limit: 10,
    },
    sessions: {
      monthly: {
        used: 0,
        limit: 1000,
      },
      daily: {
        used: 0,
        limit: 50,
      },
    },
    minutes: {
      monthly: {
        used: 0,
        limit: 5000,
      },
      daily: {
        used: 0,
        limit: 200,
      },
    },
    team: {
      domains: {
        used: 1,
        limit: 1,
      },
    },
  }

  const usage = metrics || defaultMetrics

  return (
    <div className="space-y-6">
      {/* Screen Agents - Resend style */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-sm font-semibold mb-1">Screen Agents</h3>
                <p className="text-xs text-muted-foreground">
                  Create and manage AI-powered screen presentation agents for your website.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border p-2.5">
                  <span className="text-xs text-muted-foreground">Agents Limit</span>
                  <span className="text-xs font-medium">
                    {usage.screenAgents.total} / {usage.screenAgents.limit}
                  </span>
                </div>
              </div>
            </div>
            <div className="ml-4 flex flex-col items-end gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Free</span>
              <Button variant="outline" size="sm">
                Upgrade
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions - Resend style */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-sm font-semibold mb-1">Sessions</h3>
                <p className="text-xs text-muted-foreground">
                  Track presentation sessions where viewers interact with your Screen Agents.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border p-2.5">
                  <span className="text-xs text-muted-foreground">Monthly Limit</span>
                  <span className="text-xs font-medium">
                    {usage.sessions.monthly.used} / {usage.sessions.monthly.limit}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border p-2.5">
                  <span className="text-xs text-muted-foreground">Daily Limit</span>
                  <span className="text-xs font-medium">
                    {usage.sessions.daily.used} / {usage.sessions.daily.limit}
                  </span>
                </div>
              </div>
            </div>
            <div className="ml-4 flex flex-col items-end gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Free</span>
              <Button variant="outline" size="sm">
                Upgrade
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Minutes - Resend style */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-sm font-semibold mb-1">Minutes</h3>
                <p className="text-xs text-muted-foreground">
                  Total presentation time consumed across all Screen Agent sessions.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border p-2.5">
                  <span className="text-xs text-muted-foreground">Monthly Limit</span>
                  <span className="text-xs font-medium">
                    {usage.minutes.monthly.used} / {usage.minutes.monthly.limit}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-md border p-2.5">
                  <span className="text-xs text-muted-foreground">Daily Limit</span>
                  <span className="text-xs font-medium">
                    {usage.minutes.daily.used} / {usage.minutes.daily.limit}
                  </span>
                </div>
              </div>
            </div>
            <div className="ml-4 flex flex-col items-end gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Free</span>
              <Button variant="outline" size="sm">
                Upgrade
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team - Resend style */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-3">
              <div>
                <h3 className="text-sm font-semibold mb-1">Team</h3>
                <p className="text-xs text-muted-foreground">
                  Understand the quotas and limits for your team.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-md border p-2.5">
                  <span className="text-xs text-muted-foreground">Domains</span>
                  <span className="text-xs font-medium">
                    {usage.team.domains.used} / {usage.team.domains.limit}
                  </span>
                </div>
              </div>
            </div>
            <div className="ml-4 flex flex-col items-end gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Free</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organization Conversion (Normal mode only) */}
      {tenantState === "normal" && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold mb-1">Organization Features</h3>
                <p className="text-xs text-muted-foreground">
                  Enable teams, advanced permissions, and organization-level features.
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href="/organization/create">Convert to Organization</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
