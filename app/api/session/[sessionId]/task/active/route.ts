import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { applyRateLimit } from "@/lib/middleware/rate-limit"
import { BrowserSession, Task } from "@/lib/models"
import { errorResponse, successResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"

/**
 * GET /api/session/[sessionId]/task/active
 *
 * Get the most recent active task for a session.
 * Used by extension to recover taskId when client-side storage fails
 * (e.g., page refresh, extension restart, chrome.storage.local cleared).
 *
 * This is a **safety-net endpoint** — the primary mechanism for taskId
 * persistence should be client-side storage (chrome.storage.local keyed by tabId).
 *
 * Query params:
 * - url (optional) - Filter by current tab URL for more accurate recovery
 *
 * Response:
 * {
 *   taskId: string,
 *   query: string,
 *   status: string,
 *   currentStepIndex: number,
 *   createdAt: string,
 *   updatedAt: string
 * }
 *
 * Returns 404 if no active task found (not an error — client should start new task).
 *
 * See INTERACT_FLOW_WALKTHROUGH.md § Client contract for full specification.
 */

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const startTime = Date.now()
  Sentry.logger.info("Task active: request received")

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      Sentry.logger.warn("Task active: rate limit exceeded")
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      Sentry.logger.info("Task active: unauthorized")
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session/[sessionId]/task/active",
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
        endpoint: "/api/session/[sessionId]/task/active",
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
        endpoint: "/api/session/[sessionId]/task/active",
        sessionId,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid sessionId format",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    await connectDB()

    // Parse optional URL filter from query params
    const { searchParams } = new URL(req.url)
    const urlFilter = searchParams.get("url")

    // Verify session exists and belongs to user
    const targetSession = await (BrowserSession as any)
      .findOne({
        sessionId,
        tenantId,
      })
      .lean()
      .exec()

    if (!targetSession) {
      Sentry.logger.info("Task active: session not found")
      const debugInfo = buildErrorDebugInfo(new Error(`Session ${sessionId} not found for tenant`), {
        code: "SESSION_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session/[sessionId]/task/active",
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
      Sentry.logger.info("Task active: forbidden (not owner)")
      const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
        code: "UNAUTHORIZED",
        statusCode: 403,
        endpoint: "/api/session/[sessionId]/task/active",
        sessionId,
      })
      const err = errorResponse("UNAUTHORIZED", 403, {
        code: "UNAUTHORIZED",
        message: "Unauthorized session access",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Lazy expiration: mark tasks untouched for >30 minutes as interrupted (zombie cleanup)
    const STALE_TASK_MINUTES = 30
    const staleThreshold = new Date(Date.now() - STALE_TASK_MINUTES * 60 * 1000)
    const activeStatusesForExpiry = ["active", "planning", "executing", "verifying", "correcting"]
    const expiredResult = await (Task as any)
      .updateMany(
        {
          tenantId,
          userId,
          status: { $in: activeStatusesForExpiry },
          updatedAt: { $lt: staleThreshold },
        },
        { $set: { status: "interrupted" } }
      )
      .exec()
    if (expiredResult.modifiedCount > 0) {
      Sentry.logger.info("Task active: expired stale tasks", {
        modifiedCount: expiredResult.modifiedCount,
        thresholdMinutes: STALE_TASK_MINUTES,
      })
    }

    // Build query for active tasks
    // Active statuses: active, planning, executing, verifying, correcting
    const activeStatuses = ["active", "planning", "executing", "verifying", "correcting"]
    const taskQuery: Record<string, unknown> = {
      tenantId,
      userId,
      status: { $in: activeStatuses },
    }

    // If URL filter provided, try to find a task matching that URL
    // This helps when user has multiple tabs open
    if (urlFilter) {
      // First try exact URL match
      const exactMatchTask = await (Task as any)
        .findOne({
          ...taskQuery,
          url: urlFilter,
        })
        .sort({ updatedAt: -1 })
        .lean()
        .exec()

      if (exactMatchTask) {
        Sentry.logger.info("Task active: found task with exact URL match", {
          taskId: exactMatchTask.taskId,
        })
        const duration = Date.now() - startTime
        const response = {
          taskId: exactMatchTask.taskId,
          query: exactMatchTask.query,
          status: exactMatchTask.status,
          currentStepIndex: exactMatchTask.plan?.currentStepIndex ?? 0,
          createdAt: exactMatchTask.createdAt
            ? new Date(exactMatchTask.createdAt).toISOString()
            : new Date().toISOString(),
          updatedAt: exactMatchTask.updatedAt
            ? new Date(exactMatchTask.updatedAt).toISOString()
            : new Date().toISOString(),
        }
        const res = successResponse(response, undefined, 200)
        return addCorsHeaders(req, res)
      }

      // Try origin match (same domain) as fallback
      try {
        const urlOrigin = new URL(urlFilter).origin
        const originMatchTask = await (Task as any)
          .findOne({
            ...taskQuery,
            url: { $regex: `^${urlOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` },
          })
          .sort({ updatedAt: -1 })
          .lean()
          .exec()

        if (originMatchTask) {
          Sentry.logger.info("Task active: found task with origin match", {
            taskId: originMatchTask.taskId,
          })
          const response = {
            taskId: originMatchTask.taskId,
            query: originMatchTask.query,
            status: originMatchTask.status,
            currentStepIndex: originMatchTask.plan?.currentStepIndex ?? 0,
            createdAt: originMatchTask.createdAt
              ? new Date(originMatchTask.createdAt).toISOString()
              : new Date().toISOString(),
            updatedAt: originMatchTask.updatedAt
              ? new Date(originMatchTask.updatedAt).toISOString()
              : new Date().toISOString(),
          }
          const res = successResponse(response, undefined, 200)
          return addCorsHeaders(req, res)
        }
      } catch {
        // Invalid URL, ignore and fall through to general search
      }
    }

    // General fallback: find most recent active task for this user/tenant
    const latestTask = await (Task as any)
      .findOne(taskQuery)
      .sort({ updatedAt: -1 })
      .lean()
      .exec()

    if (!latestTask) {
      Sentry.logger.info("Task active: no active task found", { sessionId })
      const debugInfo = buildErrorDebugInfo(new Error("No active task found"), {
        code: "TASK_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session/[sessionId]/task/active",
        sessionId,
        urlFilter,
      })
      const err = errorResponse("TASK_NOT_FOUND", 404, {
        code: "TASK_NOT_FOUND",
        message: "No active task found for session",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    Sentry.logger.info("Task active: returning task", { taskId: latestTask.taskId })
    const response = {
      taskId: latestTask.taskId,
      query: latestTask.query,
      status: latestTask.status,
      currentStepIndex: latestTask.plan?.currentStepIndex ?? 0,
      createdAt: latestTask.createdAt
        ? new Date(latestTask.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: latestTask.updatedAt
        ? new Date(latestTask.updatedAt).toISOString()
        : new Date().toISOString(),
    }

    const res = successResponse(response, undefined, 200)
    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.logger.info("Task active: internal error")
    Sentry.captureException(error, {
      tags: { component: "task-active", endpoint: "/api/session/[sessionId]/task/active" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/[sessionId]/task/active",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to fetch active task",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
