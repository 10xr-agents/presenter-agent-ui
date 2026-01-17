"use client"

import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

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
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
          <CardDescription className="text-xs">
            Latest presentation sessions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold">No recent activity</EmptyTitle>
              <EmptyDescription className="text-xs">
                Activity will appear here as sessions are created
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
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
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
        <CardDescription className="text-xs">
          Latest presentation sessions
        </CardDescription>
      </CardHeader>
      <CardContent>
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
