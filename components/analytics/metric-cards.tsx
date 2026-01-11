"use client"

import { Activity, Clock, DollarSign, Target, TrendingUp, Users } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface MetricCardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
}

export function MetricCard({
  title,
  value,
  description,
  icon,
  trend,
}: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && (
          <div
            className={`text-xs mt-1 ${trend.isPositive ? "text-green-600" : "text-red-600"}`}
          >
            {trend.isPositive ? "+" : ""}
            {trend.value}% from last period
          </div>
        )}
      </CardContent>
    </Card>
  )
}

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
      <MetricCard
        title="Total Agents"
        value={totalAgents}
        description="Active screen agents"
        icon={<Activity className="h-4 w-4" />}
      />
      <MetricCard
        title="Total Costs"
        value={`$${totalCosts.toFixed(2)}`}
        description="Total spending"
        icon={<DollarSign className="h-4 w-4" />}
      />
      <MetricCard
        title="Total Minutes"
        value={totalMinutes}
        description="Presentation minutes consumed"
        icon={<Clock className="h-4 w-4" />}
      />
      <MetricCard
        title="Total Viewers"
        value={totalViewers}
        description="Unique presentation sessions"
        icon={<Users className="h-4 w-4" />}
      />
      <MetricCard
        title="Avg Session Duration"
        value={`${averageSessionDuration.toFixed(1)} min`}
        description="Average presentation length"
        icon={<Clock className="h-4 w-4" />}
      />
      <MetricCard
        title="Completion Rate"
        value={`${(completionRate * 100).toFixed(1)}%`}
        description="Sessions completed"
        icon={<Target className="h-4 w-4" />}
      />
      <MetricCard
        title="Engagement Score"
        value={averageEngagementScore.toFixed(1)}
        description="Average viewer engagement (0-100)"
        icon={<TrendingUp className="h-4 w-4" />}
      />
    </div>
  )
}
