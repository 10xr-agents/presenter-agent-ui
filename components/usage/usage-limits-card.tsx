"use client"

import { AlertCircle, Clock, Cpu, TrendingUp } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface UsageLimitsData {
  tier: "free" | "paid" | "enterprise"
  minutes: {
    used: number
    limit: number
    remaining: number
  }
  screenAgents: {
    used: number
    limit: number
    remaining: number
  }
}

interface UsageLimitsCardProps {
  organizationId: string
  initialData?: UsageLimitsData
}

export function UsageLimitsCard({ organizationId, initialData }: UsageLimitsCardProps) {
  const [data, setData] = useState<UsageLimitsData | null>(initialData || null)
  const [isLoading, setIsLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialData) {
      fetchUsageLimits()
    }
  }, [organizationId])

  const fetchUsageLimits = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/usage/limits?organizationId=${organizationId}`)
      if (!response.ok) throw new Error("Failed to fetch usage limits")

      const result = (await response.json()) as { data?: UsageLimitsData }
      if (result.data) {
        setData(result.data)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch usage limits"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage Limits</CardTitle>
          <CardDescription>Loading usage information...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage Limits</CardTitle>
          <CardDescription>Unable to load usage information</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || "Failed to load usage limits"}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const minutesPercentage = data.minutes.limit > 0 ? data.minutes.used / data.minutes.limit : 0
  const screenAgentsPercentage =
    data.screenAgents.limit > 0 ? data.screenAgents.used / data.screenAgents.limit : 0

  const minutesWarning = minutesPercentage >= 0.8
  const screenAgentsWarning = screenAgentsPercentage >= 0.8

  const minutesExceeded = data.minutes.used >= data.minutes.limit
  const screenAgentsExceeded = data.screenAgents.used >= data.screenAgents.limit

  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case "enterprise":
        return "default"
      case "paid":
        return "secondary"
      case "free":
        return "outline"
      default:
        return "outline"
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Usage Limits</CardTitle>
          <Badge variant={getTierBadgeColor(data.tier)} className="capitalize">
            {data.tier} Tier
          </Badge>
        </div>
        <CardDescription>Current usage and limits for this billing period</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Minutes Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Presentation Minutes</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {data.minutes.used} / {data.minutes.limit === Number.MAX_SAFE_INTEGER ? "∞" : data.minutes.limit}
            </div>
          </div>
          {data.minutes.limit !== Number.MAX_SAFE_INTEGER && (
            <>
              <Progress value={Math.min(minutesPercentage * 100, 100)} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{data.minutes.remaining} minutes remaining</span>
                <span>{(minutesPercentage * 100).toFixed(1)}% used</span>
              </div>
            </>
          )}
          {minutesWarning && !minutesExceeded && (
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You&apos;ve used {Math.round(minutesPercentage * 100)}% of your monthly minutes. Consider
                upgrading for unlimited usage.
              </AlertDescription>
            </Alert>
          )}
          {minutesExceeded && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Monthly minutes limit reached. Upgrade to continue using Screen Agents.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Screen Agents Usage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Screen Agents</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {data.screenAgents.used} / {data.screenAgents.limit === Number.MAX_SAFE_INTEGER ? "∞" : data.screenAgents.limit}
            </div>
          </div>
          {data.screenAgents.limit !== Number.MAX_SAFE_INTEGER && (
            <>
              <Progress value={Math.min(screenAgentsPercentage * 100, 100)} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{data.screenAgents.remaining} agents remaining</span>
                <span>{(screenAgentsPercentage * 100).toFixed(1)}% used</span>
              </div>
            </>
          )}
          {screenAgentsWarning && !screenAgentsExceeded && (
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You&apos;ve used {Math.round(screenAgentsPercentage * 100)}% of your Screen Agent limit.
                Upgrade for unlimited Screen Agents.
              </AlertDescription>
            </Alert>
          )}
          {screenAgentsExceeded && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Screen Agent limit reached. Upgrade to create more Screen Agents.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Upgrade CTA */}
        {data.tier === "free" && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Upgrade for unlimited usage</p>
                <p className="text-xs text-muted-foreground">
                  Get unlimited Screen Agents and presentation minutes
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/billing">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Upgrade
                </Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
