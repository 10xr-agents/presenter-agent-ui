import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { connectDB } from "@/lib/db/mongoose"
import { Task, TaskAction, DebugLog } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/session"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"

/**
 * GET /api/debug/session/{taskId}/export
 *
 * Export complete debug session data for a specific task.
 * Returns task metadata, action history, debug logs, execution metrics, and error details.
 *
 * Auth: Bearer token
 * Tenant isolation: Only returns data for tasks owned by authenticated tenant
 *
 * Response: Complete debug session data suitable for JSON file download
 * Sensitive data: API keys, tokens masked or excluded
 */
export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

/**
 * Mask sensitive data in export data
 */
function maskSensitiveData(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return data
  }

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item))
  }

  const obj = data as Record<string, unknown>
  const masked: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()

    // Mask sensitive fields
    if (
      lowerKey.includes("password") ||
      lowerKey.includes("token") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("apikey") ||
      lowerKey === "authorization"
    ) {
      masked[key] = "***"
    } else if (lowerKey === "headers" && typeof value === "object") {
      // Mask headers object
      const headers = value as Record<string, unknown>
      const maskedHeaders: Record<string, unknown> = {}
      for (const [headerKey, headerValue] of Object.entries(headers)) {
        if (headerKey.toLowerCase() === "authorization") {
          maskedHeaders[headerKey] = "Bearer ***"
        } else {
          maskedHeaders[headerKey] = headerValue
        }
      }
      masked[key] = maskedHeaders
    } else if (lowerKey === "dom" && typeof value === "string" && value.length > 100000) {
      // Truncate very large DOM strings in export (more lenient than debug logs)
      masked[key] = value.substring(0, 100000) + `... [truncated, original length: ${value.length}]`
    } else if (typeof value === "object" && value !== null) {
      // Recursively mask nested objects
      masked[key] = maskSensitiveData(value)
    } else {
      masked[key] = value
    }
  }

  return masked
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/debug/session/[taskId]/export",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { tenantId } = session
    const { taskId } = await params

    // Validate taskId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(taskId)) {
      const debugInfo = buildErrorDebugInfo(new Error("Invalid taskId format"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/debug/session/[taskId]/export",
        taskId,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid taskId format. Expected UUID.",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    await connectDB()

    // Fetch task with tenant isolation
    const task = await (Task as any)
      .findOne({ taskId, tenantId })
      .lean()
      .exec()

    if (!task) {
      const debugInfo = buildErrorDebugInfo(new Error(`Task ${taskId} not found for tenant`), {
        code: "TASK_NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/debug/session/[taskId]/export",
        taskId,
      })
      const err = errorResponse("TASK_NOT_FOUND", 404, {
        code: "TASK_NOT_FOUND",
        message: `Task ${taskId} not found for tenant`,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Fetch all task actions (ordered by stepIndex)
    const actions = await (TaskAction as any)
      .find({ taskId, tenantId })
      .sort({ stepIndex: 1 })
      .lean()
      .exec()

    // Fetch all debug logs for this task
    const debugLogs = await (DebugLog as any)
      .find({ taskId, tenantId })
      .sort({ timestamp: 1 })
      .lean()
      .exec()

    // Build export data structure
    const exportData = {
      // Export metadata
      exportVersion: "1.0",
      exportedAt: new Date().toISOString(),
      taskId: task.taskId,

      // Task metadata
      task: {
        taskId: task.taskId,
        status: task.status,
        url: task.url,
        query: task.query,
        createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt,
        updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt,
        metrics: task.metrics || undefined,
      },

      // Action history
      actions: Array.isArray(actions)
        ? actions.map((action: unknown) => {
            const a = action as {
              stepIndex: number
              thought: string
              action: string
              metrics?: unknown
              createdAt: Date
            }
            return {
              stepIndex: a.stepIndex,
              thought: a.thought,
              action: a.action,
              metrics: a.metrics || undefined,
              createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
            }
          })
        : [],

      // Debug logs
      debugLogs: Array.isArray(debugLogs)
        ? debugLogs.map((log: unknown) => {
            const l = log as {
              logType: string
              endpoint: string
              method: string
              requestData?: unknown
              responseData?: unknown
              headers?: unknown
              statusCode: number
              duration: number
              timestamp: Date
              error?: unknown
              metadata?: unknown
            }
            return {
              logType: l.logType,
              endpoint: l.endpoint,
              method: l.method,
              requestData: l.requestData || undefined,
              responseData: l.responseData || undefined,
              headers: l.headers || undefined,
              statusCode: l.statusCode,
              duration: l.duration,
              timestamp: l.timestamp instanceof Date ? l.timestamp.toISOString() : l.timestamp,
              error: l.error || undefined,
              metadata: l.metadata || undefined,
            }
          })
        : [],

      // Execution metrics summary
      metrics: {
        aggregate: task.metrics || undefined,
        perAction: Array.isArray(actions)
          ? actions.map((action: unknown) => {
              const a = action as {
                stepIndex: number
                metrics?: unknown
              }
              return {
                stepIndex: a.stepIndex,
                metrics: a.metrics || undefined,
              }
            })
          : [],
      },

      // Error details (from debug logs)
      errors: Array.isArray(debugLogs)
        ? debugLogs
            .filter((log: unknown) => {
              const l = log as { logType: string; error?: unknown }
              return l.logType === "error" && l.error
            })
            .map((log: unknown) => {
              const l = log as {
                timestamp: Date
                endpoint: string
                method: string
                error?: unknown
                statusCode: number
              }
              return {
                timestamp: l.timestamp instanceof Date ? l.timestamp.toISOString() : l.timestamp,
                endpoint: l.endpoint,
                method: l.method,
                error: l.error,
                statusCode: l.statusCode,
              }
            })
        : [],

      // Summary statistics
      summary: {
        totalActions: Array.isArray(actions) ? actions.length : 0,
        totalDebugLogs: Array.isArray(debugLogs) ? debugLogs.length : 0,
        totalErrors: Array.isArray(debugLogs)
          ? debugLogs.filter((log: unknown) => {
              const l = log as { logType: string }
              return l.logType === "error"
            }).length
          : 0,
        taskStatus: task.status,
        taskDuration: task.metrics?.totalRequestDuration || 0,
      },
    }

    // Mask sensitive data
    const maskedExportData = maskSensitiveData(exportData) as typeof exportData

    // Return as JSON with appropriate headers for file download
    const response = NextResponse.json(maskedExportData, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="debug-session-${taskId}-${new Date().toISOString().split("T")[0]}.json"`,
      },
    })

    return addCorsHeaders(req, response)
  } catch (e: unknown) {
    Sentry.captureException(e)
    const debugInfo = buildErrorDebugInfo(e, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/debug/session/[taskId]/export",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
