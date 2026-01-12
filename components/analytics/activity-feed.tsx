"use client"

import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

interface ActivityItem {
  id: string
  screenAgentId: string
  screenAgentName: string
  viewerEmail?: string
  viewerName?: string
  status: "completed" | "abandoned" | "error"
  durationSeconds: number
  startedAt: Date | string
}

interface ActivityFeedProps {
  activities: ActivityItem[]
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  if (activities.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Recent Activity</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Latest presentation sessions
            </p>
          </div>
          <p className="text-sm text-muted-foreground">No recent activity</p>
        </CardContent>
      </Card>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="text-xs">Completed</Badge>
      case "abandoned":
        return <Badge variant="secondary" className="text-xs">Abandoned</Badge>
      case "error":
        return <Badge variant="destructive" className="text-xs">Error</Badge>
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>
    }
  }

  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Recent Activity</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Latest presentation sessions
          </p>
        </div>
        <div className="space-y-3">
          {activities.map((activity) => {
            const startedAt = typeof activity.startedAt === "string"
              ? new Date(activity.startedAt)
              : activity.startedAt
            const durationMinutes = Math.ceil(activity.durationSeconds / 60)

            return (
              <div key={activity.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{activity.screenAgentName}</p>
                    {getStatusBadge(activity.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {activity.viewerName || activity.viewerEmail || "Anonymous viewer"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(startedAt, { addSuffix: true })} • {durationMinutes} min
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
