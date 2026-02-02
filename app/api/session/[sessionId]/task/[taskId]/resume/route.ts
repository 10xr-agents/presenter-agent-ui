import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { applyRateLimit } from "@/lib/middleware/rate-limit"
import { BrowserSession, Task } from "@/lib/models"
import { errorResponse, successResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"

/**
 * POST /api/session/[sessionId]/task/[taskId]/resume
 *
 * Resume a paused task after user provides resolution data.
 * Used when a task is in "awaiting_user" status due to a blocker
 * (e.g., login failure, MFA, CAPTCHA).
 *
 * The user can either:
 * 1. Provide resolution data via chat (this endpoint)
 * 2. Resolve directly on the website and call this with resolutionMethod: "user_action_on_web"
 *
 * Request body:
 * {
 *   resolutionMethod: "provide_in_chat" | "user_action_on_web",
 *   resolutionData?: {
 *     [key: string]: string  // e.g., { username: "...", password: "..." }
 *   }
 * }
 *
 * Response:
 * {
 *   taskId: string,
 *   status: string,
 *   message: string
 * }
 */

const resumeBodySchema = z.object({
  resolutionMethod: z.enum(["provide_in_chat", "user_action_on_web"]),
  resolutionData: z.record(z.string(), z.unknown()).optional(),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string; taskId: string }> }
) {
  const startTime = Date.now()
  Sentry.logger.info("Task resume: request received")

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/session")
    if (rateLimitResponse) {
      Sentry.logger.warn("Task resume: rate limit exceeded")
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      Sentry.logger.info("Task resume: unauthorized")
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { userId, tenantId } = session
    const params = await context.params
    const { sessionId, taskId } = params

    // Validate sessionId and taskId formats
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!sessionId || !uuidRegex.test(sessionId)) {
      const debugInfo = buildErrorDebugInfo(new Error("Invalid sessionId format"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
        sessionId,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid sessionId format",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    if (!taskId || !uuidRegex.test(taskId)) {
      const debugInfo = buildErrorDebugInfo(new Error("Invalid taskId format"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
        taskId,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid taskId format",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Parse and validate request body
    const requestBody = (await req.json()) as unknown
    const validationResult = resumeBodySchema.safeParse(requestBody)

    if (!validationResult.success) {
      Sentry.logger.info("Task resume: validation failed")
      const debugInfo = buildErrorDebugInfo(new Error("Request validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { resolutionMethod, resolutionData } = validationResult.data

    await connectDB()

    // Verify session exists and belongs to user
    const targetSession = await (BrowserSession as any)
      .findOne({
        sessionId,
        tenantId,
      })
      .lean()
      .exec()

    if (!targetSession) {
      Sentry.logger.info("Task resume: session not found")
      const debugInfo = buildErrorDebugInfo(new Error(`Session ${sessionId} not found for tenant`), {
        code: "SESSION_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
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
      Sentry.logger.info("Task resume: forbidden (not owner)")
      const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
        code: "UNAUTHORIZED",
        statusCode: 403,
        endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
        sessionId,
      })
      const err = errorResponse("UNAUTHORIZED", 403, {
        code: "UNAUTHORIZED",
        message: "Unauthorized session access",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Find the task
    const task = await (Task as any)
      .findOne({
        taskId,
        tenantId,
        userId,
      })
      .lean()
      .exec()

    if (!task) {
      Sentry.logger.info("Task resume: task not found")
      const debugInfo = buildErrorDebugInfo(new Error(`Task ${taskId} not found`), {
        code: "TASK_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
        taskId,
      })
      const err = errorResponse("TASK_NOT_FOUND", 404, {
        code: "TASK_NOT_FOUND",
        message: `Task ${taskId} not found`,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Verify task is in awaiting_user status
    if (task.status !== "awaiting_user") {
      Sentry.logger.info("Task resume: task not paused", { status: task.status })
      const debugInfo = buildErrorDebugInfo(new Error(`Task ${taskId} is not paused (status: ${task.status})`), {
        code: "INVALID_TASK_STATE",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
        taskId,
        currentStatus: task.status,
      })
      const err = errorResponse("INVALID_TASK_STATE", 400, {
        code: "INVALID_TASK_STATE",
        message: `Task is not paused. Current status: ${task.status}`,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Update the task: clear blocker context and resume
    const updatePayload: Record<string, unknown> = {
      status: "executing",
    }

    // Store resolution data if provided (for use by the next action)
    if (resolutionData && Object.keys(resolutionData).length > 0) {
      updatePayload.userResolutionData = resolutionData
    }

    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        {
          $set: updatePayload,
          $unset: {
            pausedAt: 1,
            blockerContext: 1,
          },
        }
      )
      .exec()

    Sentry.logger.info("Task resume: task resumed", {
      taskId,
      resolutionMethod,
      hadResolutionData: !!resolutionData,
    })

    const duration = Date.now() - startTime
    const response = {
      taskId,
      status: "executing",
      message: resolutionMethod === "user_action_on_web"
        ? "Task resumed. The agent will continue from where it left off."
        : "Task resumed with provided data. The agent will use this information to continue.",
      resumedAt: new Date().toISOString(),
    }

    const res = successResponse(response, "Task resumed successfully", 200)
    return addCorsHeaders(req, res)
  } catch (error: unknown) {
    Sentry.logger.info("Task resume: internal error")
    Sentry.captureException(error, {
      tags: { component: "task-resume", endpoint: "/api/session/[sessionId]/task/[taskId]/resume" },
    })
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/[sessionId]/task/[taskId]/resume",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "Failed to resume task",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
