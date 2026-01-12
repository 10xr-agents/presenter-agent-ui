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
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border rounded-lg border-destructive/50 bg-destructive/5 p-4">
        <p className="text-xs font-semibold text-destructive">Unable to load dashboard</p>
        <p className="mt-0.5 text-xs text-foreground opacity-85">{error}</p>
      </div>
    )
  }

  const hasAgents = (metrics?.totalAgents || 0) > 0

  // Empty state - calm, instructional, Resend style
  if (!hasAgents) {
    return (
      <div className="border rounded-lg p-12 text-center">
        <Bot className="mx-auto h-8 w-8 text-foreground opacity-60 mb-2" />
        <h2 className="text-sm font-semibold mb-1">No Screen Agents yet</h2>
        <p className="text-xs text-foreground mb-4 max-w-md mx-auto">
          Start creating Screen Agents to see insights and manage your AI-powered presentations.
        </p>
        <Button asChild size="sm">
          <Link href="/screen-agents/new">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Create your first agent
          </Link>
        </Button>
      </div>
    )
  }

  // Dashboard with metrics - Resend-style: clean cards, minimal styling
  return (
    <div className="space-y-4">
      {/* Metrics Grid - Resend style: subtle background cards */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="border rounded-lg p-4">
          <div className="space-y-1">
            <p className="text-xs text-foreground opacity-85">Agents</p>
            <p className="text-xl font-semibold">{metrics?.totalAgents || 0}</p>
            {metrics?.activeAgents !== undefined && metrics.activeAgents > 0 && (
              <p className="text-xs text-foreground opacity-85">{metrics.activeAgents} active</p>
            )}
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="space-y-1">
            <p className="text-xs text-foreground opacity-85">Sessions this week</p>
            <p className="text-xl font-semibold">{metrics?.recentSessions || 0}</p>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="space-y-1">
            <p className="text-xs text-foreground opacity-85">Total sessions</p>
            <p className="text-xl font-semibold">{metrics?.totalSessions || 0}</p>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="space-y-1">
            <p className="text-xs text-foreground opacity-85">In progress</p>
            <p className="text-xl font-semibold">{metrics?.processingAgents || 0}</p>
          </div>
        </div>
      </div>

      {/* Primary Action - Resend style: clean, minimal */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Create a new Screen Agent</h3>
            <p className="mt-0.5 text-xs text-foreground opacity-85">
              Build an AI agent that presents and navigates your website interactively
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/screen-agents/new">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create agent
            </Link>
          </Button>
        </div>
      </div>

      {/* Quick Navigation - Resend style: simple, clean links */}
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/screen-agents" className="border rounded-lg p-4 transition-colors hover:bg-muted/30 block">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">View all agents</p>
              <p className="mt-0.5 text-xs text-foreground opacity-85">
                Manage and configure your Screen Agents
              </p>
            </div>
            <svg
              className="h-4 w-4 text-foreground opacity-60 shrink-0"
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

        <Link href="/analytics" className="border rounded-lg p-4 transition-colors hover:bg-muted/30 block">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">View analytics</p>
              <p className="mt-0.5 text-xs text-foreground opacity-85">
                Detailed insights and performance metrics
              </p>
            </div>
            <svg
              className="h-4 w-4 text-foreground opacity-60 shrink-0"
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
      </div>
    </div>
  )
}
