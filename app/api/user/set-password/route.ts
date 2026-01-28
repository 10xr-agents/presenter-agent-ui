import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { errorResponse } from "@/lib/utils/api-response"
import {
  invalidatePasswordCache,
  setCachedPasswordStatus,
  userHasPassword,
} from "@/lib/utils/password-check"

/**
 * POST /api/user/set-password
 * 
 * Set password for a user who doesn't have one (e.g., OAuth users)
 * This endpoint uses Better Auth's setPassword API (server-side only)
 */
const setPasswordBodySchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters long").max(128, "Password must be at most 128 characters"),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "You must be logged in to set a password",
      })
    }

    const body = (await req.json()) as unknown
    const validationResult = setPasswordBodySchema.safeParse(body)

    if (!validationResult.success) {
      return errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      })
    }

    const { password } = validationResult.data

    // Double-check: Don't allow setting password if user already has one
    // This prevents accidental password overwrites
    const hasPassword = await userHasPassword(session.user.id)
    if (hasPassword) {
      return errorResponse("PASSWORD_ALREADY_SET", 400, {
        code: "PASSWORD_ALREADY_SET",
        message: "Password is already set. Use change password instead.",
      })
    }

    try {
      // Use Better Auth's setPassword method (server-side only)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authApi = auth.api as any

      const result = await authApi.setPassword({
        body: {
          newPassword: password,
        },
        headers: await headers(),
      })

      if (result.error) {
        Sentry.captureException(new Error(`Better Auth setPassword error: ${result.error.message}`))
        return errorResponse("PASSWORD_SET_ERROR", 400, {
          code: "PASSWORD_SET_ERROR",
          message: result.error.message || "Failed to set password",
        })
      }

      // Invalidate cache and set new status (password is now set)
      invalidatePasswordCache(session.user.id)
      setCachedPasswordStatus(session.user.id, true)

      return NextResponse.json(
        {
          success: true,
          message: "Password set successfully",
        },
        { status: 200 }
      )
    } catch (error: unknown) {
      Sentry.captureException(error)
      const errorMessage = error instanceof Error ? error.message : "Internal server error"
      return errorResponse("INTERNAL_ERROR", 500, {
        code: "INTERNAL_ERROR",
        message: errorMessage,
      })
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    return errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: errorMessage,
    })
  }
}
