"use client"

import { Bot, ChevronRight, Plus } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

interface OverviewMetrics {
  totalAgents: number
  activeAgents: number
  totalSessions: number
  recentSessions: number
  processingAgents: number
}

interface OverviewDashboardProps {
  organizationId: string
  tenantState: "normal" | "organization"
}

export function OverviewDashboard({ organizationId, tenantState }: OverviewDashboardProps) {
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/dashboard/overview?organizationId=${organizationId}`)
        if (!response.ok) {
          throw new Error("Failed to fetch dashboard metrics")
        }
        const data = (await response.json()) as { data?: OverviewMetrics }
        setMetrics(data.data || null)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An unknown error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [organizationId])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="pt-6">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-destructive">Unable to load dashboard</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasAgents = (metrics?.totalAgents || 0) > 0

  // Empty state - enterprise-grade design
  if (!hasAgents) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bot className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle className="text-sm font-semibold">No Screen Agents yet</EmptyTitle>
          <EmptyDescription className="text-xs">
            Start creating Screen Agents to see insights and manage your AI-powered presentations.
          </EmptyDescription>
          <Button asChild size="sm" className="mt-4">
            <Link href="/screen-agents/new">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create your first agent
            </Link>
          </Button>
        </EmptyHeader>
      </Empty>
    )
  }

  // Dashboard with metrics - Enterprise-grade design
  return (
    <div className="space-y-6">
      {/* Metrics Grid - Professional stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Total Agents</p>
              <p className="text-2xl font-semibold">{metrics?.totalAgents || 0}</p>
              {metrics?.activeAgents !== undefined && metrics.activeAgents > 0 && (
                <p className="text-xs text-muted-foreground">{metrics.activeAgents} active</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Sessions this week</p>
              <p className="text-2xl font-semibold">{metrics?.recentSessions || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Total Sessions</p>
              <p className="text-2xl font-semibold">{metrics?.totalSessions || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">In Progress</p>
              <p className="text-2xl font-semibold">{metrics?.processingAgents || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Primary Action Card */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">Create a new Screen Agent</CardTitle>
              <CardDescription className="text-xs">
                Build an AI agent that presents and navigates your website interactively
              </CardDescription>
            </div>
            <Button asChild size="sm">
              <Link href="/screen-agents/new">
                <Plus className="mr-2 h-3.5 w-3.5" />
                Create agent
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Navigation Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-muted/30 transition-colors hover:bg-muted/50 cursor-pointer group">
          <CardContent className="pt-6">
            <Link href="/screen-agents" className="block">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
                    View all agents
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Manage and configure your Screen Agents
                  </CardDescription>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 transition-colors hover:bg-muted/50 cursor-pointer group">
          <CardContent className="pt-6">
            <Link href="/analytics" className="block">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
                    View analytics
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Detailed insights and performance metrics
                  </CardDescription>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
