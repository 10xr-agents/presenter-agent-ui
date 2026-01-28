import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sessionMessagesResponseSchema } from "@/lib/agent/schemas"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { applyRateLimit } from "@/lib/middleware/rate-limit"
import { Message, Session } from "@/lib/models"
import { errorResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"

/**
 * GET /api/session/[sessionId]/messages
 *
 * Retrieve conversation history for a session.
 * Used by client to hydrate chat view on reload.
 *
 * Query params:
 * - limit (optional, default: 50, max: 200) - Max messages to return
 * - since (optional) - ISO 8601 timestamp to filter messages after
 *
 * Tenant isolation: Only returns messages for sessions owned by authenticated user/tenant.
 * DOM bloat prevention: Excludes full DOMs, only includes domSummary for context.
 *
 * See SERVER_SIDE_AGENT_ARCH.md §4.8.1 for complete specification.
 */

const queryParamsSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .refine((val) => val > 0 && val <= 200, "Limit must be between 1 and 200"),
  since: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .refine((val) => !val || !isNaN(val.getTime()), "Invalid timestamp"),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const params = await context.params
  const startTime = Date.now()
  Sentry.logger.info("Session messages: request received")

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      Sentry.logger.warn("Session messages: rate limit exceeded")
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      Sentry.logger.info("Session messages: unauthorized")
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session/[sessionId]/messages",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { userId, tenantId } = session
    const params = await context.params
    const sessionId = params.sessionId

    if (!sessionId) {
      const debugInfo = buildErrorDebugInfo(new Error("sessionId is required"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]/messages",
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "sessionId is required",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Validate sessionId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(sessionId)) {
      const debugInfo = buildErrorDebugInfo(new Error("Invalid sessionId format"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]/messages",
        sessionId,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid sessionId format",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    await connectDB()

    // Load session and verify ownership (exclude archived sessions - Chrome extension should not use archived)
    const sessionDoc = await (Session as any)
      .findOne({
        sessionId,
        tenantId,
        status: { $ne: "archived" }, // Exclude archived sessions
      })
      .lean()
      .exec()

    if (!sessionDoc) {
      Sentry.logger.info("Session messages: session not found, returning empty")
      // Return empty messages array instead of 404 to prevent Chrome extension retry loops
      // The session may not exist yet (pending creation) or was deleted/archived
      const emptyResponse = {
        sessionId,
        messages: [],
        total: 0,
        sessionExists: false, // Flag to indicate session doesn't exist
      }
      const res = NextResponse.json(emptyResponse, { status: 200 })
      return addCorsHeaders(req, res)
    }

    // Security check: ensure user owns session
    if (sessionDoc.userId !== userId) {
      Sentry.logger.info("Session messages: forbidden (not owner)")
      const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
        code: "UNAUTHORIZED",
        statusCode: 403,
        endpoint: "/api/session/[sessionId]/messages",
        sessionId,
      })
      const err = errorResponse("UNAUTHORIZED", 403, {
        code: "UNAUTHORIZED",
        message: "Unauthorized session access",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Parse query parameters
    const { searchParams } = new URL(req.url)
    const queryParams = {
      limit: searchParams.get("limit") || undefined,
      since: searchParams.get("since") || undefined,
    }

    const validationResult = queryParamsSchema.safeParse(queryParams)

    if (!validationResult.success) {
      Sentry.logger.info("Session messages: query validation failed")
      const debugInfo = buildErrorDebugInfo(new Error("Query parameter validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]/messages",
        queryParams,
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { limit, since } = validationResult.data

    // Build query
    const messageQuery: Record<string, unknown> = {
      sessionId,
      tenantId,
    }

    if (since) {
      messageQuery.timestamp = { $gte: since }
    }

    // Load messages (exclude snapshotId to prevent DOM bloat)
    const messages = await (Message as any)
      .find(messageQuery)
      .select("-snapshotId") // Exclude snapshotId to prevent DOM bloat
      .sort({ sequenceNumber: 1 })
      .limit(limit)
      .lean()
      .exec()

    // Get total count
    const total = await (Message as any).countDocuments(messageQuery).exec()

    // Format response (include all fields per specification)
    const response = {
      sessionId,
      messages: messages.map((m: any) => ({
        messageId: m.messageId,
        role: m.role,
        content: m.content,
        actionPayload: m.actionPayload || undefined,
        actionString: m.actionString || undefined,
        status: m.status || undefined,
        error: m.error || undefined,
        sequenceNumber: m.sequenceNumber,
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
        domSummary: m.domSummary || undefined,
        metadata: m.metadata || undefined,
      })),
      total,
      sessionExists: true, // Flag to indicate session exists (for Chrome extension)
    }

    // Validate response against schema
    const validatedResponse = sessionMessagesResponseSchema.parse(response)

    Sentry.logger.info("Session messages: returning messages", {
      count: response.messages.length,
      total: response.total,
    })
    const duration = Date.now() - startTime
    const res = NextResponse.json(validatedResponse, { status: 200 })

    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.logger.info("Session messages: internal error")
    Sentry.captureException(error, {
      tags: { component: "session-messages", endpoint: "/api/session/[sessionId]/messages" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/[sessionId]/messages",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to fetch messages",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
