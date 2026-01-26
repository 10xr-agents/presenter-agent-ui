import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import * as Sentry from "@sentry/nextjs"
import { connectDB } from "@/lib/db/mongoose"
import { DebugLog } from "@/lib/models/debug-log"
import { getSessionFromRequest } from "@/lib/auth/session"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"

/**
 * GET /api/debug/logs
 *
 * Retrieve debug logs for debug UI.
 * Returns API traces, execution metrics, and error logs for the authenticated tenant.
 *
 * Query params:
 * - taskId (optional) - Filter by task
 * - logType (optional) - Filter by log type
 * - limit (optional, default: 100) - Max logs to return
 * - since (optional) - Timestamp to filter logs after
 *
 * Tenant isolation: Only returns logs for authenticated tenant.
 */
const debugLogsQuerySchema = z.object({
  taskId: z.string().uuid().optional(),
  logType: z.enum(["api_request", "api_response", "execution_metric", "error"]).optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100))
    .pipe(z.number().int().min(1).max(1000)),
  since: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      })
      return addCorsHeaders(req, err)
    }

    const { tenantId } = session

    // Parse and validate query parameters
    const searchParams = req.nextUrl.searchParams
    const queryParams = {
      taskId: searchParams.get("taskId") || undefined,
      logType: searchParams.get("logType") || undefined,
      limit: searchParams.get("limit") || undefined,
      since: searchParams.get("since") || undefined,
    }

    const validationResult = debugLogsQuerySchema.safeParse(queryParams)

    if (!validationResult.success) {
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      })
      return addCorsHeaders(req, err)
    }

    const { taskId, logType, limit, since } = validationResult.data

    await connectDB()

    // Build query with tenant isolation
    const query: Record<string, unknown> = {
      tenantId,
    }

    if (taskId) {
      query.taskId = taskId
    }

    if (logType) {
      query.logType = logType
    }

    if (since) {
      query.timestamp = { $gte: since }
    }

    // Query logs sorted by timestamp (newest first)
    const logs = await (DebugLog as any)
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean()
      .exec()

    const response = NextResponse.json(
      {
        logs: logs || [],
        count: Array.isArray(logs) ? logs.length : 0,
      },
      { status: 200 }
    )

    return addCorsHeaders(req, response)
  } catch (e: unknown) {
    Sentry.captureException(e)
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    })
    return addCorsHeaders(req, err)
  }
}
