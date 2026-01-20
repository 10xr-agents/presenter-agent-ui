"use client"

import { Spinner } from "@/components/ui/spinner"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ActivityFeed } from "./activity-feed"
import { CostChart } from "./charts/cost-chart"
import { UsageChart } from "./charts/usage-chart"
import { ExportButton } from "./export-button"
import { DashboardMetrics } from "./metric-cards"
import { TimeSelector } from "./time-selector"
import { TopAgentsTable } from "./top-agents-table"

interface ScreenAgentAnalyticsData {
  screenAgent: {
    id: string
    name: string
    description?: string
  }
  metrics: {
    totalSessions: number
    totalMinutes: number
    totalCosts: number
    uniqueViewers: number
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
  sessionEngagement: Array<{
    sessionId: string
    engagementScore: number
    metrics: {
      totalQuestions: number
      totalPageNavigations: number
      sessionDuration: number
      interactions: number
      completionRate: number
    }
  }>
  recentSessions: Array<{
    id: string
    viewerEmail?: string
    viewerName?: string
    status: "completed" | "abandoned" | "error"
    durationSeconds: number
    startedAt: string
    endedAt?: string
  }>
  period: {
    days: number
    startDate: string
    endDate: string
  }
}

interface ScreenAgentAnalyticsProps {
  screenAgentId: string
}

export function ScreenAgentAnalytics({ screenAgentId }: ScreenAgentAnalyticsProps) {
  const [data, setData] = useState<ScreenAgentAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDays, setSelectedDays] = useState(30)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/analytics/screen-agent/${screenAgentId}?days=${selectedDays}`
      )
      const result = (await response.json()) as ScreenAgentAnalyticsData | { error?: string }
      if (!response.ok) {
        throw new Error((result as { error?: string }).error || "Failed to fetch analytics data")
      }
      setData(result as ScreenAgentAnalyticsData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [screenAgentId, selectedDays])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
        <p>Error: {error}</p>
        <Button onClick={fetchData} className="mt-2" variant="outline">
          Retry
        </Button>
      </div>
    )
  }

  if (!data) {
    return <div>No data available</div>
  }

  // Chart data should come from API - using empty arrays for now
  // Charts should handle empty data gracefully
  const usageChartData: Array<{ date: string; minutes: number; sessions: number }> = []
  const costChartData: Array<{ date: string; cost: number }> = []

  // Adapt metrics for DashboardMetrics component
  const dashboardMetrics = {
    totalAgents: 1,
    totalCosts: data.metrics.totalCosts,
    totalMinutes: data.metrics.totalMinutes,
    totalViewers: data.metrics.uniqueViewers,
    averageSessionDuration: data.metrics.averageSessionDuration,
    completionRate: data.metrics.completionRate,
    averageEngagementScore: data.metrics.averageEngagementScore,
  }

  // Adapt recent sessions for ActivityFeed
  const recentActivity = data.recentSessions.map((s) => ({
    id: s.id,
    screenAgentId: screenAgentId,
    screenAgentName: data.screenAgent.name,
    viewerEmail: s.viewerEmail,
    viewerName: s.viewerName,
    status: s.status,
    durationSeconds: s.durationSeconds,
    startedAt: s.startedAt,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{data.screenAgent.name}</h1>
          {data.screenAgent.description && (
            <p className="text-muted-foreground mt-1">{data.screenAgent.description}</p>
          )}
        </div>
        <ExportButton
          data={{
            metrics: data.metrics,
            analytics: data.analytics,
            topAgents: [],
            recentActivity: data.recentSessions.map((s) => ({
              id: s.id,
              screenAgentId: screenAgentId,
              screenAgentName: data.screenAgent.name,
              viewerEmail: s.viewerEmail,
              viewerName: s.viewerName,
              status: s.status,
              durationSeconds: s.durationSeconds,
              startedAt: s.startedAt,
            })),
          }}
          format="json"
        />
      </div>

      <TimeSelector selectedDays={selectedDays} onDaysChange={setSelectedDays} />

      <DashboardMetrics {...dashboardMetrics} />

      {/* Charts - Only show if data is available */}
      {(usageChartData.length > 0 || costChartData.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {usageChartData.length > 0 && <UsageChart data={usageChartData} />}
          {costChartData.length > 0 && <CostChart data={costChartData} />}
        </div>
      )}

      {data.analytics.topQuestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Questions</CardTitle>
            <CardDescription>Most frequently asked questions</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.analytics.topQuestions.map((q, index) => (
                  <TableRow key={index}>
                    <TableCell>{q.question}</TableCell>
                    <TableCell className="text-right">{q.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data.sessionEngagement.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Session Engagement</CardTitle>
              <CardDescription>Engagement scores for recent sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sessionEngagement.map((s) => (
                    <TableRow key={s.sessionId}>
                      <TableCell className="font-mono text-xs">
                        {s.sessionId.substring(0, 8)}...
                      </TableCell>
                      <TableCell className="text-right">{s.engagementScore}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        <ActivityFeed activities={recentActivity} />
      </div>
    </div>
  )
}
