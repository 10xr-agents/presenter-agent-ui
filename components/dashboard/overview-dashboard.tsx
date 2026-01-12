"use client"

import { Bot, Plus } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-7 w-12" />
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
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-destructive">Unable to load dashboard</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  const hasAgents = (metrics?.totalAgents || 0) > 0

  // Empty state - clean, centered, prominent
  if (!hasAgents) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h2 className="mb-2 text-2xl font-semibold">No Screen Agents yet</h2>
        <p className="mb-8 max-w-md text-sm text-muted-foreground">
          Start creating Screen Agents to see insights and manage your AI-powered presentations.
        </p>
        <Button asChild size="lg">
          <Link href="/screen-agents/new">
            <Plus className="mr-2 h-4 w-4" />
            Create your first agent
          </Link>
        </Button>
      </div>
    )
  }

  // Dashboard with metrics - Resend-style: clean cards, minimal styling
  return (
    <div className="space-y-6">
      {/* Metrics Grid - Resend style: subtle background cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Agents</p>
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
              <p className="text-sm text-muted-foreground">Sessions this week</p>
              <p className="text-2xl font-semibold">{metrics?.recentSessions || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total sessions</p>
              <p className="text-2xl font-semibold">{metrics?.totalSessions || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">In progress</p>
              <p className="text-2xl font-semibold">{metrics?.processingAgents || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Primary Action Card - Resend style: clean, minimal */}
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Create a new Screen Agent</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Build an AI agent that presents and navigates your website interactively
              </p>
            </div>
            <Button asChild>
              <Link href="/screen-agents/new">
                <Plus className="mr-2 h-4 w-4" />
                Create agent
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Navigation - Resend style: simple, clean links */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-muted/30 transition-colors hover:bg-muted/50">
          <CardContent className="pt-6">
            <Link href="/screen-agents" className="block">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">View all agents</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Manage and configure your Screen Agents
                  </p>
                </div>
                <svg
                  className="h-5 w-5 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 transition-colors hover:bg-muted/50">
          <CardContent className="pt-6">
            <Link href="/analytics" className="block">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">View analytics</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Detailed insights and performance metrics
                  </p>
                </div>
                <svg
                  className="h-5 w-5 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
