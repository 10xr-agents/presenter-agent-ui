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
 * GET /api/session/by-domain/[domain]
 *
 * Find the most recent active session for a domain.
 * Used by Chrome extension for domain-aware session switching.
 *
 * Query params:
 * - status (optional, default: "active") - Filter by session status
 *
 * Response:
 * {
 *   session: { sessionId, title, domain, url, status, isRenamed, updatedAt, messageCount } | null
 * }
 *
 * See Domain-Aware Sessions documentation for details.
 */

const queryParamsSchema = z.object({
  status: z.enum(["active", "completed", "failed", "interrupted", "archived"]).optional(),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ domain: string }> }
) {
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
        endpoint: "/api/session/by-domain/[domain]",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { userId, tenantId } = session
    const params = await context.params
    const domain = decodeURIComponent(params.domain)

    if (!domain) {
      const debugInfo = buildErrorDebugInfo(new Error("domain is required"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/by-domain/[domain]",
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "domain is required",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Validate domain format (basic validation)
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*$|^localhost$/
    if (!domainRegex.test(domain)) {
      const debugInfo = buildErrorDebugInfo(new Error("Invalid domain format"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/by-domain/[domain]",
        domain,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid domain format",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    await connectDB()

    // Parse query parameters
    const { searchParams } = new URL(req.url)
    const queryParams = {
      status: searchParams.get("status") || undefined,
    }

    const validationResult = queryParamsSchema.safeParse(queryParams)

    if (!validationResult.success) {
      const debugInfo = buildErrorDebugInfo(new Error("Query parameter validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/by-domain/[domain]",
        queryParams,
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { status = "active" } = validationResult.data

    // Find the most recent session for this domain
    const filter: Record<string, unknown> = {
      userId,
      tenantId,
      domain,
      status,
    }

    const targetSession = await (Session as any)
      .findOne(filter)
      .sort({ updatedAt: -1 }) // Most recently updated first
      .lean()
      .exec()

    if (!targetSession) {
      // Return null session (not 404) - this is expected when no session exists for domain
      const response = {
        session: null,
      }
      const res = successResponse(response, undefined, 200)
      return addCorsHeaders(req, res)
    }

    // Get message count
    const messageCount = await (Message as any)
      .countDocuments({
        sessionId: targetSession.sessionId,
        tenantId,
      })
      .exec()

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
        messageCount,
        metadata: targetSession.metadata || undefined,
      },
    }

    const res = successResponse(response, undefined, 200)
    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "session-by-domain", endpoint: "/api/session/by-domain/[domain]" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/by-domain/[domain]",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to fetch session by domain",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
