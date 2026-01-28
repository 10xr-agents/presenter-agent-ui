import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { preferencesRequestSchema } from "@/lib/api/schemas/preferences"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { UserPreference } from "@/lib/models/user-preference"
import { errorResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"

/**
 * OPTIONS /api/v1/user/preferences
 * 
 * Handle CORS preflight requests from Chrome extension.
 */
export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight || new NextResponse(null, { status: 204 })
}

/**
 * GET /api/v1/user/preferences
 * 
 * Fetch user preferences for the authenticated tenant.
 * Returns preferences or default values if not found.
 */
export async function GET(req: NextRequest) {
  try {
    // Extract and validate Bearer token
    const session = await getSessionFromRequest(req.headers)

    if (!session) {
      const errorResp = errorResponse("Unauthorized", 401, {
        code: "UNAUTHORIZED",
        message: "Invalid or missing authentication token",
      })
      return addCorsHeaders(req, errorResp)
    }

    const { tenantId, userId } = session

    // Ensure database connection
    await connectDB()

    // Query preferences by tenantId
    const preference = await (UserPreference as any).findOne({ tenantId })

    // Return preferences or defaults
    if (preference) {
      const response = NextResponse.json(
        {
          preferences: {
            theme: preference.preferences?.theme || "system",
          },
          syncedAt: preference.syncedAt?.toISOString(),
        },
        { status: 200 }
      )
      return addCorsHeaders(req, response)
    }

    // Return defaults if no preferences exist
    const response = NextResponse.json(
      {
        preferences: {
          theme: "system",
        },
      },
      { status: 200 }
    )
    return addCorsHeaders(req, response)
  } catch (error: unknown) {
    Sentry.captureException(error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    const errorResp = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: errorMessage,
    })
    return addCorsHeaders(req, errorResp)
  }
}

/**
 * POST /api/v1/user/preferences
 * 
 * Upsert user preferences for the authenticated tenant.
 * Creates new preference record or updates existing one.
 */
export async function POST(req: NextRequest) {
  try {
    // Extract and validate Bearer token
    const session = await getSessionFromRequest(req.headers)

    if (!session) {
      const errorResp = errorResponse("Unauthorized", 401, {
        code: "UNAUTHORIZED",
        message: "Invalid or missing authentication token",
      })
      return addCorsHeaders(req, errorResp)
    }

    const { tenantId, userId } = session

    // Parse and validate request body
    const body = (await req.json()) as unknown
    const validationResult = preferencesRequestSchema.safeParse(body)

    if (!validationResult.success) {
      const errorResp = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      })
      return addCorsHeaders(req, errorResp)
    }

    const { theme } = validationResult.data

    // Ensure database connection
    await connectDB()

    // Upsert preference (findOneAndUpdate with upsert: true)
    const preference = await (UserPreference as any).findOneAndUpdate(
      { tenantId },
      {
        $set: {
          tenantId,
          userId,
          "preferences.theme": theme,
          syncedAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    )

    // Return success response
    const response = NextResponse.json(
      {
        success: true,
        preferences: {
          theme: preference.preferences.theme,
        },
        syncedAt: preference.syncedAt.toISOString(),
      },
      { status: 200 }
    )
    return addCorsHeaders(req, response)
  } catch (error: unknown) {
    Sentry.captureException(error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    const errorResp = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: errorMessage,
    })
    return addCorsHeaders(req, errorResp)
  }
}
