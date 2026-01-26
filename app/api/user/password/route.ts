import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { invalidatePasswordCache, setCachedPasswordStatus } from "@/lib/utils/password-check"

/**
 * PATCH /api/user/password - Change user password
 */
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    currentPassword: string
    newPassword: string
    revokeOtherSessions?: boolean
  }

  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json(
      { error: "Current password and new password are required" },
      { status: 400 }
    )
  }

  if (body.newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters long" },
      { status: 400 }
    )
  }

  try {
    // Use Better Auth's changePassword method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any

    const result = await authApi.changePassword({
      headers: await headers(),
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: body.revokeOtherSessions ?? true,
      },
    })

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || "Failed to change password" },
        { status: 400 }
      )
    }

    // Invalidate cache and set new status (password still exists, just changed)
    invalidatePasswordCache(session.user.id)
    setCachedPasswordStatus(session.user.id, true)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error changing password:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to change password" },
      { status: 500 }
    )
  }
}
