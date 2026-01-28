"use client"

import { ChevronRight, Chrome, Clock, MessageSquare, Zap } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

interface OverviewMetrics {
  totalSessions: number
  recentSessions: number
  totalTokens: number
  estimatedTimeSaved: number // in minutes
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

  const hasSessions = (metrics?.totalSessions || 0) > 0

  // Empty state - Install Extension CTA
  if (!hasSessions) {
    return (
      <div className="space-y-6">
        {/* Install Extension CTA */}
        <Card className="bg-muted/30 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Chrome className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-sm font-semibold">Get Started with Browser Copilot</CardTitle>
                  <CardDescription className="text-xs">
                    Install the Chrome Extension to start automating your browser tasks with AI
                  </CardDescription>
                </div>
              </div>
              <Button asChild size="sm">
                <a
                  href="https://chrome.google.com/webstore"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Chrome className="mr-2 h-3.5 w-3.5" />
                  Install Extension
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Empty State */}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquare className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold">No activity yet</EmptyTitle>
            <EmptyDescription className="text-xs">
              Once you install and use the Browser Copilot extension, your activity will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  // Dashboard with metrics
  return (
    <div className="space-y-6">
      {/* Install Extension CTA - Always visible */}
      <Card className="bg-muted/30 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <Chrome className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-sm font-semibold">Browser Copilot Extension</CardTitle>
                <CardDescription className="text-xs">
                  Use the Chrome Extension for AI-powered browser automation
                </CardDescription>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <a
                href="https://chrome.google.com/webstore"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Chrome className="mr-2 h-3.5 w-3.5" />
                Open Extension
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Tasks Today</p>
              <p className="text-2xl font-semibold">{metrics?.recentSessions || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Total Tasks</p>
              <p className="text-2xl font-semibold">{metrics?.totalSessions || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Time Saved</p>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-semibold">{metrics?.estimatedTimeSaved || 0}</p>
                <p className="text-xs text-muted-foreground">min</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Tokens Used</p>
              <p className="text-2xl font-semibold">
                {(metrics?.totalTokens || 0).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-muted/30 transition-colors hover:bg-muted/50 cursor-pointer group">
          <CardContent className="pt-6">
            <Link href="/chats" className="block">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
                      View all chats
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Browse your session history and activity log
                    </CardDescription>
                  </div>
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
                <div className="flex items-start gap-3">
                  <Zap className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
                      View analytics
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Token usage, costs, and performance metrics
                    </CardDescription>
                  </div>
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
