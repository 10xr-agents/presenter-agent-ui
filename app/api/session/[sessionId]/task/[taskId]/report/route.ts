/**
 * Task Report Download API
 *
 * GET /api/session/[sessionId]/task/[taskId]/report
 *
 * Generates and returns downloadable reports from task results.
 * Supports multiple formats: JSON, CSV, Markdown
 *
 * Query Parameters:
 * - format: "json" | "csv" | "markdown" (default: "json")
 *
 * @see docs/INTERACT_FLOW_WALKTHROUGH.md
 */

import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import {
  generateTaskReport,
  getAvailableFormats,
  type ReportFormat,
} from "@/lib/agent/report-generator"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { Task, TaskAction } from "@/lib/models"
import type { ITask } from "@/lib/models/task"
import type { ITaskAction } from "@/lib/models/task-action"
import { errorResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"

// Type for route params
interface RouteParams {
  params: Promise<{
    sessionId: string
    taskId: string
  }>
}

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function GET(req: NextRequest, context: RouteParams) {
  try {
    // Auth check
    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/session/[sessionId]/task/[taskId]/report",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const { tenantId } = session
    const { sessionId, taskId } = await context.params

    // Validate format parameter
    const { searchParams } = new URL(req.url)
    const formatParam = searchParams.get("format") || "json"
    const validFormats = getAvailableFormats()

    if (!validFormats.includes(formatParam as ReportFormat)) {
      const debugInfo = buildErrorDebugInfo(new Error(`Invalid format: ${formatParam}`), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/session/[sessionId]/task/[taskId]/report",
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: `Invalid format. Supported formats: ${validFormats.join(", ")}`,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    const format = formatParam as ReportFormat

    await connectDB()

    // Load task
    const task = await (Task as any)
      .findOne({ taskId, tenantId })
      .lean()
      .exec() as ITask | null

    if (!task) {
      const debugInfo = buildErrorDebugInfo(new Error("Task not found"), {
        code: "NOT_FOUND",
        statusCode: 404,
        endpoint: "/api/session/[sessionId]/task/[taskId]/report",
        taskId,
      })
      const err = errorResponse("NOT_FOUND", 404, {
        code: "NOT_FOUND",
        message: "Task not found",
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Load action history
    const actions = await (TaskAction as any)
      .find({ taskId, tenantId })
      .sort({ stepIndex: 1 })
      .lean()
      .exec() as ITaskAction[]

    const actionHistory = actions.map((action) => ({
      stepIndex: action.stepIndex,
      action: action.action || "",
      status: "success" as "success" | "failure" | "pending", // Actions in DB are completed
      thought: action.thought,
      timestamp: action.createdAt,
    }))

    // Generate report
    const report = await generateTaskReport(
      {
        task,
        actionHistory,
        sessionId,
      },
      format
    )

    // Return as downloadable file
    const response = new NextResponse(report.content, {
      status: 200,
      headers: {
        "Content-Type": report.mimeType,
        "Content-Disposition": `attachment; filename="${report.filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })

    return addCorsHeaders(req, response)
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "report-route" },
    })

    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
    const debugInfo = buildErrorDebugInfo(error, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/session/[sessionId]/task/[taskId]/report",
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: errorMessage,
    }, debugInfo)
    return addCorsHeaders(new NextRequest(req), err)
  }
}
