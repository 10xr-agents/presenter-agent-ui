/**
 * Route Integration
 *
 * Bridges the interact route with the LangGraph executor.
 * Handles state conversion and response building.
 *
 * Observability:
 * - LangFuse: Traces the full interact flow (context → plan → action → verify → correct)
 * - Sentry: Captures errors only (clear separation)
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 1 Task 2
 */

import { randomUUID } from "crypto"
import * as Sentry from "@sentry/nextjs"
import { Task, TaskAction, Message, Session, VerificationRecord, CorrectionRecord } from "@/lib/models"
import type { TaskPlan } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { WebSearchResult } from "@/lib/agent/web-search"
import { executeInteractGraph, type ExecuteGraphResult } from "./executor"
import type { PreviousAction } from "./types"
import {
  startInteractTrace,
  recordNodeExecution,
  recordVerificationScore,
  recordCorrectionAttempt,
  finalizeInteractTrace,
  type InteractTraceContext,
} from "@/lib/observability"

/**
 * Input for running the graph from the route
 */
export interface RunGraphInput {
  // Auth context
  tenantId: string
  userId: string

  // Request data
  url: string
  query: string
  dom: string
  previousUrl?: string

  // Session/task context
  sessionId?: string
  taskId?: string

  // RAG context
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean
}

/**
 * Chained action in output (Phase 2 Task 1)
 */
export interface ChainedActionOutput {
  action: string
  description: string
  index: number
  canFail?: boolean
  targetElementId?: number
}

/**
 * Chain metadata in output (Phase 2 Task 1)
 */
export interface ChainMetadataOutput {
  totalActions: number
  estimatedDuration?: number
  safeToChain: boolean
  chainReason: "FORM_FILL" | "RELATED_INPUTS" | "BULK_SELECTION" | "SEQUENTIAL_STEPS" | "OPTIMIZED_PATH"
  containerSelector?: string
}

/**
 * Output from the graph execution
 */
export interface RunGraphOutput {
  // Success indicator
  success: boolean

  // Task info
  taskId: string
  isNewTask: boolean

  // Action result
  thought?: string
  action?: string

  // Action Chaining (Phase 2 Task 1)
  chainedActions?: ChainedActionOutput[]
  chainMetadata?: ChainMetadataOutput

  // Planning info
  plan?: TaskPlan
  currentStepIndex: number

  // Verification info
  verificationResult?: {
    success: boolean
    confidence: number
    reason: string
  }

  // Correction info
  correctionResult?: {
    strategy: string
    reason: string
    retryAction: string
  }

  // Expected outcome for next verification
  expectedOutcome?: ExpectedOutcome

  // Web search info
  webSearchPerformed: boolean
  webSearchSummary?: string

  // LLM metrics
  llmUsage?: {
    promptTokens: number
    completionTokens: number
  }
  llmDuration?: number

  // Complexity info (for debugging/metrics)
  complexity: string
  complexityReason: string

  // Status
  status: string
  error?: string

  // Needs user input
  needsUserInput: boolean
  userQuestion?: string
  missingInformation?: string[]

  // Timing
  graphDuration: number
}

/**
 * Load task context for an existing task
 */
async function loadTaskContext(
  taskId: string,
  tenantId: string,
  sessionId?: string
): Promise<{
  task: any
  plan?: TaskPlan
  previousActions: PreviousAction[]
  previousMessages: Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>
  lastAction?: { action: string; expectedOutcome?: ExpectedOutcome }
  correctionAttempts: number
  consecutiveFailures: number
  webSearchResult?: WebSearchResult | null
}> {
  // Load task
  const task = await (Task as any).findOne({ taskId, tenantId }).lean().exec()
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  // Load messages if session exists (for chat history)
  let previousActions: PreviousAction[] = []
  let previousMessages: Array<{ role: "user" | "assistant"; content: string; timestamp: Date }> = []

  if (sessionId) {
    const messages = await (Message as any)
      .find({ sessionId, tenantId })
      .sort({ sequenceNumber: 1 })
      .limit(50)
      .select("messageId role content actionString status error sequenceNumber timestamp domSummary")
      .lean()
      .exec()

    previousMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    }))

    // When taskId is present, use TaskAction for previousActions (continuation loop)
    // so verification runs on the next request. Otherwise use Message-based history.
    const actions = await (TaskAction as any)
      .find({ tenantId, taskId })
      .sort({ stepIndex: 1 })
      .lean()
      .exec()

    if (actions.length > 0) {
      previousActions = actions.map((a: any) => ({
        stepIndex: a.stepIndex,
        thought: a.thought,
        action: a.action,
        status: a.status,
        error: a.error,
        domSummary: a.domSummary,
      }))
    } else {
      previousActions = messages
        .filter((m: any) => m.role === "assistant" && m.actionString)
        .map((m: any, idx: number) => ({
          stepIndex: idx,
          thought: m.content,
          action: m.actionString || "",
          status: m.status,
          error: m.error,
          domSummary: m.domSummary,
        }))
    }
  } else {
    const actions = await (TaskAction as any)
      .find({ tenantId, taskId })
      .sort({ stepIndex: 1 })
      .lean()
      .exec()

    previousActions = actions.map((a: any) => ({
      stepIndex: a.stepIndex,
      thought: a.thought,
      action: a.action,
    }))
  }

  // Load last action for verification
  const lastTaskAction = await (TaskAction as any)
    .findOne({ tenantId, taskId })
    .sort({ stepIndex: -1 })
    .lean()
    .exec()

  // Count correction attempts for current step
  const correctionAttempts = lastTaskAction
    ? await (CorrectionRecord as any)
        .countDocuments({ tenantId, taskId, stepIndex: lastTaskAction.stepIndex })
    : 0

  const lastAction = lastTaskAction
    ? { action: lastTaskAction.action, expectedOutcome: lastTaskAction.expectedOutcome }
    : undefined
  console.log(
    `[RouteIntegration] loadTaskContext: taskId=${taskId}, previousActions.length=${previousActions.length}, hasLastAction=${!!lastAction}${lastAction ? `, lastAction=${lastAction.action}` : ""}`
  )
  return {
    task,
    plan: task.plan as TaskPlan | undefined,
    previousActions,
    previousMessages,
    lastAction,
    correctionAttempts,
    consecutiveFailures: task.consecutiveFailures || 0,
    webSearchResult: task.webSearchResult,
  }
}

/**
 * Create a new task
 */
async function createTask(
  tenantId: string,
  userId: string,
  url: string,
  query: string,
  webSearchResult?: WebSearchResult | null
): Promise<string> {
  const taskId = randomUUID()
  await (Task as any).create({
    taskId,
    tenantId,
    userId,
    url,
    query,
    status: "active",
    webSearchResult: webSearchResult || undefined,
  })
  return taskId
}

/**
 * Save graph results to the database
 */
async function saveGraphResults(
  tenantId: string,
  taskId: string,
  result: ExecuteGraphResult,
  sessionId?: string,
  userId?: string
): Promise<void> {
  // Persist action so next request can run verification (continuation loop)
  if (result.actionResult && userId) {
    const stepIndex = result.currentStepIndex
    console.log(
      `[RouteIntegration] saveGraphResults: creating TaskAction taskId=${taskId}, stepIndex=${stepIndex}, action=${result.actionResult.action}`
    )
    try {
      await (TaskAction as any).create({
        tenantId,
        taskId,
        userId,
        stepIndex,
        thought: result.actionResult.thought || "",
        action: result.actionResult.action,
        expectedOutcome: result.expectedOutcome ?? undefined,
        metrics: result.llmDuration
          ? { requestDuration: 0, llmDuration: result.llmDuration, tokenUsage: result.llmUsage }
          : undefined,
      })
    } catch (err: unknown) {
      console.error(
        `[RouteIntegration] saveGraphResults: TaskAction.create failed for taskId=${taskId}:`,
        err
      )
      Sentry.captureException(err, {
        extra: { taskId, stepIndex, action: result.actionResult.action, tenantId },
      })
    }
  }

  // Update task with plan if generated
  if (result.plan) {
    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        {
          $set: {
            plan: result.plan,
            status: result.status === "needs_user_input" ? "active" : "executing",
          },
        }
      )
      .exec()
  }

  // Save verification record if verification occurred
  if (result.verificationResult) {
    await (VerificationRecord as any).create({
      tenantId,
      taskId,
      stepIndex: result.currentStepIndex,
      success: result.verificationResult.success,
      confidence: result.verificationResult.confidence,
      reason: result.verificationResult.reason,
      expectedState: result.verificationResult.expectedState,
      actualState: result.verificationResult.actualState,
      comparison: result.verificationResult.comparison,
      timestamp: new Date(),
    })

    // Update consecutive failures on task
    if (result.verificationResult.success) {
      await (Task as any)
        .findOneAndUpdate(
          { taskId, tenantId },
          { $set: { consecutiveFailures: 0 } }
        )
        .exec()
    }
  }

  // Save correction record if correction occurred
  if (result.correctionResult) {
    const attemptNumber = result.correctionAttempts + 1
    const originalStep = {
      description: result.verificationResult?.reason ?? "Action failed verification",
      action: result.lastAction ?? undefined,
    }
    const correctedStep = result.correctionResult.correctedStep
      ? {
          description: result.correctionResult.correctedStep.description,
          action: result.correctionResult.retryAction,
          expectedOutcome: result.correctionResult.correctedStep.expectedOutcome,
        }
      : {
          description: `Correction: ${result.correctionResult.reason}`,
          action: result.correctionResult.retryAction,
        }
    await (CorrectionRecord as any).create({
      tenantId,
      taskId,
      stepIndex: result.currentStepIndex,
      originalStep,
      correctedStep,
      strategy: result.correctionResult.strategy,
      reason: result.correctionResult.reason,
      attemptNumber,
      timestamp: new Date(),
    })

    // Update task status
    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        {
          $set: {
            status: "correcting",
            consecutiveFailures: result.consecutiveFailures,
          },
        }
      )
      .exec()

    // Update plan step if applicable
    if (result.plan && result.correctionResult.correctedStep) {
      const stepIndex = result.currentStepIndex
      if (stepIndex < result.plan.steps.length) {
        result.plan.steps[stepIndex] = result.correctionResult.correctedStep
        await (Task as any)
          .findOneAndUpdate(
            { taskId, tenantId },
            { $set: { "plan.steps": result.plan.steps } }
          )
          .exec()
      }
    }
  }

  // Save web search result if performed
  if (result.webSearchResult) {
    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        { $set: { webSearchResult: result.webSearchResult } }
      )
      .exec()
  }
}

/**
 * Run the interact graph from the route
 *
 * Includes LangFuse tracing for full flow observability:
 * - Creates a trace for each interact request
 * - Records node executions as spans
 * - Records verification results as scores
 * - Records correction attempts
 *
 * @param input - Input data from the route
 * @returns Output for building the response
 */
export async function runInteractGraph(input: RunGraphInput): Promise<RunGraphOutput> {
  const { tenantId, userId, url, query, dom, previousUrl, sessionId, taskId, ragChunks, hasOrgKnowledge } = input
  const startTime = Date.now()

  console.log(`[RouteIntegration] Running graph for tenant ${tenantId}`)

  // Start LangFuse trace for this interact request
  // LangFuse captures: traces (via observeOpenAI), generations, scores, latency
  // Sentry captures: errors only (set up in catch block)
  let traceCtx: InteractTraceContext = { enabled: false, metadata: {} }

  try {
    let isNewTask = !taskId
    let currentTaskId = taskId
    let taskContext: Awaited<ReturnType<typeof loadTaskContext>> | null = null

    // Load task context if existing task
    if (taskId) {
      try {
        taskContext = await loadTaskContext(taskId, tenantId, sessionId)

        // Check task status
        if (taskContext.task.status === "completed" || taskContext.task.status === "failed") {
          return {
            success: false,
            taskId,
            isNewTask: false,
            currentStepIndex: 0,
            webSearchPerformed: false,
            complexity: "COMPLEX",
            complexityReason: "Task already completed/failed",
            status: taskContext.task.status,
            error: `Task ${taskId} is already ${taskContext.task.status}`,
            needsUserInput: false,
            graphDuration: Date.now() - startTime,
          }
        }
      } catch (error: unknown) {
        return {
          success: false,
          taskId: taskId || "",
          isNewTask: false,
          currentStepIndex: 0,
          webSearchPerformed: false,
          complexity: "COMPLEX",
          complexityReason: "Task load error",
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to load task",
          needsUserInput: false,
          graphDuration: Date.now() - startTime,
        }
      }
    }

    if (currentTaskId && taskContext) {
      console.log(
        `[RouteIntegration] Executing graph for existing task: taskId=${currentTaskId}, previousActions.length=${taskContext.previousActions.length}, lastAction=${taskContext.lastAction?.action ?? "none"}`
      )
    }

    // Execute the graph
    const graphResult = await executeInteractGraph({
      tenantId,
      userId,
      url,
      query,
      dom,
      previousUrl,
      sessionId,
      taskId: currentTaskId,
      isNewTask,
      ragChunks,
      hasOrgKnowledge,
      plan: taskContext?.plan,
      currentStepIndex: taskContext?.previousActions.length || 0,
      previousActions: taskContext?.previousActions || [],
      previousMessages: taskContext?.previousMessages || [],
      lastActionExpectedOutcome: taskContext?.lastAction?.expectedOutcome,
      lastAction: taskContext?.lastAction?.action,
      correctionAttempts: taskContext?.correctionAttempts || 0,
      consecutiveFailures: taskContext?.consecutiveFailures || 0,
      webSearchResult: taskContext?.webSearchResult,
    })

    // Start LangFuse trace after we know the complexity
    // This ensures we have accurate metadata for the trace
    traceCtx = await startInteractTrace({
      tenantId,
      userId,
      sessionId,
      taskId: currentTaskId,
      query,
      url,
      complexity: graphResult.complexity,
      tags: [
        `tenant:${tenantId}`,
        isNewTask ? "new_task" : "existing_task",
        hasOrgKnowledge ? "has_org_knowledge" : "no_org_knowledge",
      ],
    })

    // Record key node executions in LangFuse
    if (traceCtx.enabled) {
      // Record complexity check
      await recordNodeExecution(traceCtx, {
        name: "complexity_check",
        input: { query, domLength: dom.length },
        output: {
          complexity: graphResult.complexity,
          reason: graphResult.complexityReason,
        },
      })

      // Record context analysis if performed
      if (graphResult.contextAnalysis) {
        await recordNodeExecution(traceCtx, {
          name: "context_analysis",
          input: { query, hasOrgKnowledge },
          output: graphResult.contextAnalysis,
        })
      }

      // Record planning if performed
      if (graphResult.plan) {
        await recordNodeExecution(traceCtx, {
          name: "planning",
          input: { query, complexity: graphResult.complexity },
          output: {
            stepCount: graphResult.plan.steps.length,
            firstStep: graphResult.plan.steps[0]?.description,
          },
        })
      }

      // Record verification result as score
      if (graphResult.verificationResult) {
        await recordVerificationScore(traceCtx, {
          success: graphResult.verificationResult.success,
          confidence: graphResult.verificationResult.confidence,
          reason: graphResult.verificationResult.reason,
        })
      }

      // Record correction attempt
      if (graphResult.correctionResult) {
        await recordCorrectionAttempt(traceCtx, {
          strategy: graphResult.correctionResult.strategy,
          success: true, // We got a corrected action
          attemptNumber: graphResult.correctionAttempts + 1,
          reason: graphResult.correctionResult.reason,
        })
      }

      // Record action generation
      if (graphResult.actionResult) {
        await recordNodeExecution(traceCtx, {
          name: graphResult.complexity === "SIMPLE" ? "direct_action" : "action_generation",
          input: { query, currentStep: graphResult.currentStepIndex },
          output: {
            action: graphResult.actionResult.action,
            thoughtLength: graphResult.actionResult.thought?.length || 0,
          },
          durationMs: graphResult.llmDuration,
          metadata: {
            usage: graphResult.llmUsage,
          },
        })
      }
    }

    // Create new task if needed
    if (isNewTask && graphResult.status !== "needs_user_input" && graphResult.actionResult) {
      currentTaskId = await createTask(
        tenantId,
        userId,
        url,
        query,
        graphResult.webSearchResult
      )
      isNewTask = true
    }

    // Save results if we have a task
    if (currentTaskId) {
      await saveGraphResults(tenantId, currentTaskId, graphResult, sessionId, userId)
    }

    const graphDuration = Date.now() - startTime

    // Finalize LangFuse trace with results
    await finalizeInteractTrace(traceCtx, {
      status: graphResult.status,
      action: graphResult.actionResult?.action,
      thought: graphResult.actionResult?.thought,
      durationMs: graphDuration,
      complexity: graphResult.complexity,
    })

    // Build output
    return {
      success: graphResult.success,
      taskId: currentTaskId || "",
      isNewTask,
      thought: graphResult.actionResult?.thought,
      action: graphResult.actionResult?.action,
      // Action Chaining (Phase 2 Task 1)
      chainedActions: graphResult.actionResult?.chainedActions?.map((a) => ({
        action: a.action,
        description: a.description,
        index: a.index,
        canFail: a.canFail,
        targetElementId: a.targetElementId,
      })),
      chainMetadata: graphResult.actionResult?.chainMetadata
        ? {
            totalActions: graphResult.actionResult.chainMetadata.totalActions,
            estimatedDuration: graphResult.actionResult.chainMetadata.estimatedDuration,
            safeToChain: graphResult.actionResult.chainMetadata.safeToChain,
            chainReason: graphResult.actionResult.chainMetadata.chainReason,
            containerSelector: graphResult.actionResult.chainMetadata.containerSelector,
          }
        : undefined,
      plan: graphResult.plan,
      currentStepIndex: graphResult.currentStepIndex,
      verificationResult: graphResult.verificationResult
        ? {
            success: graphResult.verificationResult.success,
            confidence: graphResult.verificationResult.confidence,
            reason: graphResult.verificationResult.reason,
          }
        : undefined,
      correctionResult: graphResult.correctionResult
        ? {
            strategy: graphResult.correctionResult.strategy,
            reason: graphResult.correctionResult.reason,
            retryAction: graphResult.correctionResult.retryAction,
          }
        : undefined,
      expectedOutcome: graphResult.expectedOutcome,
      webSearchPerformed: !!graphResult.webSearchResult,
      webSearchSummary: graphResult.webSearchResult?.summary,
      llmUsage: graphResult.llmUsage,
      llmDuration: graphResult.llmDuration,
      complexity: graphResult.complexity,
      complexityReason: graphResult.complexityReason,
      status: graphResult.status,
      error: graphResult.error,
      needsUserInput: graphResult.status === "needs_user_input",
      userQuestion: graphResult.contextAnalysis?.missingInfo
        .filter((info) => info.type === "PRIVATE_DATA")
        .map((info) => info.description || info.field)
        .join(", "),
      missingInformation: graphResult.contextAnalysis?.missingInfo.map((info) => info.field),
      graphDuration,
    }
  } catch (error: unknown) {
    const graphDuration = Date.now() - startTime

    // Sentry captures errors (NOT LangFuse - clear separation)
    Sentry.captureException(error, {
      tags: { component: "route-integration" },
      extra: { tenantId, query: query.substring(0, 100), taskId },
    })

    console.error(`[RouteIntegration] Error:`, error)

    // Finalize LangFuse trace with error status
    await finalizeInteractTrace(traceCtx, {
      status: "failed",
      durationMs: graphDuration,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return {
      success: false,
      taskId: taskId || "",
      isNewTask: !taskId,
      currentStepIndex: 0,
      webSearchPerformed: false,
      complexity: "COMPLEX",
      complexityReason: "Error",
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      needsUserInput: false,
      graphDuration,
    }
  }
}
