"use client"

import {
  Card,
  CardContent,
} from "@/components/ui/card"

interface DashboardMetricsProps {
  totalAgents: number
  totalCosts: number
  totalMinutes: number
  totalViewers: number
  averageSessionDuration: number
  completionRate: number
  averageEngagementScore: number
}

export function DashboardMetrics({
  totalAgents,
  totalCosts,
  totalMinutes,
  totalViewers,
  averageSessionDuration,
  completionRate,
  averageEngagementScore,
}: DashboardMetricsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Agents</p>
            <p className="text-2xl font-semibold">{totalAgents}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Costs</p>
            <p className="text-2xl font-semibold">${totalCosts.toFixed(2)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Minutes</p>
            <p className="text-2xl font-semibold">{totalMinutes}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Viewers</p>
            <p className="text-2xl font-semibold">{totalViewers}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Avg Session Duration</p>
            <p className="text-2xl font-semibold">{averageSessionDuration.toFixed(1)} min</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Completion Rate</p>
            <p className="text-2xl font-semibold">{(completionRate * 100).toFixed(1)}%</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Engagement Score</p>
            <p className="text-2xl font-semibold">{averageEngagementScore.toFixed(1)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
