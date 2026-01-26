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
import { generatePlan } from "@/lib/agent/planning-engine"
import { verifyAction } from "@/lib/agent/verification-engine"
import { generateCorrection } from "@/lib/agent/self-correction-engine"
import { predictOutcome } from "@/lib/agent/outcome-prediction-engine"
import { refineStep } from "@/lib/agent/step-refinement-engine"
import type { TaskPlan } from "@/lib/models/task"
import { VerificationRecord, CorrectionRecord } from "@/lib/models"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import { interactRequestBodySchema, type NextActionResponse } from "@/lib/agent/schemas"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"
import { createDebugLog, extractHeaders } from "@/lib/utils/debug-logger"
import { buildErrorDebugInfo } from "@/lib/utils/error-debug"

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

  try {
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
    requestBody = (await req.json()) as unknown
    const validationResult = interactRequestBodySchema.safeParse(requestBody)

    if (!validationResult.success) {
      const debugInfo = buildErrorDebugInfo(new Error("Request validation failed"), {
        code: "VALIDATION_ERROR",
        statusCode: 400,
        endpoint: "/api/agent/interact",
        requestData: requestBody,
        validationErrors: validationResult.error.issues,
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
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
      return addCorsHeaders(req, err)
    }

    const { url, query, dom, taskId: requestTaskId } = validationResult.data
    taskId = requestTaskId

    await connectDB()

    // RAG: Fetch chunks early for use in verification/correction/planning (Task 8, Task 10)
    const ragStartTime = Date.now()
    const { chunks, hasOrgKnowledge, ragDebug } = await getRAGChunks(url, query, tenantId)
    const ragDuration = Date.now() - ragStartTime

    let currentTaskId: string
    let previousActions: Array<{ stepIndex: number; thought: string; action: string }> = []
    let currentStepIndex = 0
    // Task 7: Verification result (declared at top level for use in response)
    let verificationResult: Awaited<ReturnType<typeof verifyAction>> | undefined = undefined

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

      // Load action history (including expectedOutcome and domSnapshot for verification)
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

      // Task 7: Verify previous action if it has expectedOutcome
      if (actions.length > 0) {
        const previousAction = actions[actions.length - 1]
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
        const err = errorResponse("VALIDATION_ERROR", 400, {
          code: "MAX_STEPS_EXCEEDED",
          message: `Task exceeded maximum steps (${MAX_STEPS_PER_TASK})`,
        }, debugInfo)
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
      // No plan exists - generate one
      try {
        const generatedPlan = await generatePlan(query, url, dom, chunks, hasOrgKnowledge)

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
      const { system, user } = buildActionPrompt({
        query,
        currentTime,
        previousActions,
        ragChunks: chunks,
        hasOrgKnowledge,
        dom,
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
    }

    // Validate action format
    if (!validateActionFormat(action)) {
      // Mark task as failed
      await (Task as any)
        .findOneAndUpdate({ taskId: currentTaskId, tenantId }, { status: "failed" })
        .exec()

      const debugInfo = buildErrorDebugInfo(new Error(`Invalid action format: ${action}`), {
        code: "INVALID_ACTION_FORMAT",
        statusCode: 400,
        endpoint: "/api/agent/interact",
        taskId: currentTaskId,
        taskState: { stepIndex: currentStepIndex, status: "failed", action, thought },
      })
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "INVALID_ACTION_FORMAT",
        message: `Invalid action format: ${action}. Expected: click(id), setValue(id, "text"), finish(), or fail(reason)`,
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
    }

    // Get current task status for response
    const finalTask = await (Task as any).findOne({ taskId: currentTaskId, tenantId }).lean().exec()
    const taskStatus = finalTask?.status || "active"

    // Build response with metrics and plan (Task 6)
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
