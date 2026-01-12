"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DashboardSkeleton } from "@/components/ui/skeleton-loaders"
import { ActivityFeed } from "./activity-feed"
import { CostChart } from "./charts/cost-chart"
import { UsageChart } from "./charts/usage-chart"
import { ExportButton } from "./export-button"
import { DashboardMetrics } from "./metric-cards"
import { TimeSelector } from "./time-selector"
import { TopAgentsTable } from "./top-agents-table"

interface DashboardData {
  metrics: {
    totalAgents: number
    totalCosts: number
    totalMinutes: number
    totalViewers: number
    averageSessionDuration: number
    completionRate: number
    averageEngagementScore: number
  }
  analytics: {
    totalQuestions: number
    totalPageNavigations: number
    topQuestions: Array<{ question: string; count: number; sessions: string[] }>
    eventBreakdown: Record<string, number>
  }
  topAgents: Array<{
    id: string
    name: string
    sessionCount: number
    minutesConsumed: number
  }>
  recentActivity: Array<{
    id: string
    screenAgentId: string
    screenAgentName: string
    viewerEmail?: string
    viewerName?: string
    status: "completed" | "abandoned" | "error"
    durationSeconds: number
    startedAt: string
  }>
  period: {
    days: number
    startDate: string
    endDate: string
  }
}

interface DashboardProps {
  organizationId: string
}

export function Dashboard({ organizationId }: DashboardProps) {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState(30)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/analytics/dashboard?organizationId=${organizationId}&days=${selectedDays}`
      )
      const result = (await response.json()) as DashboardData | { error?: string }
      if (!response.ok) {
        throw new Error((result as { error?: string }).error || "Failed to fetch dashboard data")
      }
      setData(result as DashboardData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [organizationId, selectedDays])

  if (loading) {
    return <DashboardSkeleton />
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">Unable to load analytics</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button onClick={fetchData} className="mt-3" variant="outline" size="sm">
          Retry
        </Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-sm text-muted-foreground">No data available</div>
    )
  }

  // Generate chart data (placeholder - would need actual time-series data from API)
  const usageChartData = [
    { date: "2024-01-01", minutes: 100, sessions: 10 },
    { date: "2024-01-02", minutes: 150, sessions: 15 },
    { date: "2024-01-03", minutes: 120, sessions: 12 },
  ]

  const costChartData = [
    { date: "2024-01-01", cost: 10 },
    { date: "2024-01-02", cost: 15 },
    { date: "2024-01-03", cost: 12 },
  ]

  return (
    <div className="space-y-6">
      {/* Time Selector - Resend style: compact */}
      <div className="flex items-center justify-between">
        <TimeSelector selectedDays={selectedDays} onDaysChange={setSelectedDays} />
        <ExportButton data={data} format="json" />
      </div>

      {/* Metrics - Resend style: subtle cards */}
      <DashboardMetrics {...data.metrics} />

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <UsageChart data={usageChartData} />
        <CostChart data={costChartData} />
      </div>

      {/* Tables */}
      <div className="grid gap-4 md:grid-cols-2">
        <TopAgentsTable agents={data.topAgents} />
        <ActivityFeed activities={data.recentActivity} />
      </div>
    </div>
  )
}
