"use client"

import { formatDistanceToNow } from "date-fns"
import { Bell } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
  channels: string[]
  status: "pending" | "sent" | "failed" | "read"
  sentAt?: string
  readAt?: string
  createdAt: string
}

interface NotificationListProps {
  limit?: number
}

export function NotificationList({ limit = 50 }: NotificationListProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/notifications?limit=${limit}`)
      const result = (await response.json()) as { notifications: Notification[] } | { error?: string }
      if (!response.ok) {
        throw new Error((result as { error?: string }).error || "Failed to fetch notifications")
      }
      setNotifications((result as { notifications: Notification[] }).notifications)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      })

      if (!response.ok) {
        throw new Error("Failed to mark notification as read")
      }

      // Update local state
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, status: "read" as const, readAt: new Date().toISOString() } : n
        )
      )
    } catch (err: unknown) {
      console.error("Error marking notification as read:", err)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [limit])

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
        <Button onClick={fetchNotifications} className="mt-2" variant="outline">
          Retry
        </Button>
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Your recent notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Bell className="h-12 w-12 mb-4 opacity-50" />
            <p>No notifications</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const unreadCount = notifications.filter((n) => n.status !== "read").length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Your recent notifications</CardDescription>
          </div>
          {unreadCount > 0 && (
            <Badge variant="default">{unreadCount} unread</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {notifications.map((notification) => {
            const isRead = notification.status === "read"
            const createdAt = new Date(notification.createdAt)

            return (
              <div
                key={notification.id}
                className={`flex items-start justify-between border-b pb-4 last:border-0 last:pb-0 ${
                  !isRead ? "bg-muted/50 -mx-4 px-4 py-2 rounded" : ""
                }`}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium ${!isRead ? "font-semibold" : ""}`}>
                      {notification.title}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {notification.type.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{notification.message}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{formatDistanceToNow(createdAt, { addSuffix: true })}</span>
                    <div className="flex gap-1">
                      {notification.channels.map((channel) => (
                        <Badge key={channel} variant="secondary" className="text-xs">
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                {!isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAsRead(notification.id)}
                    className="ml-4"
                  >
                    Mark as read
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
