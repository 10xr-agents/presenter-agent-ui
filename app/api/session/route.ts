import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { applyRateLimit } from "@/lib/middleware/rate-limit"
import { Message, Session } from "@/lib/models"
import { errorResponse, successResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"

/**
 * GET /api/session
 *
 * List all chat sessions for the authenticated user.
 * Supports filtering by status and pagination.
 *
 * Query params:
 * - status (optional) - Filter by session status (default: 'active', excludes 'archived' by default)
 * - includeArchived (optional, boolean) - Include archived sessions (default: false)
 * - limit (optional, default: 20, max: 100) - Number of sessions to return
 * - offset (optional, default: 0) - Pagination offset
 *
 * Tenant isolation: Only returns sessions owned by authenticated user/tenant.
 * Archived sessions are excluded by default (for Chrome extension compatibility).
 *
 * POST /api/session
 *
 * Archive a session (mark as archived).
 * Archived sessions are not used by Chrome extension but available in UI for auditing.
 *
 * Body:
 * - sessionId (required) - Session ID to archive
 */

const listQueryParamsSchema = z.object({
  status: z.enum(["active", "completed", "failed", "interrupted", "archived"]).optional(),
  includeArchived: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1"),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .refine((val) => val > 0 && val <= 100, "Limit must be between 1 and 100"),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .refine((val) => val >= 0, "Offset must be non-negative"),
})

const archiveBodySchema = z.object({
  sessionId: z
    .string()
    .refine((val) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(val)
    }, "Invalid sessionId format"),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  Sentry.logger.info("Session list: request received")

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      Sentry.logger.warn("Session list: rate limit exceeded")
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      Sentry.logger.info("Session list: unauthorized")
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session",
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
      status: searchParams.get("status") || undefined,
      includeArchived: searchParams.get("includeArchived") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    }

    const validationResult = listQueryParamsSchema.safeParse(queryParams)

    if (!validationResult.success) {
      Sentry.logger.info("Session list: query validation failed")
      const debugInfo = buildErrorDebugInfo(new Error("Query parameter validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session",
        queryParams,
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { status, includeArchived = false, limit, offset } = validationResult.data

    // Build query filter
    const filter: Record<string, unknown> = {
      userId,
      tenantId,
    }

    // Status filtering logic:
    // - If status is provided, filter by that status
    // - If includeArchived is false (default), exclude archived sessions
    // - If status is not provided and includeArchived is false, default to 'active'
    if (status) {
      filter.status = status
    } else if (!includeArchived) {
      // Default: only show active sessions (exclude archived)
      filter.status = "active"
    } else {
      // includeArchived is true and no status filter - show all except archived
      filter.status = { $ne: "archived" }
    }

    // Query sessions with pagination
    const [sessions, total] = await Promise.all([
      (Session as any)
        .find(filter)
        .sort({ updatedAt: -1 }) // Most recently updated first
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      (Session as any).countDocuments(filter).exec(),
    ])

    // Get message counts for each session
    const sessionsWithCounts = await Promise.all(
      sessions.map(async (session: any) => {
        const messageCount = await (Message as any)
          .countDocuments({
            sessionId: session.sessionId,
            tenantId,
          })
          .exec()

        return {
          sessionId: session.sessionId,
          title: session.title || undefined,
          domain: session.domain || undefined,
          url: session.url,
          status: session.status,
          isRenamed: session.isRenamed || false,
          createdAt: session.createdAt ? new Date(session.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: session.updatedAt ? new Date(session.updatedAt).toISOString() : new Date().toISOString(),
          messageCount,
          metadata: session.metadata || undefined,
        }
      })
    )

    const response = {
      sessions: sessionsWithCounts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    }

    Sentry.logger.info("Session list: returning sessions", {
      count: sessionsWithCounts.length,
      total,
    })
    const duration = Date.now() - startTime
    const res = successResponse(response, undefined, 200)
    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.logger.info("Session list: internal error")
    Sentry.captureException(error, {
      tags: { component: "session-list", endpoint: "/api/session" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to fetch sessions",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  Sentry.logger.info("Session archive: request received")

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      Sentry.logger.warn("Session archive: rate limit exceeded")
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      Sentry.logger.info("Session archive: unauthorized")
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { userId, tenantId } = session

    await connectDB()

    // Parse and validate body
    const requestBody = (await req.json()) as unknown
    const validationResult = archiveBodySchema.safeParse(requestBody)

    if (!validationResult.success) {
      Sentry.logger.info("Session archive: body validation failed")
      const debugInfo = buildErrorDebugInfo(new Error("Request validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session",
        requestData: requestBody,
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { sessionId } = validationResult.data

    // Find session and verify ownership
    const targetSession = await (Session as any)
      .findOne({
        sessionId,
        tenantId,
      })
      .lean()
      .exec()

    if (!targetSession) {
      Sentry.logger.info("Session archive: session not found")
      const debugInfo = buildErrorDebugInfo(new Error(`Session ${sessionId} not found for tenant`), {
        code: "SESSION_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session",
        sessionId,
      })
      const err = errorResponse("SESSION_NOT_FOUND", 404, {
        code: "SESSION_NOT_FOUND",
        message: `Session ${sessionId} not found for tenant`,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Security check: ensure user owns session
    if (targetSession.userId !== userId) {
      Sentry.logger.info("Session archive: forbidden (not owner)")
      const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
        code: "UNAUTHORIZED",
        statusCode: 403,
        endpoint: "/api/session",
        sessionId,
      })
      const err = errorResponse("UNAUTHORIZED", 403, {
        code: "UNAUTHORIZED",
        message: "Unauthorized session access",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    Sentry.logger.info("Session archive: archiving session")
    // Archive the session (update status to 'archived')
    await (Session as any)
      .findOneAndUpdate(
        { sessionId, tenantId },
        {
          $set: {
            status: "archived",
          },
        }
      )
      .exec()

    const duration = Date.now() - startTime
    const response = {
      success: true,
      sessionId,
      status: "archived",
      message: "Session archived successfully",
    }

    Sentry.logger.info("Session archive: completed")
    const res = successResponse(response, "Session archived successfully", 200)
    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.logger.info("Session archive: internal error")
    Sentry.captureException(error, {
      tags: { component: "session-archive", endpoint: "/api/session" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to archive session",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
