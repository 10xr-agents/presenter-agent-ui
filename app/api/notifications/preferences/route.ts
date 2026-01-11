import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications/manager"

/**
 * GET /api/notifications/preferences - Get user notification preferences
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const preferences = await getNotificationPreferences(session.user.id)

    return NextResponse.json({
      preferences: {
        userId: preferences.userId,
        emailEnabled: preferences.emailEnabled,
        inAppEnabled: preferences.inAppEnabled,
        pushEnabled: preferences.pushEnabled,
        preferences: Object.fromEntries(preferences.preferences || new Map()),
      },
    })
  } catch (error: unknown) {
    console.error("Notification preferences API error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to get notification preferences" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/notifications/preferences - Update user notification preferences
 */
export async function PUT(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    preferences?: Record<string, string[]>
    emailEnabled?: boolean
    inAppEnabled?: boolean
    pushEnabled?: boolean
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {}

    if (body.emailEnabled !== undefined) {
      updates.emailEnabled = body.emailEnabled
    }
    if (body.inAppEnabled !== undefined) {
      updates.inAppEnabled = body.inAppEnabled
    }
    if (body.pushEnabled !== undefined) {
      updates.pushEnabled = body.pushEnabled
    }
    if (body.preferences) {
      // Convert to Record format for storage
      updates.preferences = body.preferences
    }

    const preferences = await updateNotificationPreferences(session.user.id, updates)

    if (!preferences) {
      return NextResponse.json(
        { error: "Failed to update preferences" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      preferences: {
        userId: preferences.userId,
        emailEnabled: preferences.emailEnabled,
        inAppEnabled: preferences.inAppEnabled,
        pushEnabled: preferences.pushEnabled,
        preferences: Object.fromEntries(preferences.preferences || new Map()),
      },
    })
  } catch (error: unknown) {
    console.error("Update notification preferences error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update notification preferences" },
      { status: 500 }
    )
  }
}
