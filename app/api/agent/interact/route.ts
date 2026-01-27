import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { randomUUID } from "crypto"
import * as Sentry from "@sentry/nextjs"
import { connectDB } from "@/lib/db/mongoose"
import { Task, TaskAction, Session, Message, Snapshot } from "@/lib/models"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getRAGChunks } from "@/lib/knowledge-extraction/rag-helper"
import { buildActionPrompt, parseActionResponse } from "@/lib/agent/prompt-builder"
import { validateActionName } from "@/lib/agent/action-config"
import { callActionLLM } from "@/lib/agent/llm-client"
import { generatePlan } from "@/lib/agent/planning-engine"
import { verifyAction } from "@/lib/agent/verification-engine"
import { generateCorrection } from "@/lib/agent/self-correction-engine"
import { predictOutcome } from "@/lib/agent/outcome-prediction-engine"
import { refineStep } from "@/lib/agent/step-refinement-engine"
import { performWebSearch } from "@/lib/agent/web-search"
import type { WebSearchResult } from "@/lib/agent/web-search"
import {
  analyzeContext,
  type ContextAnalysisResult,
} from "@/lib/agent/reasoning/context-analyzer"
import { manageSearch, type SearchManagerResult } from "@/lib/agent/reasoning/search-manager"
import type { TaskPlan } from "@/lib/models/task"
import { VerificationRecord, CorrectionRecord } from "@/lib/models"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import {
  interactRequestBodySchema,
  type NextActionResponse,
  needsUserInputResponseSchema,
  type NeedsUserInputResponse,
} from "@/lib/agent/schemas"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"
import { createDebugLog, extractHeaders } from "@/lib/utils/debug-logger"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"
import { applyRateLimit } from "@/lib/middleware/rate-limit"

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
  const startTime = Date.now()
  let requestBody: unknown = null
  let taskId: string | undefined = undefined

  console.log(`[Interact] Request received at ${new Date().toISOString()}`)

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/agent/interact")
    if (rateLimitResponse) {
      console.log(`[Interact] Rate limit exceeded`)
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const debugInfo = buildErrorDebugInfo(new Error("Missing or invalid Authorization header"), {
        code: "UNAUTHORIZED",
        statusCode: 401,
        endpoint: "/api/agent/interact",
      })
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      }, debugInfo)
      const duration = Date.now() - startTime
      await createDebugLog({
        tenantId: "unknown",
        logType: "error",
        endpoint: "/api/agent/interact",
        method: "POST",
        headers: extractHeaders(req),
        statusCode: 401,
        duration,
        error: {
          type: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
        },
      })
      return addCorsHeaders(req, err)
    }

    const { userId, tenantId } = session

    // Parse and validate body
    console.log(`[Interact] Parsing request body for tenant ${tenantId}`)
    requestBody = (await req.json()) as unknown
    
    // Log request summary (without full DOM)
    const requestSummary = requestBody as Record<string, unknown>
    console.log(`[Interact] Request received:`, {
      url: requestSummary.url,
      query: requestSummary.query,
      domLength: typeof requestSummary.dom === "string" ? requestSummary.dom.length : "N/A",
      hasTaskId: !!requestSummary.taskId,
      hasSessionId: !!requestSummary.sessionId,
    })
    
    const validationResult = interactRequestBodySchema.safeParse(requestBody)

    if (!validationResult.success) {
      // Format validation errors for better readability
      const formattedErrors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join(".") || "root",
        message: issue.message,
        code: issue.code,
        ...(issue.path.length > 0 && { path: issue.path }),
      }))

      // Log validation errors for debugging
      console.error(`[Interact] Validation failed for tenant ${tenantId}:`, {
        errors: formattedErrors.map((e) => `${e.field}: ${e.message}`),
        requestSummary: {
          url: requestSummary.url,
          queryLength: typeof requestSummary.query === "string" ? requestSummary.query.length : "N/A",
          domLength: typeof requestSummary.dom === "string" ? requestSummary.dom.length : "N/A",
          taskId: requestSummary.taskId,
          sessionId: requestSummary.sessionId,
        },
      })

      const debugInfo = buildErrorDebugInfo(new Error("Request validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/agent/interact",
        requestData: {
          ...(requestBody as Record<string, unknown>),
          // Truncate large fields for logging
          dom: typeof (requestBody as any)?.dom === "string"
            ? `${(requestBody as any).dom.substring(0, 100)}... (${(requestBody as any).dom.length} chars)`
            : (requestBody as any)?.dom,
        },
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: `Validation failed: ${formattedErrors.map((e) => `${e.field}: ${e.message}`).join(", ")}`,
        errors: formattedErrors,
        validationErrors: validationResult.error.issues, // Keep raw errors for debugging
      }, debugInfo)
      const duration = Date.now() - startTime
      await createDebugLog({
        tenantId,
        logType: "error",
        endpoint: "/api/agent/interact",
        method: "POST",
        requestData: requestBody,
        headers: extractHeaders(req),
        statusCode: 400,
        duration,
        error: {
          type: "VALIDATION_ERROR",
          message: "Request validation failed",
        },
        metadata: {
          validationErrors: validationResult.error.issues,
        },
      })
      console.log(`[Interact] Returning 400 validation error after ${duration}ms`)
      return addCorsHeaders(req, err)
    }

    console.log(`[Interact] Validation passed, proceeding with request`)

    const {
      url,
      query,
      dom,
      taskId: requestTaskId,
      sessionId: requestSessionId,
      lastActionStatus,
      lastActionError,
      lastActionResult,
    } = validationResult.data
    taskId = requestTaskId

    await connectDB()

    // Task 3: Session Resolution - Create or load session
    let currentSessionId: string | undefined = undefined

    if (requestSessionId) {
      // Load existing session (exclude archived sessions - Chrome extension should not use archived sessions)
      const currentSession = await (Session as any)
        .findOne({
          sessionId: requestSessionId,
          tenantId,
          status: { $ne: "archived" }, // Exclude archived sessions
        })
        .lean()
        .exec()

      if (!currentSession) {
        const debugInfo = buildErrorDebugInfo(new Error(`Session ${requestSessionId} not found for tenant or is archived`), {
          code: "SESSION_NOT_FOUND",
          statusCode: 404,
          endpoint: "/api/agent/interact",
          sessionId: requestSessionId,
        })
        const err = errorResponse("SESSION_NOT_FOUND", 404, {
          code: "SESSION_NOT_FOUND",
          message: `Session ${requestSessionId} not found for tenant or is archived`,
        }, debugInfo)
        return addCorsHeaders(req, err)
      }

      // Security check: ensure user owns session
      if (currentSession.userId !== userId) {
        const debugInfo = buildErrorDebugInfo(new Error("Unauthorized session access"), {
          code: "UNAUTHORIZED",
          statusCode: 403,
          endpoint: "/api/agent/interact",
          sessionId: requestSessionId,
        })
        const err = errorResponse("UNAUTHORIZED", 403, {
          code: "UNAUTHORIZED",
          message: "Unauthorized session access",
        }, debugInfo)
        return addCorsHeaders(req, err)
      }

      currentSessionId = requestSessionId

      // Task 3: Update last message status if provided
      // Task 4: Also handle error details
      if (lastActionStatus) {
        const lastMessage = await (Message as any)
          .findOne({ sessionId: requestSessionId, tenantId })
          .sort({ sequenceNumber: -1 })
          .lean()
          .exec()

        if (lastMessage) {
          const updateData: Record<string, unknown> = {
            status: lastActionStatus,
          }

          // Task 4: Add error details if action failed
          if (lastActionStatus === "failure" && (lastActionError || lastActionResult)) {
            updateData.error = lastActionError
              ? {
                  message: lastActionError.message,
                  code: lastActionError.code,
                  action: lastActionError.action,
                  elementId: lastActionError.elementId,
                }
              : {
                  message: lastActionResult?.actualState || "Action failed",
                  code: "ACTION_FAILED",
                  action: "unknown",
                }
          }

          await (Message as any)
            .findOneAndUpdate(
              { messageId: lastMessage.messageId, tenantId },
              {
                $set: updateData,
              }
            )
            .exec()
        }
      }
    } else {
      // Create new session
      const newSessionId = randomUUID()
      await (Session as any).create({
        sessionId: newSessionId,
        userId,
        tenantId,
        url,
        status: "active",
        metadata: {
          initialQuery: query,
        },
      })

      currentSessionId = newSessionId

      // Task 3: Save user message for new session
      await (Message as any).create({
        messageId: randomUUID(),
        sessionId: newSessionId,
        userId,
        tenantId,
        role: "user",
        content: query,
        sequenceNumber: 0,
        timestamp: new Date(),
      })
    }

    // RAG: Fetch chunks early for use in verification/correction/planning (Task 8, Task 10)
    const ragStartTime = Date.now()
    const { chunks, hasOrgKnowledge, ragDebug } = await getRAGChunks(url, query, tenantId)
    const ragDuration = Date.now() - ragStartTime

    let currentTaskId: string
    let previousActions: Array<{ stepIndex: number; thought: string; action: string }> = []
    let currentStepIndex = 0
    // Task 7: Verification result (declared at top level for use in response)
    let verificationResult: Awaited<ReturnType<typeof verifyAction>> | undefined = undefined
    // Task 1: Web search result (for new tasks)
    let webSearchResult: WebSearchResult | null = null
    // For reasoning layer: chat history messages
    let previousMessages: any[] = []

    // Task resolution
    if (taskId) {
      // Load existing task by taskId (UUID stored as string, not _id)
      const task = await (Task as any).findOne({ taskId, tenantId }).lean().exec()

      if (!task) {
        const debugInfo = buildErrorDebugInfo(new Error(`Task ${taskId} not found for tenant`), {
          code: "TASK_NOT_FOUND",
          statusCode: 404,
          endpoint: "/api/agent/interact",
          taskId,
          taskState: { status: "not_found" },
        })
        const err = errorResponse("TASK_NOT_FOUND", 404, {
          code: "TASK_NOT_FOUND",
          message: `Task ${taskId} not found for tenant`,
        }, debugInfo)
        return addCorsHeaders(req, err)
      }

      if (task.status === "completed" || task.status === "failed") {
        const debugInfo = buildErrorDebugInfo(new Error(`Task ${taskId} is already ${task.status}`), {
          code: "TASK_COMPLETED",
          statusCode: 409,
          endpoint: "/api/agent/interact",
          taskId,
          taskState: { status: task.status },
        })
        const err = errorResponse("TASK_COMPLETED", 409, {
          code: "TASK_COMPLETED",
          message: `Task ${taskId} is already ${task.status}`,
        }, debugInfo)
        return addCorsHeaders(req, err)
      }

      currentTaskId = taskId

      // Task 1: Load web search results from existing task (if available)
      const existingTask = await (Task as any).findOne({ taskId, tenantId }).lean().exec()
      if (existingTask?.webSearchResult) {
        webSearchResult = existingTask.webSearchResult as WebSearchResult
      }

      // Task 3: Load history from database (messages) if session exists, otherwise fall back to TaskAction
      // Improvement 3: Don't load full DOMs from past messages - only use domSummary
      if (currentSessionId) {
        previousMessages = await (Message as any)
          .find({
            sessionId: currentSessionId,
            tenantId,
          })
          .sort({ sequenceNumber: 1 })
          .limit(50) // Last 50 messages for context
          .select("messageId role content actionString status error sequenceNumber timestamp domSummary") // Improvement 3: Exclude snapshotId and full DOM
          .lean()
          .exec()

        // Convert to format expected by prompt builder (filter assistant messages with actions)
        previousActions = previousMessages
          .filter((m: any) => m.role === "assistant" && m.actionString)
          .map((m: any, idx: number) => ({
            stepIndex: idx,
            thought: m.content,
            action: m.actionString || "",
            status: m.status,
            error: m.error,
            // Improvement 3: Include domSummary for context (not full DOM)
            domSummary: m.domSummary,
          }))
        currentStepIndex = previousActions.length
      } else {
        // Fallback to TaskAction for backward compatibility
        const actions = await (TaskAction as any)
          .find({ tenantId, taskId })
          .sort({ stepIndex: 1 })
          .lean()
          .exec() as Array<{
            stepIndex: number
            thought: string
            action: string
            expectedOutcome?: ExpectedOutcome
            domSnapshot?: string
          }>

        previousActions = Array.isArray(actions)
          ? actions.map((a) => ({
              stepIndex: a.stepIndex,
              thought: a.thought,
              action: a.action,
            }))
          : []
        currentStepIndex = previousActions.length
      }

      // Task 7: Verify previous action if it has expectedOutcome (load TaskAction for verification)
      const actionsForVerification = await (TaskAction as any)
        .find({ tenantId, taskId })
        .sort({ stepIndex: 1 })
        .lean()
        .exec() as Array<{
          stepIndex: number
          thought: string
          action: string
          expectedOutcome?: ExpectedOutcome
          domSnapshot?: string
        }>

      // Task 7: Verify previous action if it has expectedOutcome
      if (actionsForVerification.length > 0) {
        const previousAction = actionsForVerification[actionsForVerification.length - 1]
        if (previousAction && previousAction.expectedOutcome) {
          try {
            // Get previous URL from task (baseline URL when task was created)
            // For URL change verification, we compare current URL with task URL
            const taskForUrl = await (Task as any).findOne({ taskId, tenantId }).lean().exec()
            const previousUrl = taskForUrl?.url || url

            // Verify previous action using current DOM (which reflects state after action was executed)
            verificationResult = await verifyAction(
              previousAction.expectedOutcome,
              dom, // Current DOM (after action was executed, sent by client)
              url, // Current URL (after action was executed, sent by client)
              previousUrl // Previous URL (task baseline URL) for comparison
            )

            // Store verification result
            await (VerificationRecord as any).create({
              tenantId,
              taskId,
              stepIndex: previousAction.stepIndex,
              success: verificationResult.success,
              confidence: verificationResult.confidence,
              expectedState: verificationResult.expectedState,
              actualState: verificationResult.actualState,
              comparison: verificationResult.comparison,
              reason: verificationResult.reason,
              timestamp: new Date(),
            })

            // Task 8: Reset consecutive failures if verification succeeded
            if (verificationResult.success) {
              await (Task as any)
                .findOneAndUpdate(
                  { taskId, tenantId },
                  {
                    $set: {
                      consecutiveFailures: 0, // Reset on success
                    },
                  }
                )
                .exec()
            }

            // Task 8: If verification failed, trigger self-correction
            if (!verificationResult.success) {
              try {
                // Get current task to check retry limits
                const currentTaskForRetry = await (Task as any)
                  .findOne({ taskId, tenantId })
                  .lean()
                  .exec()

                const maxRetriesPerStep = currentTaskForRetry?.maxRetriesPerStep || 3
                const consecutiveFailures = currentTaskForRetry?.consecutiveFailures || 0

                // Check retry limits
                // Count existing correction records for this step
                const existingCorrections = await (CorrectionRecord as any)
                  .find({ tenantId, taskId, stepIndex: previousAction.stepIndex })
                  .lean()
                  .exec()

                const attemptNumber = (existingCorrections?.length || 0) + 1

                if (attemptNumber > maxRetriesPerStep) {
                  // Max retries exceeded - mark step and task as failed
                  await (Task as any)
                    .findOneAndUpdate(
                      { taskId, tenantId },
                      {
                        $set: {
                          status: "failed",
                          consecutiveFailures: consecutiveFailures + 1,
                        },
                      }
                    )
                    .exec()

                  // Mark plan step as failed if plan exists
                  if (currentTaskForRetry?.plan) {
                    const plan = currentTaskForRetry.plan as TaskPlan
                    if (previousAction.stepIndex < plan.steps.length) {
                      const existingStep = plan.steps[previousAction.stepIndex]
                      if (existingStep) {
                        plan.steps[previousAction.stepIndex] = {
                          ...existingStep,
                          status: "failed",
                        }
                      }
                      await (Task as any)
                        .findOneAndUpdate(
                          { taskId, tenantId },
                          {
                            $set: {
                              "plan.steps": plan.steps,
                            },
                          }
                        )
                        .exec()
                    }
                  }

                  const debugInfo = buildErrorDebugInfo(
                    new Error(`Max retries (${maxRetriesPerStep}) exceeded for step ${previousAction.stepIndex}`),
                    {
                      code: "MAX_RETRIES_EXCEEDED",
                      statusCode: 400,
                      endpoint: "/api/agent/interact",
                      taskId,
                      taskState: { stepIndex: previousAction.stepIndex, attemptNumber, maxRetriesPerStep },
                    }
                  )
                  console.error(`[Interact] Max retries exceeded for task ${taskId}, step ${previousAction.stepIndex}: ${attemptNumber}/${maxRetriesPerStep}`)
                  const err = errorResponse("VALIDATION_ERROR", 400, {
                    code: "MAX_RETRIES_EXCEEDED",
                    message: `Max retries (${maxRetriesPerStep}) exceeded for step ${previousAction.stepIndex}. Task marked as failed.`,
                  }, debugInfo)
                  return addCorsHeaders(req, err)
                }

                // Check consecutive failures limit
                if (consecutiveFailures >= 3) {
                  // Too many consecutive failures - mark task as failed
                  await (Task as any)
                    .findOneAndUpdate(
                      { taskId, tenantId },
                      {
                        $set: {
                          status: "failed",
                        },
                      }
                    )
                    .exec()

                  const debugInfo = buildErrorDebugInfo(
                    new Error("Too many consecutive failures"),
                    {
                      code: "CONSECUTIVE_FAILURES_EXCEEDED",
                      statusCode: 400,
                      endpoint: "/api/agent/interact",
                      taskId,
                      taskState: { consecutiveFailures },
                    }
                  )
                  console.error(`[Interact] Too many consecutive failures for task ${taskId}: ${consecutiveFailures} failures`)
                  const err = errorResponse("VALIDATION_ERROR", 400, {
                    code: "CONSECUTIVE_FAILURES_EXCEEDED",
                    message: "Too many consecutive failures. Task marked as failed.",
                  }, debugInfo)
                  return addCorsHeaders(req, err)
                }

                // Generate correction using Self-Correction Engine
                const correctionResult = await generateCorrection(
                  // Get failed step from plan if available
                  currentTaskForRetry?.plan
                    ? (currentTaskForRetry.plan as TaskPlan).steps[previousAction.stepIndex] || {
                        index: previousAction.stepIndex,
                        description: previousAction.thought,
                        toolType: "DOM" as const,
                        status: "failed" as const,
                      }
                    : {
                        index: previousAction.stepIndex,
                        description: previousAction.thought,
                        toolType: "DOM" as const,
                        status: "failed" as const,
                      },
                  verificationResult,
                  dom, // Current DOM
                  url, // Current URL
                  chunks, // RAG chunks
                  hasOrgKnowledge
                )

                if (correctionResult) {
                  // Store correction record
                  await (CorrectionRecord as any).create({
                    tenantId,
                    taskId,
                    stepIndex: previousAction.stepIndex,
                    originalStep: {
                      description: previousAction.thought,
                      action: previousAction.action,
                      expectedOutcome: previousAction.expectedOutcome,
                    },
                    correctedStep: correctionResult.correctedStep || {
                      description: correctionResult.reason,
                      action: correctionResult.retryAction,
                    },
                    strategy: correctionResult.strategy,
                    reason: correctionResult.reason,
                    attemptNumber,
                    timestamp: new Date(),
                  })

                  // Update plan with corrected step if plan exists
                  if (currentTaskForRetry?.plan && correctionResult.correctedStep) {
                    const plan = currentTaskForRetry.plan as TaskPlan
                    if (previousAction.stepIndex < plan.steps.length) {
                      const existingStep = plan.steps[previousAction.stepIndex]
                      if (existingStep) {
                        plan.steps[previousAction.stepIndex] = {
                          ...existingStep,
                          description: correctionResult.correctedStep.description || existingStep.description,
                          status: "active", // Mark as active for retry
                        }
                      }
                      await (Task as any)
                        .findOneAndUpdate(
                          { taskId, tenantId },
                          {
                            $set: {
                              "plan.steps": plan.steps,
                              status: "correcting", // Task 8: Set status to correcting
                              consecutiveFailures: consecutiveFailures + 1,
                            },
                          }
                        )
                        .exec()
                    }
                  } else {
                    // Update task status even if no plan
                    await (Task as any)
                      .findOneAndUpdate(
                        { taskId, tenantId },
                        {
                          $set: {
                            status: "correcting",
                            consecutiveFailures: consecutiveFailures + 1,
                          },
                        }
                      )
                      .exec()
                  }

                  // Return corrected action (don't proceed with normal flow)
                  const correctionResponse: NextActionResponse = {
                    thought: `Previous action failed verification. ${correctionResult.reason}. Retrying with corrected approach.`,
                    action: correctionResult.retryAction,
                    taskId: currentTaskId,
                    hasOrgKnowledge,
                    status: "correcting",
                    // Task 8: Include correction information
                    correction: {
                      strategy: correctionResult.strategy,
                      reason: correctionResult.reason,
                      retryAction: correctionResult.retryAction,
                    },
                  }

                  const res = NextResponse.json(correctionResponse, { status: 200 })
                  return addCorsHeaders(req, res)
                } else {
                  // Correction generation failed - continue with normal flow (graceful degradation)
                  console.warn("[interact] Correction generation failed, continuing without correction")
                }
              } catch (correctionError: unknown) {
                // Log error but continue with normal flow (graceful degradation)
                Sentry.captureException(correctionError)
                console.error("[interact] Self-correction error:", correctionError)
              }
            }
          } catch (verificationError: unknown) {
            // Log error but don't fail the request
            Sentry.captureException(verificationError)
            console.error("[interact] Verification error:", verificationError)
          }
        }
      }

      // Check max steps
      if (currentStepIndex >= MAX_STEPS_PER_TASK) {
        // Mark task as failed
        await (Task as any)
          .findOneAndUpdate({ taskId: currentTaskId, tenantId }, { status: "failed" })
          .exec()

        const debugInfo = buildErrorDebugInfo(new Error(`Task exceeded maximum steps (${MAX_STEPS_PER_TASK})`), {
          code: "MAX_STEPS_EXCEEDED",
          statusCode: 400,
          endpoint: "/api/agent/interact",
          taskId: currentTaskId,
          taskState: { stepIndex: currentStepIndex, maxSteps: MAX_STEPS_PER_TASK, status: "failed" },
        })
        console.error(`[Interact] Task ${currentTaskId} exceeded max steps: ${currentStepIndex}/${MAX_STEPS_PER_TASK}`)
        const err = errorResponse("VALIDATION_ERROR", 400, {
          code: "MAX_STEPS_EXCEEDED",
          message: `Task exceeded maximum steps (${MAX_STEPS_PER_TASK})`,
        }, debugInfo)
        return addCorsHeaders(req, err)
      }
    } else {
      console.log(`[Interact] Creating new task for query: "${query.substring(0, 50)}..."`)
      
      // For new tasks, load chat history if session exists
      if (currentSessionId) {
        console.log(`[Interact] Loading chat history for session ${currentSessionId}`)
        previousMessages = await (Message as any)
          .find({
            sessionId: currentSessionId,
            tenantId,
          })
          .sort({ sequenceNumber: 1 })
          .limit(50)
          .select("messageId role content actionString status error sequenceNumber timestamp domSummary")
          .lean()
          .exec()

        console.log(`[Interact] Loaded ${previousMessages.length} messages from history`)

        // Convert to format expected by prompt builder
        previousActions = previousMessages
          .filter((m: any) => m.role === "assistant" && m.actionString)
          .map((m: any, idx: number) => ({
            stepIndex: idx,
            thought: m.content,
            action: m.actionString || "",
            status: m.status,
            error: m.error,
            domSummary: m.domSummary,
          }))
        currentStepIndex = previousActions.length
        console.log(`[Interact] Found ${previousActions.length} previous actions`)
      } else {
        console.log(`[Interact] No session ID provided, starting fresh`)
      }

      // NEW: 4-Step Reasoning Pipeline
      // Step 1: Context & Gap Analysis (Memory & Visual Check)
      console.log(`[Interact] Starting reasoning pipeline: Context Analysis`)
      
      // Extract chat history for context analysis
      const chatHistoryForAnalysis = previousMessages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: m.timestamp,
      }))

      // Extract page summary from DOM (similar to domSummary generation)
      let pageSummary = `Current page: ${url}`
      try {
        // Extract visible text from DOM (first 500 chars)
        const textMatch = dom.match(/<[^>]*>([^<]+)<\/[^>]*>/g)
        if (textMatch) {
          const extractedText = textMatch
            .slice(0, 20)
            .map((match) => match.replace(/<[^>]*>/g, ""))
            .join(" ")
            .substring(0, 500)
          if (extractedText) {
            pageSummary = `Current page: ${url}\nVisible content: ${extractedText}`
          }
        }
      } catch {
        // Fallback to URL only
        pageSummary = `Current page: ${url}`
      }

      let contextAnalysis: ContextAnalysisResult
      try {
        console.log(`[Interact] Analyzing context with ${chatHistoryForAnalysis.length} history messages, ${chunks.length} RAG chunks`)
        contextAnalysis = await analyzeContext({
          query,
          url,
          chatHistory: chatHistoryForAnalysis,
          pageSummary,
          ragChunks: chunks,
          hasOrgKnowledge,
        })
        console.log(
          `[Interact] Context analysis complete: source=${contextAnalysis.source}, confidence=${contextAnalysis.confidence}, missingInfo=${contextAnalysis.missingInfo.length}`
        )
      } catch (error: unknown) {
        console.error(`[Interact] Context analysis failed, using fallback:`, error)
        Sentry.captureException(error, {
          tags: { component: "agent-interact", operation: "context-analysis" },
          extra: { query, url, tenantId },
        })
        // Fallback: conservative defaults
        contextAnalysis = {
          source: "WEB_SEARCH",
          missingInfo: [],
          searchQuery: query,
          reasoning: "Analysis failed, defaulting to search",
          confidence: 0.3,
        }
      }

      // Step 2: Execution (The Action)
      if (contextAnalysis.source === "ASK_USER") {
        console.log(`[Interact] Context analysis determined ASK_USER is needed`)
        // Return ASK_USER response
        const privateDataFields = contextAnalysis.missingInfo
          .filter((info) => info.type === "PRIVATE_DATA")
          .map((info) => info.description || info.field)

        const response: NeedsUserInputResponse = {
          success: true,
          data: {
            status: "needs_user_input",
            thought: contextAnalysis.reasoning || "I need some additional information to complete this task.",
            userQuestion: privateDataFields.length > 0
              ? `I need the following information to proceed: ${privateDataFields.join(", ")}. Can you provide these?`
              : "I need some additional information to complete this task. Can you provide it?",
            missingInformation: contextAnalysis.missingInfo.map((info) => info.field),
            context: {
              searchPerformed: false,
              reasoning: contextAnalysis.reasoning,
            },
          },
        }

        const validatedResponse = needsUserInputResponseSchema.parse(response)
        console.log(`[Interact] Returning ASK_USER response`)
        const res = NextResponse.json(validatedResponse, { status: 200 })
        return addCorsHeaders(req, res)
      }

      // Step 3: Evaluation & Iteration (Iterative Deep Dives) - Only if WEB_SEARCH
      if (contextAnalysis.source === "WEB_SEARCH") {
        console.log(`[Interact] Executing web search with query: "${contextAnalysis.searchQuery.substring(0, 100)}..."`)
        try {
          const searchManagerResult: SearchManagerResult = await manageSearch({
            query,
            searchQuery: contextAnalysis.searchQuery,
            url,
            tenantId,
            ragChunks: chunks,
            maxAttempts: 3, // Max 3 search attempts
          })

          webSearchResult = searchManagerResult.searchResults

          console.log(
            `[Interact] Search completed: ${searchManagerResult.attempts} attempts, solved=${searchManagerResult.evaluation.solved}, results=${webSearchResult?.results.length || 0}`
          )

          // If search evaluation says we should ask user, return ASK_USER response
          if (searchManagerResult.evaluation.shouldAskUser && !searchManagerResult.evaluation.solved) {
            console.log(`[Interact] Search evaluation determined ASK_USER is needed`)
            const response: NeedsUserInputResponse = {
              success: true,
              data: {
                status: "needs_user_input",
                thought: searchManagerResult.evaluation.reasoning || "I couldn't find the information I need.",
                userQuestion: "I searched for information but couldn't find what I need. Could you provide more details or context?",
                missingInformation: contextAnalysis.missingInfo.map((info) => info.field),
                context: {
                  searchPerformed: true,
                  searchSummary: webSearchResult?.summary,
                  reasoning: searchManagerResult.evaluation.reasoning,
                },
              },
            }

            const validatedResponse = needsUserInputResponseSchema.parse(response)
            const res = NextResponse.json(validatedResponse, { status: 200 })
            return addCorsHeaders(req, res)
          }
        } catch (error: unknown) {
          console.error(`[Interact] Search management failed:`, error)
          Sentry.captureException(error, {
            tags: { component: "agent-interact", operation: "search-management" },
            extra: { query, url, tenantId, searchQuery: contextAnalysis.searchQuery },
          })
          // Continue without search - web search is optional
          webSearchResult = null
        }
      } else {
        // MEMORY or PAGE - no search needed
        console.log(`[Interact] Source is ${contextAnalysis.source}, skipping web search`)
        webSearchResult = null
      }
      
      console.log(`[Interact] Reasoning pipeline complete, creating task`)

      // Create new task with UUID and web search results
      const newTaskId = randomUUID()
      console.log(`[Interact] Creating new task ${newTaskId}`)
      await (Task as any).create({
        taskId: newTaskId,
        tenantId,
        userId,
        url,
        query,
        status: "active",
        webSearchResult: webSearchResult || undefined, // Store search results if available
      })

      currentTaskId = newTaskId
      currentStepIndex = 0
      console.log(`[Interact] Task ${newTaskId} created, proceeding to action generation`)
    }

    // Task 6: Planning Engine - Check if plan exists, generate if not
    // Note: RAG chunks already fetched earlier (before task resolution)
    let taskPlan: TaskPlan | undefined = undefined
    let currentPlanStepIndex = 0

    // Load current task to check for plan
    const currentTask = await (Task as any).findOne({ taskId: currentTaskId, tenantId }).lean().exec()

    if (currentTask?.plan) {
      // Plan exists - use it
      taskPlan = currentTask.plan as TaskPlan
      currentPlanStepIndex = taskPlan.currentStepIndex || 0
    } else {
      // No plan exists - generate one (with web search results if available)
      try {
        const generatedPlan = await generatePlan(
          query,
          url,
          dom,
          chunks,
          hasOrgKnowledge,
          webSearchResult || undefined
        )

        if (generatedPlan) {
          // Store plan in task and set status to 'executing'
          await (Task as any)
            .findOneAndUpdate(
              { taskId: currentTaskId, tenantId },
              {
                $set: {
                  plan: generatedPlan,
                  status: "executing", // Task 6: Set status to executing when plan is created
                },
              }
            )
            .exec()

          taskPlan = generatedPlan
          currentPlanStepIndex = 0
        } else {
          // Planning failed - continue without plan (backward compatibility)
          console.warn("[interact] Planning failed, continuing without plan")
        }
      } catch (planError: unknown) {
        // Planning error - log but continue without plan (backward compatibility)
        Sentry.captureException(planError)
        console.error("[interact] Planning error:", planError)
      }
    }

    // Task 6: Mark current plan step as 'active' if plan exists
    if (taskPlan && currentPlanStepIndex < taskPlan.steps.length) {
      const existingStep = taskPlan.steps[currentPlanStepIndex]
      if (existingStep) {
        taskPlan.steps[currentPlanStepIndex] = {
          ...existingStep,
          status: "active",
        }
      }
      // Update plan in database to mark step as active
      try {
        await (Task as any)
          .findOneAndUpdate(
            { taskId: currentTaskId, tenantId },
            {
              $set: {
                "plan.steps": taskPlan.steps,
              },
            }
          )
          .exec()
      } catch (planUpdateError: unknown) {
        // Log error but don't fail the request
        Sentry.captureException(planUpdateError)
        console.error("[interact] Failed to mark plan step as active:", planUpdateError)
      }
    }

    // Task 10: Refine plan step to tool action if plan exists
    let refinedToolAction: Awaited<ReturnType<typeof refineStep>> | undefined = undefined
    let thought = ""
    let action = ""
    let llmDuration = 0
    let llmResponse: Awaited<ReturnType<typeof callActionLLM>> | undefined = undefined

    if (taskPlan && currentPlanStepIndex < taskPlan.steps.length) {
      // Plan exists - try to refine the current step
      const currentPlanStep = taskPlan.steps[currentPlanStepIndex]
      if (currentPlanStep) {
        try {
          refinedToolAction = await refineStep(
            currentPlanStep,
          dom, // Current DOM
          url, // Current URL
          previousActions, // Previous actions for context
          chunks, // RAG chunks
          hasOrgKnowledge
        )

        if (refinedToolAction) {
          // Refinement succeeded
          if (refinedToolAction.toolType === "SERVER") {
            // SERVER tools not implemented yet (Phase 3+)
            // For now, fall back to regular LLM action generation
            console.warn("[interact] SERVER tool detected, falling back to LLM action generation (Phase 3+)")
            refinedToolAction = undefined // Clear to trigger fallback
          } else {
            // DOM tool - use refined action
            thought = `Refined from plan step: ${currentPlanStep.description}`
            action = refinedToolAction.action
            llmDuration = 0 // No LLM call needed for refinement
          }
        }
        } catch (refinementError: unknown) {
          // Refinement error - log but fall back to regular LLM action generation
          Sentry.captureException(refinementError)
          console.error("[interact] Step refinement error, falling back to LLM:", refinementError)
          refinedToolAction = undefined
        }
      }
    }

    // If refinement didn't produce a DOM action, use regular LLM action generation (backward compatibility)
    if (!refinedToolAction || refinedToolAction.toolType === "SERVER") {
      // Build prompt with history and RAG context
      const currentTime = new Date().toISOString()
      // Task 4: Detect client-reported failures and build system messages
      const systemMessages: string[] = []
      
      // Check if previous action failed
      const previousActionFailed =
        lastActionStatus === "failure" || (lastActionResult && !lastActionResult.success)

      if (previousActionFailed && currentSessionId) {
        const errorContext = lastActionError
          ? {
              message: lastActionError.message,
              code: lastActionError.code,
              action: lastActionError.action,
            }
          : {
              message: lastActionResult?.actualState || "The previous action did not work as expected",
              code: "UNKNOWN_ERROR",
              action: "unknown",
            }

        systemMessages.push(
          `[SYSTEM ERROR]: The previous action '${errorContext.action}' FAILED. ` +
            `Error: ${errorContext.message} (Code: ${errorContext.code || "UNKNOWN"}). ` +
            `You MUST acknowledge this failure in your <Thought> and try a different strategy. ` +
            `Do NOT try the same action again. Do NOT call finish() until you have successfully completed the task. ` +
            `If the error indicates an element was not found, try searching for text, using different selectors, or scrolling to make the element visible.`
        )

        // Also check for recent failures in message history
        const recentFailures = await (Message as any)
          .find({
            sessionId: currentSessionId,
            tenantId,
            status: "failure",
            timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
          })
          .sort({ sequenceNumber: -1 })
          .limit(3)
          .lean()
          .exec()

        if (recentFailures.length > 1) {
          systemMessages.push(
            `[SYSTEM WARNING]: Multiple actions have failed recently (${recentFailures.length} failures in the last 5 minutes). ` +
              `Please carefully review the page state and try a completely different approach. ` +
              `Consider if the task is actually achievable given the current page state.`
          )
        }
      }

      const { system, user } = buildActionPrompt({
        query,
        currentTime,
        previousActions,
        ragChunks: chunks,
        hasOrgKnowledge,
        dom,
        systemMessages: systemMessages.length > 0 ? systemMessages : undefined, // Task 4: Pass system messages
      })

      // Call LLM
      const llmStartTime = Date.now()
      try {
        llmResponse = await callActionLLM(system, user)
      } catch (llmError: unknown) {
        Sentry.captureException(llmError)
        const debugInfo = buildErrorDebugInfo(llmError, {
          code: "LLM_ERROR",
          statusCode: 500,
          endpoint: "/api/agent/interact",
          taskId: currentTaskId,
          taskState: { stepIndex: currentStepIndex, url, query: query.substring(0, 100) },
        })
        const err = errorResponse("INTERNAL_ERROR", 500, {
          code: "INTERNAL_ERROR",
          message: "Failed to call LLM",
        }, debugInfo)
        return addCorsHeaders(req, err)
      }

      if (!llmResponse) {
        const debugInfo = buildErrorDebugInfo(new Error("LLM returned empty response"), {
          code: "LLM_ERROR",
          statusCode: 500,
          endpoint: "/api/agent/interact",
          taskId: currentTaskId,
          taskState: { stepIndex: currentStepIndex },
        })
        const err = errorResponse("INTERNAL_ERROR", 500, {
          code: "INTERNAL_ERROR",
          message: "LLM returned empty response",
        }, debugInfo)
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

        const debugInfo = buildErrorDebugInfo(new Error("Failed to parse LLM response"), {
          code: "PARSE_ERROR",
          statusCode: 500,
          endpoint: "/api/agent/interact",
          taskId: currentTaskId,
          taskState: { stepIndex: currentStepIndex, status: "failed", llmResponsePreview: llmResponse.thought?.substring(0, 200) },
        })
        const err = errorResponse("INTERNAL_ERROR", 500, {
          code: "PARSE_ERROR",
          message: "Failed to parse LLM response. Expected <Thought>...</Thought><Action>...</Action>",
        }, debugInfo)
        return addCorsHeaders(req, err)
      }

      thought = parsed.thought
      action = parsed.action
      llmDuration = Date.now() - llmStartTime

      // Improvement 1: Handle dynamic googleSearch action (SERVER tool)
      const parsedActionMatch = action.match(/^(\w+)\((.*)\)$/)
      if (parsedActionMatch && parsedActionMatch[1] === "googleSearch" && parsedActionMatch[2] && currentSessionId) {
        // Extract search query from action
        const searchQueryMatch = parsedActionMatch[2].match(/^"([^"]+)"$/)
        const searchQuery = searchQueryMatch && searchQueryMatch[1] ? searchQueryMatch[1] : parsedActionMatch[2].replace(/^"|"$/g, "")

        if (searchQuery) {
          try {
            // Perform web search with refined query (use searchQuery as-is, reasoning engine already refined it)
            const searchResult = await performWebSearch(
              searchQuery, // Use the query from googleSearch() action
              url,
              tenantId,
              { strictDomainFilter: true, allowDomainExpansion: true }
            )

            if (searchResult) {
              // Update thought to include search results
              thought = `${thought}\n\n[Web Search Results]: ${searchResult.summary}\n\nTop results:\n${searchResult.results
                .slice(0, 3)
                .map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`)
                .join("\n")}`

              // Change action to continue with the task (search is complete)
              // The LLM should now have the information it needs
              action = "wait(1)" // Small wait to process search results, then continue

              // Log search execution
              console.log(`[Dynamic Search] Executed googleSearch("${searchQuery}") - found ${searchResult.results.length} results`)
            } else {
              // Search failed or returned no results
              thought = `${thought}\n\n[Web Search]: Search did not return useful results. Continuing with available information.`
              action = "wait(1)"
            }
          } catch (searchError: unknown) {
            Sentry.captureException(searchError, {
              tags: { component: "agent-interact", operation: "dynamic-search" },
              extra: { searchQuery, url, tenantId },
            })
            console.error("[Dynamic Search] Error during search:", searchError)
            thought = `${thought}\n\n[Web Search]: Search encountered an error. Continuing with available information.`
            action = "wait(1)"
          }
        }
      }

      // Improvement 4: Handle verifySuccess action - explicit verification state
      if (parsedActionMatch && parsedActionMatch[1] === "verifySuccess" && parsedActionMatch[2] && currentSessionId) {
        // Extract verification description
        const verifyDescMatch = parsedActionMatch[2].match(/^"([^"]+)"$/)
        const verifyDescription = verifyDescMatch && verifyDescMatch[1] ? verifyDescMatch[1] : parsedActionMatch[2].replace(/^"|"$/g, "")

        // Check for recent failures
        const recentFailures = await (Message as any)
          .find({
            sessionId: currentSessionId,
            tenantId,
            status: "failure",
            timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
          })
          .sort({ sequenceNumber: -1 })
          .lean()
          .exec()

        if (recentFailures.length > 0) {
          // Recent failures exist - verification is required
          // The LLM has provided verification description, now allow finish() if it confirms
          thought = `${thought}\n\n[Verification]: ${verifyDescription}\n\nBased on this verification, the task appears to be complete.`
          // Keep verifySuccess action - it will be saved to message history as verification record
          console.log(`[Verification] Agent verified success: ${verifyDescription}`)
        } else {
          // No recent failures - verification not needed, convert to finish()
          thought = `${thought}\n\n[Verification]: ${verifyDescription}`
          action = "finish()"
        }
      }

      // Task 4: Validate finish() actions - prevent premature completion (Improvement 4: Enhanced)
      if (parsedActionMatch && parsedActionMatch[1] === "finish" && currentSessionId) {
        // Check if there are recent failures
        const recentFailures = await (Message as any)
          .find({
            sessionId: currentSessionId,
            tenantId,
            status: "failure",
            timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
          })
          .sort({ sequenceNumber: -1 })
          .lean()
          .exec()

        if (recentFailures.length > 0) {
          // Improvement 4: Instead of just warning, force verifySuccess action
          // Check if there's a recent verifySuccess action
          const recentVerification = await (Message as any)
            .find({
              sessionId: currentSessionId,
              tenantId,
              actionString: { $regex: /^verifySuccess\(/ },
              timestamp: { $gte: new Date(Date.now() - 2 * 60 * 1000) }, // Last 2 minutes
            })
            .sort({ sequenceNumber: -1 })
            .limit(1)
            .lean()
            .exec()

          if (recentVerification.length === 0) {
            // No recent verification - force verification step
            thought = `[SYSTEM]: You attempted to finish(), but there were ${recentFailures.length} recent failure(s). You MUST first verify the task is complete by describing what visual element or page state confirms success. Use verifySuccess("description") to verify before finishing.`
            action = "verifySuccess(\"Please describe what confirms the task is complete\")"

            Sentry.captureMessage("LLM attempted finish() without verification after failures", {
              level: "warning",
              tags: { component: "agent-interact", operation: "finish-validation" },
              extra: {
                sessionId: currentSessionId,
                taskId: currentTaskId,
                recentFailuresCount: recentFailures.length,
              },
            })
            console.warn(
              `[interact] Forced verifySuccess() - LLM attempted finish() after ${recentFailures.length} recent failures without verification`
            )
          } else {
            // Verification exists - allow finish() but log
            Sentry.captureMessage("LLM attempted finish() after verification", {
              level: "info",
              tags: { component: "agent-interact", operation: "finish-validation" },
              extra: {
                sessionId: currentSessionId,
                taskId: currentTaskId,
                recentFailuresCount: recentFailures.length,
                verificationMessage: recentVerification[0].content?.substring(0, 100),
              },
            })
          }
        }
      }
    }

    // CRITICAL: Final validation check - ALL actions must pass this validation
    // This validates actions from: main LLM, step refinement, self-correction, etc.
    const actionValidation = validateActionName(action)
    if (!actionValidation.valid) {
      // Mark task as failed
      await (Task as any)
        .findOneAndUpdate({ taskId: currentTaskId, tenantId }, { status: "failed" })
        .exec()

      const debugInfo = buildErrorDebugInfo(new Error(`Invalid action: ${actionValidation.error}`), {
        code: "INVALID_ACTION_FORMAT",
        statusCode: 400,
        endpoint: "/api/agent/interact",
        taskId: currentTaskId,
        taskState: { stepIndex: currentStepIndex, status: "failed", action, thought, validationError: actionValidation.error },
      })
      console.error(`[Interact] Invalid action format for task ${currentTaskId}:`, {
        action,
        error: actionValidation.error,
        stepIndex: currentStepIndex,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "INVALID_ACTION_FORMAT",
        message: actionValidation.error || `Invalid action format: ${action}. Action must be one of: click(elementId), setValue(elementId, "text"), finish(), fail(reason)`,
      }, debugInfo)
      return addCorsHeaders(req, err)
    }

    // Calculate total request duration (from startTime to now, before saving)
    const totalRequestDuration = Date.now() - startTime

    // Prepare metrics for task action
    const actionMetrics = {
      requestDuration: totalRequestDuration,
      ragDuration,
      llmDuration,
        tokenUsage: llmResponse?.usage
        ? {
            promptTokens: llmResponse.usage.promptTokens,
            completionTokens: llmResponse.usage.completionTokens,
          }
        : undefined,
    }

    // Task 9: Generate expected outcome using Outcome Prediction Engine
    let expectedOutcome: ExpectedOutcome | undefined = undefined
    try {
      // Predict expected outcome for this action
      const predictedOutcome = await predictOutcome(
        action,
        thought,
        dom, // Current DOM
        url, // Current URL
        chunks, // RAG chunks
        hasOrgKnowledge
      )

      if (predictedOutcome) {
        expectedOutcome = predictedOutcome
      } else {
        // Fallback to plan step expected outcome if prediction failed
        if (taskPlan && currentPlanStepIndex < taskPlan.steps.length) {
          const planStep = taskPlan.steps[currentPlanStepIndex]
          if (planStep && planStep.expectedOutcome) {
            expectedOutcome = {
              description: planStep.expectedOutcome.description,
              ...planStep.expectedOutcome,
            }
          }
        }
      }
    } catch (predictionError: unknown) {
      // Log error but continue (graceful degradation)
      Sentry.captureException(predictionError)
      console.error("[interact] Outcome prediction error:", predictionError)

      // Fallback to plan step expected outcome if prediction failed
      if (taskPlan && currentPlanStepIndex < taskPlan.steps.length) {
        const planStep = taskPlan.steps[currentPlanStepIndex]
        if (planStep && planStep.expectedOutcome) {
          expectedOutcome = {
            description: planStep.expectedOutcome.description,
            ...planStep.expectedOutcome,
          }
        }
      }
    }

    // Append to action history with metrics, expectedOutcome, and domSnapshot (Task 7)
    try {
      await (TaskAction as any).create({
        tenantId,
        taskId: currentTaskId,
        userId,
        stepIndex: currentStepIndex,
        thought,
        action,
        metrics: actionMetrics,
        expectedOutcome: expectedOutcome || undefined, // Task 7: Store expected outcome
        domSnapshot: dom, // Task 7: Store DOM snapshot when action was taken
      })
    } catch (historyError: unknown) {
      // Unique constraint violation (duplicate stepIndex) - should not happen, but handle gracefully
      Sentry.captureException(historyError)
      console.error("[interact] Failed to save action history:", historyError)
    }

    // Update aggregate metrics in task
    let actionCount = currentStepIndex + 1 // Default fallback
    try {
      // Get current task metrics
      const currentTask = await (Task as any).findOne({ taskId: currentTaskId, tenantId }).lean().exec()
      const currentMetrics = currentTask?.metrics || {
        totalSteps: 0,
        totalRequestDuration: 0,
        totalRagDuration: 0,
        totalLlmDuration: 0,
        totalTokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
        },
        averageRequestDuration: 0,
      }

      // Calculate new aggregate metrics
      const newTotalSteps = currentMetrics.totalSteps + 1
      actionCount = newTotalSteps // Use calculated value for response
      const newTotalRequestDuration = currentMetrics.totalRequestDuration + totalRequestDuration
      const newTotalRagDuration = currentMetrics.totalRagDuration + ragDuration
      const newTotalLlmDuration = currentMetrics.totalLlmDuration + llmDuration
      const newTotalTokenUsage = {
        promptTokens:
          currentMetrics.totalTokenUsage.promptTokens + (llmResponse?.usage?.promptTokens || 0),
        completionTokens:
          currentMetrics.totalTokenUsage.completionTokens + (llmResponse?.usage?.completionTokens || 0),
      }
      const newAverageRequestDuration = newTotalRequestDuration / newTotalSteps

      // Update task with aggregate metrics
      await (Task as any)
        .findOneAndUpdate(
          { taskId: currentTaskId, tenantId },
          {
            $set: {
              metrics: {
                totalSteps: newTotalSteps,
                totalRequestDuration: newTotalRequestDuration,
                totalRagDuration: newTotalRagDuration,
                totalLlmDuration: newTotalLlmDuration,
                totalTokenUsage: newTotalTokenUsage,
                averageRequestDuration: newAverageRequestDuration,
              },
            },
          }
        )
        .exec()
    } catch (metricsError: unknown) {
      // Log error but don't fail the request
      Sentry.captureException(metricsError)
      console.error("[interact] Failed to update task metrics:", metricsError)
    }

    // Task 6: Update plan step status and currentStepIndex
    if (taskPlan) {
      try {
        // Mark current step as completed (if within plan bounds)
        // Note: Step was marked as 'active' at the start of this request (if it was the current step)
        if (currentPlanStepIndex < taskPlan.steps.length) {
          const existingStep = taskPlan.steps[currentPlanStepIndex]
          if (existingStep) {
            taskPlan.steps[currentPlanStepIndex] = {
              ...existingStep,
              status: "completed",
            }
          }
        }

        // Update plan in database
        await (Task as any)
          .findOneAndUpdate(
            { taskId: currentTaskId, tenantId },
            {
              $set: {
                "plan.steps": taskPlan.steps,
                "plan.currentStepIndex": currentPlanStepIndex + 1,
              },
            }
          )
          .exec()

        // Update currentPlanStepIndex for response
        currentPlanStepIndex = currentPlanStepIndex + 1
      } catch (planUpdateError: unknown) {
        // Log error but don't fail the request
        Sentry.captureException(planUpdateError)
        console.error("[interact] Failed to update plan:", planUpdateError)
      }
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

      // Task 3: Update session status when task completes/fails
      if (currentSessionId) {
        await (Session as any)
          .findOneAndUpdate(
            { sessionId: currentSessionId, tenantId },
            {
              $set: {
                status: isFinish ? "completed" : "failed",
              },
            }
          )
          .exec()
      }
    }

    // Get current task status for response
    const finalTask = await (Task as any).findOne({ taskId: currentTaskId, tenantId }).lean().exec()
    const taskStatus = finalTask?.status || "active"

    // Build response with metrics and plan (Task 6)
    console.log(`[Interact] Request completed for task ${currentTaskId} in ${totalRequestDuration}ms, step ${currentStepIndex}`)
    
    const response: NextActionResponse = {
      thought,
      action,
      taskId: currentTaskId,
      hasOrgKnowledge,
      usage: llmResponse?.usage,
      ragDebug,
      metrics: {
        requestDuration: totalRequestDuration,
        ragDuration,
        llmDuration,
        tokenUsage: llmResponse?.usage
          ? {
              promptTokens: llmResponse.usage.promptTokens,
              completionTokens: llmResponse.usage.completionTokens,
            }
          : undefined,
        stepIndex: currentStepIndex,
        actionCount, // Use calculated value from metrics update (or fallback)
      },
      // Task 10: Include tool action if refinement occurred
      toolAction: refinedToolAction
        ? {
            toolName: refinedToolAction.toolName,
            toolType: refinedToolAction.toolType,
            parameters: refinedToolAction.parameters,
          }
        : undefined,
      // Task 6: Include plan data in response
      plan: taskPlan
        ? {
            steps: taskPlan.steps,
            currentStepIndex: currentPlanStepIndex,
            createdAt: taskPlan.createdAt instanceof Date ? taskPlan.createdAt.toISOString() : taskPlan.createdAt,
          }
        : undefined,
      currentStep: taskPlan ? currentPlanStepIndex : undefined,
      totalSteps: taskPlan ? taskPlan.steps.length : undefined,
      status: taskStatus,
      // Task 7: Include verification result if verification occurred
      verification: verificationResult
        ? {
            success: verificationResult.success,
            confidence: verificationResult.confidence,
            reason: verificationResult.reason,
          }
        : undefined,
      // Task 9: Include expected outcome in response
      expectedOutcome: expectedOutcome || undefined,
      // Task 1: Include web search status in response
      webSearchPerformed: webSearchResult ? true : undefined,
      webSearchSummary: webSearchResult?.summary || undefined,
      // Task 3: Include session ID in response
      sessionId: currentSessionId,
    }

    // Task 3: Save assistant message before responding
    // Improvement 3: Use snapshot for DOM storage
    if (currentSessionId) {
      try {
        // Get current message count for sequence number
        const messageCount = await (Message as any)
          .countDocuments({ sessionId: currentSessionId, tenantId })
          .exec()

        // Parse action to create structured payload
        const actionPayload: Record<string, unknown> = {}
        const actionMatch = action.match(/^(\w+)\((.*)\)$/)
        if (actionMatch && actionMatch[1]) {
          actionPayload.type = actionMatch[1]
          // Try to parse parameters (simple parsing for common cases)
          const params = actionMatch[2]
          if (params) {
            // For click(123) -> { elementId: 123 }
            const numMatch = params.match(/^(\d+)$/)
            if (numMatch && numMatch[1]) {
              actionPayload.elementId = parseInt(numMatch[1], 10)
            } else {
              // For setValue(123, "text") -> { elementId: 123, text: "text" }
              const setValueMatch = params.match(/^(\d+),\s*"([^"]+)"$/)
              if (setValueMatch && setValueMatch[1] && setValueMatch[2]) {
                actionPayload.elementId = parseInt(setValueMatch[1], 10)
                actionPayload.text = setValueMatch[2]
              } else {
                actionPayload.rawParams = params
              }
            }
          }
        }

        // Improvement 3: Create snapshot for DOM (store separately to avoid bloat)
        let snapshotId: string | undefined = undefined
        let domSummary: string | undefined = undefined

        if (dom && dom.length > 0) {
          try {
            // Generate a short summary of DOM for context (max 200 chars)
            // Extract key elements: forms, buttons, inputs, headings
            const domLower = dom.toLowerCase()
            const hasForm = domLower.includes("<form") || domLower.includes("form")
            const hasButton = domLower.includes("<button") || domLower.includes('role="button"')
            const hasInput = domLower.includes("<input") || domLower.includes("<textarea")
            const hasHeading = domLower.includes("<h1") || domLower.includes("<h2") || domLower.includes("<h3")

            // Try to extract page title or heading
            const titleMatch = dom.match(/<title[^>]*>([^<]+)<\/title>/i) || dom.match(/<h1[^>]*>([^<]+)<\/h1>/i) || dom.match(/<h2[^>]*>([^<]+)<\/h2>/i)
            const pageTitle = titleMatch && titleMatch[1] ? titleMatch[1].trim().substring(0, 50) : undefined

            // Build summary
            const summaryParts: string[] = []
            if (pageTitle) {
              summaryParts.push(pageTitle)
            }
            if (hasForm) summaryParts.push("form")
            if (hasButton) summaryParts.push("buttons")
            if (hasInput) summaryParts.push("input fields")
            if (hasHeading) summaryParts.push("headings")

            domSummary = summaryParts.length > 0 ? summaryParts.join(", ") : "Page with interactive elements"
            if (domSummary.length > 200) {
              domSummary = domSummary.substring(0, 197) + "..."
            }

            // Create snapshot for full DOM (only if DOM is substantial)
            if (dom.length > 1000) {
              // Only store snapshot if DOM is large enough to warrant separate storage
              const newSnapshotId = randomUUID()
              await (Snapshot as any).create({
                snapshotId: newSnapshotId,
                sessionId: currentSessionId,
                tenantId,
                domSnapshot: dom,
                url,
                timestamp: new Date(),
                metadata: {
                  messageId: randomUUID(), // Will be updated after message creation
                },
              })
              snapshotId = newSnapshotId
            }
          } catch (snapshotError: unknown) {
            // Log error but don't fail message creation
            Sentry.captureException(snapshotError, {
              tags: { component: "agent-interact", operation: "create-snapshot" },
              extra: { sessionId: currentSessionId, tenantId },
            })
            console.error("[interact] Failed to create snapshot:", snapshotError)
          }
        }

        const newMessageId = randomUUID()

        // Update snapshot with messageId if snapshot was created
        if (snapshotId) {
          try {
            await (Snapshot as any)
              .findOneAndUpdate(
                { snapshotId, tenantId },
                {
                  $set: {
                    "metadata.messageId": newMessageId,
                  },
                }
              )
              .exec()
          } catch (updateError: unknown) {
            // Log but don't fail
            console.error("[interact] Failed to update snapshot with messageId:", updateError)
          }
        }

        await (Message as any).create({
          messageId: newMessageId,
          sessionId: currentSessionId,
          userId,
          tenantId,
          role: "assistant",
          content: thought,
          actionPayload: Object.keys(actionPayload).length > 0 ? actionPayload : undefined,
          actionString: action,
          status: "pending", // Will be updated by client after execution
          sequenceNumber: messageCount,
          timestamp: new Date(),
          // Improvement 3: Reference snapshot instead of embedding DOM
          snapshotId: snapshotId || undefined,
          domSummary: domSummary || undefined,
          metadata: {
            tokens_used: llmResponse?.usage
              ? {
                  promptTokens: llmResponse.usage.promptTokens,
                  completionTokens: llmResponse.usage.completionTokens,
                }
              : undefined,
            latency: llmDuration,
            llm_model: "gpt-4-turbo-preview",
            verification_result: verificationResult
              ? {
                  success: verificationResult.success,
                  confidence: verificationResult.confidence,
                  reason: verificationResult.reason,
                }
              : undefined,
          },
        })
      } catch (messageError: unknown) {
        // Log error but don't fail the request
        Sentry.captureException(messageError, {
          tags: { component: "agent-interact", operation: "save-message" },
          extra: { sessionId: currentSessionId, tenantId },
        })
        console.error("[interact] Failed to save message:", messageError)
      }
    }

    const duration = Date.now() - startTime
    const res = NextResponse.json(response, { status: 200 })

    // Log successful response
    await createDebugLog({
      tenantId,
      taskId: currentTaskId,
      logType: "api_response",
      endpoint: "/api/agent/interact",
      method: "POST",
      requestData: {
        url,
        query,
        dom: typeof dom === "string" && dom.length > 1000 ? `${dom.substring(0, 1000)}... [truncated]` : dom,
        taskId: requestTaskId,
      },
      responseData: response,
      headers: extractHeaders(req),
      statusCode: 200,
      duration,
      metadata: {
        hasOrgKnowledge,
        stepIndex: currentStepIndex,
        usage: llmResponse?.usage,
      },
    })

    return addCorsHeaders(req, res)
  } catch (e: unknown) {
    Sentry.captureException(e)
    const duration = Date.now() - startTime
    const errorMessage = e instanceof Error ? e.message : "An unexpected error occurred"
    const errorStack = e instanceof Error ? e.stack : undefined

    // Log error
    await createDebugLog({
      tenantId: "unknown",
      taskId,
      logType: "error",
      endpoint: "/api/agent/interact",
      method: "POST",
      requestData: requestBody,
      headers: extractHeaders(req),
      statusCode: 500,
      duration,
      error: {
        type: "INTERNAL_ERROR",
        message: errorMessage,
        stack: errorStack,
      },
    })

    const debugInfo = buildErrorDebugInfo(e, {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      endpoint: "/api/agent/interact",
      taskId,
      requestData: requestBody,
    })
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    }, debugInfo)
    return addCorsHeaders(req, err)
  }
}
