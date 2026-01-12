import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/notifications/manager"

/**
 * GET /api/user/preferences - Get user preferences
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Get notification preferences
    const notificationPrefs = await getNotificationPreferences(session.user.id)

    // TODO: Store other preferences (theme, language) in user model or separate collection
    // For now, return notification preferences and defaults
    return NextResponse.json({
      preferences: {
        theme: "system", // Default, will be managed by next-themes
        language: "en", // Default
        emailNotifications: notificationPrefs?.emailEnabled ?? true,
        inAppNotifications: notificationPrefs?.inAppEnabled ?? true,
      },
    })
  } catch (error: unknown) {
    console.error("Error fetching user preferences:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to fetch preferences" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/user/preferences - Update user preferences
 */
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    theme?: string
    language?: string
    emailNotifications?: boolean
    inAppNotifications?: boolean
  }

  try {
    // Update notification preferences
    if (body.emailNotifications !== undefined || body.inAppNotifications !== undefined) {
      await updateNotificationPreferences(session.user.id, {
        emailEnabled: body.emailNotifications,
        inAppEnabled: body.inAppNotifications,
      })
    }

    // TODO: Store theme and language preferences in user model or separate collection
    // For now, theme is managed by next-themes (client-side only)
    // Language preference can be stored in user model or cookies

    return NextResponse.json({
      success: true,
      preferences: {
        theme: body.theme,
        language: body.language,
        emailNotifications: body.emailNotifications,
        inAppNotifications: body.inAppNotifications,
      },
    })
  } catch (error: unknown) {
    console.error("Error updating user preferences:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update preferences" },
      { status: 500 }
    )
  }
}
