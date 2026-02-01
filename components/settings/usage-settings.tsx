"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import type { TenantOperatingMode } from "@/lib/utils/tenant-state"

interface UsageSettingsProps {
  tenantState: TenantOperatingMode
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
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-muted/30">
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
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
      {/* Screen Agents */}
      <Card className="bg-muted/30">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">Screen Agents</CardTitle>
              <CardDescription className="text-xs">
                Create and manage AI-powered screen presentation agents for your website.
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Free</span>
              <Button variant="outline" size="sm">
                Upgrade
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Agents Limit</span>
                <span className="font-medium">
                  {usage.screenAgents.total} / {usage.screenAgents.limit}
                </span>
              </div>
              <Progress 
                value={(usage.screenAgents.total / usage.screenAgents.limit) * 100} 
                className="h-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card className="bg-muted/30">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">Sessions</CardTitle>
              <CardDescription className="text-xs">
                Track presentation sessions where viewers interact with your Screen Agents.
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Free</span>
              <Button variant="outline" size="sm">
                Upgrade
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Monthly Limit</span>
                <span className="font-medium">
                  {usage.sessions.monthly.used} / {usage.sessions.monthly.limit}
                </span>
              </div>
              <Progress 
                value={(usage.sessions.monthly.used / usage.sessions.monthly.limit) * 100} 
                className="h-1.5"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Daily Limit</span>
                <span className="font-medium">
                  {usage.sessions.daily.used} / {usage.sessions.daily.limit}
                </span>
              </div>
              <Progress 
                value={(usage.sessions.daily.used / usage.sessions.daily.limit) * 100} 
                className="h-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Minutes */}
      <Card className="bg-muted/30">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">Minutes</CardTitle>
              <CardDescription className="text-xs">
                Total presentation time consumed across all Screen Agent sessions.
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Free</span>
              <Button variant="outline" size="sm">
                Upgrade
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Monthly Limit</span>
                <span className="font-medium">
                  {usage.minutes.monthly.used} / {usage.minutes.monthly.limit}
                </span>
              </div>
              <Progress 
                value={(usage.minutes.monthly.used / usage.minutes.monthly.limit) * 100} 
                className="h-1.5"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Daily Limit</span>
                <span className="font-medium">
                  {usage.minutes.daily.used} / {usage.minutes.daily.limit}
                </span>
              </div>
              <Progress 
                value={(usage.minutes.daily.used / usage.minutes.daily.limit) * 100} 
                className="h-1.5"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team */}
      <Card className="bg-muted/30">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">Team</CardTitle>
              <CardDescription className="text-xs">
                Understand the quotas and limits for your team.
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Free</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Domains</span>
              <span className="font-medium">
                {usage.team.domains.used} / {usage.team.domains.limit}
              </span>
            </div>
            <Progress 
              value={(usage.team.domains.used / usage.team.domains.limit) * 100} 
              className="h-1.5"
            />
          </div>
        </CardContent>
      </Card>

      {/* Organization Conversion (Normal mode only) */}
      {tenantState === "normal" && (
        <Card className="bg-muted/30">
          <CardHeader>
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">Organization Features</CardTitle>
              <CardDescription className="text-xs">
                Enable teams, advanced permissions, and organization-level features.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" asChild>
              <a href="/organization/create">Convert to Organization</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
