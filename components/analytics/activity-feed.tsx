"use client"

import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest presentation sessions</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No recent activity</p>
        </CardContent>
      </Card>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default">Completed</Badge>
      case "abandoned":
        return <Badge variant="secondary">Abandoned</Badge>
      case "error":
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest presentation sessions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => {
            const startedAt = typeof activity.startedAt === "string"
              ? new Date(activity.startedAt)
              : activity.startedAt
            const durationMinutes = Math.ceil(activity.durationSeconds / 60)

            return (
              <div key={activity.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{activity.screenAgentName}</p>
                    {getStatusBadge(activity.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
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
