import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getUserNotifications, markNotificationAsRead } from "@/lib/notifications/manager"

/**
 * GET /api/notifications - Get user notifications
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status")
  const type = searchParams.get("type") as
    | "session_completed"
    | "session_started"
    | "usage_limit_warning"
    | "usage_limit_reached"
    | "billing_alert"
    | "team_invite"
    | "organization_upgrade"
    | "system_alert"
    | null
  const limit = parseInt(searchParams.get("limit") || "50", 10)
  const offset = parseInt(searchParams.get("offset") || "0", 10)

  try {
    const notifications = await getUserNotifications(session.user.id, {
      status: status as "pending" | "sent" | "failed" | "read" | undefined,
      type: type || undefined,
      limit,
      offset,
    })

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n._id.toString(),
        type: n.type,
        title: n.title,
        message: n.message,
        metadata: n.metadata,
        channels: n.channels,
        status: n.status,
        sentAt: n.sentAt,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    })
  } catch (error: unknown) {
    console.error("Notifications API error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to get notifications" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/notifications - Mark notification as read
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    notificationId?: string
  }

  const { notificationId } = body

  if (!notificationId) {
    return NextResponse.json(
      { error: "notificationId is required" },
      { status: 400 }
    )
  }

  try {
    const notification = await markNotificationAsRead(notificationId)

    if (!notification) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      )
    }

    // Verify ownership
    if (notification.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    return NextResponse.json({
      notification: {
        id: notification._id.toString(),
        status: notification.status,
        readAt: notification.readAt,
      },
    })
  } catch (error: unknown) {
    console.error("Mark notification as read error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to mark notification as read" },
      { status: 500 }
    )
  }
}
