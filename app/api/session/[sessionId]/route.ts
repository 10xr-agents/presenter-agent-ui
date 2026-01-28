import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import * as Sentry from "@sentry/nextjs"
import { connectDB } from "@/lib/db/mongoose"
import { Session } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/session"
import { errorResponse, successResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"
import { applyRateLimit } from "@/lib/middleware/rate-limit"

/**
 * PATCH /api/session/[sessionId]
 *
 * Rename a session with a custom title.
 * Domain prefix is preserved in title format.
 *
 * Request Body:
 * - title (required) - New session title
 *
 * Response:
 * {
 *   success: true,
 *   session: { sessionId, title, updatedAt }
 * }
 *
 * See Domain-Aware Sessions documentation for details.
 */

const renameBodySchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(500, "Title must be 500 characters or less"),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const startTime = Date.now()
  Sentry.logger.info("Session update (rename): request received")

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      Sentry.logger.warn("Session update: rate limit exceeded")
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      Sentry.logger.info("Session update: unauthorized")
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session/[sessionId]",
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
        endpoint: "/api/session/[sessionId]",
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
        endpoint: "/api/session/[sessionId]",
        sessionId,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid sessionId format",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    await connectDB()

    // Parse and validate request body
    const requestBody = (await req.json()) as unknown
    const validationResult = renameBodySchema.safeParse(requestBody)

    if (!validationResult.success) {
      Sentry.logger.info("Session update: body validation failed")
      const debugInfo = buildErrorDebugInfo(new Error("Request validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]",
        requestData: requestBody,
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { title } = validationResult.data

    // Find session and verify ownership
    const targetSession = await (Session as any)
      .findOne({
        sessionId,
        tenantId,
      })
      .lean()
      .exec()

    if (!targetSession) {
      Sentry.logger.info("Session update: session not found")
      const debugInfo = buildErrorDebugInfo(new Error(`Session ${sessionId} not found for tenant`), {
        code: "SESSION_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session/[sessionId]",
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
      Sentry.logger.info("Session update: forbidden (not owner)")
      const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
        code: "UNAUTHORIZED",
        statusCode: 403,
        endpoint: "/api/session/[sessionId]",
        sessionId,
      })
      const err = errorResponse("UNAUTHORIZED", 403, {
        code: "UNAUTHORIZED",
        message: "Unauthorized session access",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    Sentry.logger.info("Session update: renaming session")
    // Update session title and set isRenamed flag
    const updatedSession = await (Session as any)
      .findOneAndUpdate(
        { sessionId, tenantId },
        {
          $set: {
            title,
            isRenamed: true, // Mark as renamed to prevent auto-title updates
          },
        },
        { new: true }
      )
      .lean()
      .exec()

    const duration = Date.now() - startTime
    const response = {
      success: true,
      session: {
        sessionId: updatedSession.sessionId,
        title: updatedSession.title,
        updatedAt: updatedSession.updatedAt
          ? new Date(updatedSession.updatedAt).getTime()
          : Date.now(),
      },
    }

    Sentry.logger.info("Session update: completed")
    const res = successResponse(response, "Session renamed successfully", 200)
    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.logger.info("Session update: internal error")
    Sentry.captureException(error, {
      tags: { component: "session-rename", endpoint: "/api/session/[sessionId]" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/[sessionId]",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to rename session",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}

/**
 * GET /api/session/[sessionId]
 *
 * Get a single session by ID.
 *
 * Response:
 * {
 *   session: { sessionId, title, domain, url, status, isRenamed, createdAt, updatedAt, messageCount }
 * }
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const startTime = Date.now()
  Sentry.logger.info("Session get: request received")

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      Sentry.logger.warn("Session get: rate limit exceeded")
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      Sentry.logger.info("Session get: unauthorized")
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session/[sessionId]",
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
        endpoint: "/api/session/[sessionId]",
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
        endpoint: "/api/session/[sessionId]",
        sessionId,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid sessionId format",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    await connectDB()

    // Find session and verify ownership
    const targetSession = await (Session as any)
      .findOne({
        sessionId,
        tenantId,
      })
      .lean()
      .exec()

    if (!targetSession) {
      Sentry.logger.info("Session get: session not found")
      const debugInfo = buildErrorDebugInfo(new Error(`Session ${sessionId} not found for tenant`), {
        code: "SESSION_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session/[sessionId]",
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
      Sentry.logger.info("Session get: forbidden (not owner)")
      const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
        code: "UNAUTHORIZED",
        statusCode: 403,
        endpoint: "/api/session/[sessionId]",
        sessionId,
      })
      const err = errorResponse("UNAUTHORIZED", 403, {
        code: "UNAUTHORIZED",
        message: "Unauthorized session access",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    Sentry.logger.info("Session get: returning session")
    const duration = Date.now() - startTime
    const response = {
      session: {
        sessionId: targetSession.sessionId,
        title: targetSession.title || undefined,
        domain: targetSession.domain || undefined,
        url: targetSession.url,
        status: targetSession.status,
        isRenamed: targetSession.isRenamed || false,
        createdAt: targetSession.createdAt
          ? new Date(targetSession.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: targetSession.updatedAt
          ? new Date(targetSession.updatedAt).toISOString()
          : new Date().toISOString(),
        metadata: targetSession.metadata || undefined,
      },
    }

    const res = successResponse(response, undefined, 200)
    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.logger.info("Session get: internal error")
    Sentry.captureException(error, {
      tags: { component: "session-get", endpoint: "/api/session/[sessionId]" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/[sessionId]",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to fetch session",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
