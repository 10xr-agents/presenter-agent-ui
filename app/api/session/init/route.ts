import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { applyRateLimit } from "@/lib/middleware/rate-limit"
import { BrowserSession } from "@/lib/models"
import { errorResponse, successResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"
import { extractDomain, generateSessionTitle } from "@/lib/utils/domain"
import { logger } from "@/lib/utils/logger"

/**
 * POST /api/session/init
 *
 * Initializes (creates) a session record so realtime channel auth can succeed
 * before the first interact call.
 *
 * Why:
 * - `/api/pusher/auth` authorizes `private-session-<sessionId>` by verifying ownership
 *   against the Session record.
 * - The extension can generate a new sessionId locally when a new tab is opened, and
 *   may start realtime immediately.
 * - Without a persisted session record, `/api/pusher/auth` returns 403 SESSION_NOT_FOUND.
 *
 * Contract:
 * - Idempotent: If session already exists for this user, update url/domain/tabId and return 200.
 * - Secure: If session exists but belongs to a different user, return 403.
 */

const initBodySchema = z.object({
  sessionId: z.string().uuid(),
  url: z.string().refine((val) => {
    try {
      new URL(val)
      return true
    } catch {
      return false
    }
  }, "Invalid URL"),
  domain: z.string().max(255).optional(),
  title: z.string().max(500).optional(),
  tabId: z.number().int().positive().optional(),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session/init",
      })
      const err = errorResponse(
        "UNAUTHORIZED",
        401,
        { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header" },
        debugInfo
      )
      return addCorsHeaders(req, err)
    }

    const body = (await req.json()) as unknown
    const parsed = initBodySchema.safeParse(body)
    if (!parsed.success) {
      const debugInfo = buildErrorDebugInfo(new Error("Request validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/init",
        validationErrors: parsed.error.issues,
      })
      const err = errorResponse(
        "VALIDATION_ERROR",
        400,
        { code: "VALIDATION_ERROR", errors: parsed.error.issues },
        debugInfo
      )
      return addCorsHeaders(req, err)
    }

    const { sessionId, url, domain: requestDomain, title: requestTitle, tabId } = parsed.data
    const { userId, tenantId } = session

    await connectDB()

    const existing = await (BrowserSession as any)
      .findOne({ sessionId })
      .select("userId tenantId status url domain tabId title isRenamed")
      .lean()
      .exec()

    if (existing) {
      if (existing.userId !== userId) {
        const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
          code: "UNAUTHORIZED",
          statusCode: 403,
          endpoint: "/api/session/init",
          sessionId,
        })
        const err = errorResponse(
          "UNAUTHORIZED",
          403,
          { code: "UNAUTHORIZED", message: "Unauthorized session access" },
          debugInfo
        )
        return addCorsHeaders(req, err)
      }

      if (existing.status === "archived") {
        const debugInfo = buildErrorDebugInfo(new Error("Session is archived"), {
          code: "SESSION_ARCHIVED",
          statusCode: 409,
          endpoint: "/api/session/init",
          sessionId,
        })
        const err = errorResponse(
          "SESSION_ARCHIVED",
          409,
          { code: "SESSION_ARCHIVED", message: "Session is archived; create a new sessionId" },
          debugInfo
        )
        return addCorsHeaders(req, err)
      }

      const nextDomain = requestDomain || extractDomain(url) || undefined
      const update: Record<string, unknown> = {
        url,
        domain: nextDomain,
        ...(tabId ? { tabId } : {}),
      }

      // Only update title if not renamed and caller provided it
      if (existing.isRenamed !== true) {
        if (requestTitle) {
          update.title = requestTitle
        } else if (!existing.title && nextDomain) {
          update.title = generateSessionTitle(nextDomain, "New session")
        }
      }

      await (BrowserSession as any)
        .findOneAndUpdate({ sessionId }, { $set: update })
        .exec()

      const duration = Date.now() - startTime
      logger.info("Session init: updated existing session", { sessionId, duration })
      const res = successResponse({ sessionId, created: false }, undefined, 200)
      return addCorsHeaders(req, res)
    }

    const nextDomain = requestDomain || extractDomain(url) || undefined
    const title =
      requestTitle || (nextDomain ? generateSessionTitle(nextDomain, "New session") : "New session")

    await (BrowserSession as any).create({
      sessionId,
      userId,
      tenantId,
      tabId,
      url,
      domain: nextDomain,
      title,
      isRenamed: false,
      status: "active",
      metadata: {
        initialUrl: url,
        initialDomain: nextDomain,
        initialTabId: tabId,
        createdBy: "session_init",
      },
    })

    const duration = Date.now() - startTime
    logger.info("Session init: created session", { sessionId, duration })
    const res = successResponse({ sessionId, created: true }, undefined, 200)
    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.captureException(error)
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/init",
    })
    const err = errorResponse(
      "INTERNAL_ERROR",
      500,
      { code: "INTERNAL_ERROR", message: "Failed to init session" },
      debugInfo
    )
    return addCorsHeaders(req, err)
  }
}

