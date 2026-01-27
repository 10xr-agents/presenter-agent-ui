import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import * as Sentry from "@sentry/nextjs"
import { connectDB } from "@/lib/db/mongoose"
import { Session, Message } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/session"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"
import { latestSessionResponseSchema } from "@/lib/agent/schemas"
import { applyRateLimit } from "@/lib/middleware/rate-limit"

/**
 * GET /api/session/latest
 *
 * Get the most recent active session for the user.
 * Used by client to resume conversation.
 *
 * Query params:
 * - status (optional) - Filter by session status (default: 'active')
 *
 * Tenant isolation: Only returns sessions owned by authenticated user/tenant.
 * Returns 404 if no session found (not null).
 *
 * See SERVER_SIDE_AGENT_ARCH.md §4.8.2 for complete specification.
 */

const queryParamsSchema = z.object({
  status: z.enum(["active", "completed", "failed", "interrupted", "archived"]).optional().default("active"),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session/latest",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { userId, tenantId } = session

    await connectDB()

    // Parse query parameters
    const { searchParams } = new URL(req.url)
    const queryParams = {
      status: searchParams.get("status") || "active",
    }

    const validationResult = queryParamsSchema.safeParse(queryParams)

    if (!validationResult.success) {
      const debugInfo = buildErrorDebugInfo(new Error("Query parameter validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/latest",
        queryParams,
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { status } = validationResult.data

    // Find latest session for user/tenant with specified status
    // Sort by updatedAt descending (most recently updated) per specification
    // Chrome extension: Exclude archived sessions by default (unless explicitly requested)
    const filter: Record<string, unknown> = {
      userId,
      tenantId,
    }
    
    if (status === "archived") {
      // If explicitly requesting archived, show archived
      filter.status = "archived"
    } else {
      // Default: exclude archived sessions (Chrome extension compatibility)
      // If status is provided, use it; otherwise default to active
      filter.status = status || "active"
    }

    const latestSession = await (Session as any)
      .findOne(filter)
      .sort({ updatedAt: -1 })
      .lean()
      .exec()

    if (!latestSession) {
      // Return 404 if no session found (per specification, not null)
      const debugInfo = buildErrorDebugInfo(new Error("No session found"), {
        code: "SESSION_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session/latest",
        status,
      })
      const err = errorResponse("SESSION_NOT_FOUND", 404, {
        code: "SESSION_NOT_FOUND",
        message: `No ${status} session found for user`,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Get message count for this session
    const messageCount = await (Message as any)
      .countDocuments({
        sessionId: latestSession.sessionId,
        tenantId,
      })
      .exec()

    // Format response (include all fields per specification)
    const response = {
      sessionId: latestSession.sessionId,
      url: latestSession.url,
      status: latestSession.status,
      createdAt: latestSession.createdAt ? new Date(latestSession.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: latestSession.updatedAt ? new Date(latestSession.updatedAt).toISOString() : new Date().toISOString(),
      messageCount,
      metadata: latestSession.metadata || undefined,
    }

    // Validate response against schema
    const validatedResponse = latestSessionResponseSchema.parse(response)

    const duration = Date.now() - startTime
    const res = NextResponse.json(validatedResponse, { status: 200 })

    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "session-latest", endpoint: "/api/session/latest" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/latest",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to fetch latest session",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
