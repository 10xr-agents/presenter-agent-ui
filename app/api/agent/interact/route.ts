import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"
import * as Sentry from "@sentry/nextjs"
import { connectDB } from "@/lib/db/mongoose"
import { Task, TaskAction } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getRAGChunks } from "@/lib/knowledge-extraction/rag-helper"
import { buildActionPrompt, parseActionResponse, validateActionFormat } from "@/lib/agent/prompt-builder"
import { callActionLLM } from "@/lib/agent/llm-client"
import { interactRequestBodySchema, type NextActionResponse } from "@/lib/agent/schemas"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"

/**
 * POST /api/agent/interact
 *
 * Thin Client action loop endpoint (Task 3).
 *
 * - Receives: { url, query, dom, taskId? }
 * - Validates tenant and domain; uses allowed_domains as filter (§1.6)
 * - Loads or creates task; fetches RAG (org-specific or public-only)
 * - Builds prompt with server-held action history
 * - Calls LLM; parses <Thought> and <Action>
 * - Appends to history; updates task status if finish/fail
 * - Returns NextActionResponse with hasOrgKnowledge
 *
 * Schema: THIN_CLIENT_ROADMAP_SERVER §4.2; SERVER_SIDE_AGENT_ARCH §4
 */

const MAX_STEPS_PER_TASK = 50

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      })
      return addCorsHeaders(req, err)
    }

    const { userId, tenantId } = session

    // Parse and validate body
    const body = (await req.json()) as unknown
    const validationResult = interactRequestBodySchema.safeParse(body)

    if (!validationResult.success) {
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      })
      return addCorsHeaders(req, err)
    }

    const { url, query, dom, taskId } = validationResult.data

    await connectDB()

    let currentTaskId: string
    let previousActions: Array<{ stepIndex: number; thought: string; action: string }> = []
    let currentStepIndex = 0

    // Task resolution
    if (taskId) {
      // Load existing task by taskId (UUID stored as string, not _id)
      const task = await (Task as any).findOne({ taskId, tenantId }).lean().exec()

      if (!task) {
        const err = errorResponse("TASK_NOT_FOUND", 404, {
          code: "TASK_NOT_FOUND",
          message: `Task ${taskId} not found for tenant`,
        })
        return addCorsHeaders(req, err)
      }

      if (task.status === "completed" || task.status === "failed") {
        const err = errorResponse("TASK_COMPLETED", 409, {
          code: "TASK_COMPLETED",
          message: `Task ${taskId} is already ${task.status}`,
        })
        return addCorsHeaders(req, err)
      }

      currentTaskId = taskId

      // Load action history
      const actions = await (TaskAction as any)
        .find({ tenantId, taskId })
        .sort({ stepIndex: 1 })
        .lean()
        .exec() as Array<{ stepIndex: number; thought: string; action: string }>

      previousActions = Array.isArray(actions) ? actions : []
      currentStepIndex = previousActions.length

      // Check max steps
      if (currentStepIndex >= MAX_STEPS_PER_TASK) {
        // Mark task as failed
        await (Task as any)
          .findOneAndUpdate({ taskId: currentTaskId, tenantId }, { status: "failed" })
          .exec()

        const err = errorResponse("VALIDATION_ERROR", 400, {
          code: "MAX_STEPS_EXCEEDED",
          message: `Task exceeded maximum steps (${MAX_STEPS_PER_TASK})`,
        })
        return addCorsHeaders(req, err)
      }
    } else {
      // Create new task with UUID
      const newTaskId = randomUUID()
      await (Task as any).create({
        taskId: newTaskId,
        tenantId,
        userId,
        url,
        query,
        status: "active",
      })

      currentTaskId = newTaskId
      currentStepIndex = 0
    }

    // RAG: Reuse Task 2 logic via getRAGChunks
    const { chunks, hasOrgKnowledge } = await getRAGChunks(url, query, tenantId)

    // Build prompt with history and RAG context
    const currentTime = new Date().toISOString()
    const { system, user } = buildActionPrompt({
      query,
      currentTime,
      previousActions,
      ragChunks: chunks,
      hasOrgKnowledge,
      dom,
    })

    // Call LLM
    let llmResponse
    try {
      llmResponse = await callActionLLM(system, user)
    } catch (llmError: unknown) {
      Sentry.captureException(llmError)
      const err = errorResponse("INTERNAL_ERROR", 500, {
        code: "INTERNAL_ERROR",
        message: "Failed to call LLM",
      })
      return addCorsHeaders(req, err)
    }

    if (!llmResponse) {
      const err = errorResponse("INTERNAL_ERROR", 500, {
        code: "INTERNAL_ERROR",
        message: "LLM returned empty response",
      })
      return addCorsHeaders(req, err)
    }

    // Parse <Thought> and <Action> from LLM response
    // LLM response content is in thought field (raw content)
    const parsed = parseActionResponse(llmResponse.thought)

    if (!parsed) {
      // Parse failure - mark task as failed
      await (Task as any)
        .findOneAndUpdate({ taskId: currentTaskId, tenantId }, { status: "failed" })
        .exec()

      const err = errorResponse("INTERNAL_ERROR", 500, {
        code: "PARSE_ERROR",
        message: "Failed to parse LLM response. Expected <Thought>...</Thought><Action>...</Action>",
      })
      return addCorsHeaders(req, err)
    }

    const { thought, action } = parsed

    // Validate action format
    if (!validateActionFormat(action)) {
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "INVALID_ACTION_FORMAT",
        message: `Invalid action format: ${action}. Expected: click(id), setValue(id, "text"), finish(), or fail(reason)`,
      })
      return addCorsHeaders(req, err)
    }

    // Append to action history
    try {
      await (TaskAction as any).create({
        tenantId,
        taskId: currentTaskId,
        userId,
        stepIndex: currentStepIndex,
        thought,
        action,
      })
    } catch (historyError: unknown) {
      // Unique constraint violation (duplicate stepIndex) - should not happen, but handle gracefully
      Sentry.captureException(historyError)
      console.error("[interact] Failed to save action history:", historyError)
    }

    // Update task status if finish or fail
    const isFinish = action.trim().startsWith("finish(")
    const isFail = action.trim().startsWith("fail(")

    if (isFinish || isFail) {
      await (Task as any)
        .findOneAndUpdate(
          { taskId: currentTaskId, tenantId },
          {
            status: isFinish ? "completed" : "failed",
          }
        )
        .exec()
    }

    // Build response
    const response: NextActionResponse = {
      thought,
      action,
      taskId: currentTaskId,
      hasOrgKnowledge,
      usage: llmResponse.usage,
    }

    const res = NextResponse.json(response, { status: 200 })
    return addCorsHeaders(req, res)
  } catch (e: unknown) {
    Sentry.captureException(e)
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    })
    return addCorsHeaders(req, err)
  }
}
