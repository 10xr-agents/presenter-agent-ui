/**
 * Task context loading and creation for route integration.
 * @see INTERACT_FLOW_WALKTHROUGH.md
 */

import { randomUUID } from "crypto"
import type { HierarchicalPlan } from "@/lib/agent/hierarchical-planning"
import type { WebSearchResult } from "@/lib/agent/web-search"
import { CorrectionRecord, Message, Task, TaskAction } from "@/lib/models"
import type { TaskPlan } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import { logger } from "@/lib/utils/logger"
import type { PreviousAction } from "../types"

/**
 * Return type of loadTaskContext
 */
export interface LoadTaskContextResult {
  task: Record<string, unknown>
  plan?: TaskPlan
  /** Phase 4 Task 8: Hierarchical plan (sub-tasks). */
  hierarchicalPlan?: HierarchicalPlan
  previousActions: PreviousAction[]
  /** When previousActions were trimmed (rolling context), a short summary of earlier steps. */
  previousActionsSummary?: string
  /** Actual step index (from plan or full action count); use this for currentStepIndex, not trimmed previousActions.length. */
  currentStepIndex: number
  previousMessages: Array<{ role: "user" | "assistant"; content: string; timestamp: Date }>
  lastAction?: {
    action: string
    expectedOutcome?: ExpectedOutcome
    beforeState?: {
      url: string
      domHash: string
      activeElement?: string
      semanticSkeleton?: Record<string, unknown>
    }
  }
  correctionAttempts: number
  consecutiveFailures: number
  /** Semantic loop prevention: consecutive successful verifications without task_completed. */
  consecutiveSuccessWithoutTaskComplete: number
  webSearchResult?: WebSearchResult | null
}

/**
 * Load task context for an existing task
 */
export async function loadTaskContext(
  taskId: string,
  tenantId: string,
  sessionId?: string
): Promise<LoadTaskContextResult> {
  const task = await (Task as any).findOne({ taskId, tenantId }).lean().exec()
  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

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

  const lastTaskAction = await (TaskAction as any)
    .findOne({ tenantId, taskId })
    .sort({ stepIndex: -1 })
    .lean()
    .exec()

  const correctionAttempts = lastTaskAction
    ? await (CorrectionRecord as any).countDocuments({
        tenantId,
        taskId,
        stepIndex: lastTaskAction.stepIndex,
      })
    : 0

  const lastAction = lastTaskAction
    ? {
        action: lastTaskAction.action,
        expectedOutcome: lastTaskAction.expectedOutcome,
        beforeState: lastTaskAction.beforeState,
      }
    : undefined

  const log = logger.child({ process: "RouteIntegration", sessionId, taskId })
  log.info(
    `loadTaskContext: taskId=${taskId}, status=${task.status}, previousActions.length=${previousActions.length}, hasLastAction=${!!lastAction}${lastAction ? `, lastAction=${lastAction.action}` : ""}`
  )

  // Rolling summarization: keep only last 10 raw actions to avoid context explosion
  const ROLLING_CONTEXT_WINDOW = 10
  const fullActionCount = previousActions.length
  let previousActionsSummary: string | undefined
  let trimmedPreviousActions = previousActions
  if (previousActions.length > ROLLING_CONTEXT_WINDOW) {
    const kept = previousActions.length - ROLLING_CONTEXT_WINDOW
    trimmedPreviousActions = previousActions.slice(-ROLLING_CONTEXT_WINDOW)
    previousActionsSummary = `${kept} earlier steps completed.`
  }
  const currentStepIndex =
    (task.plan as TaskPlan | undefined)?.currentStepIndex ?? fullActionCount

  return {
    task,
    plan: task.plan as TaskPlan | undefined,
    hierarchicalPlan: task.hierarchicalPlan as HierarchicalPlan | undefined,
    previousActions: trimmedPreviousActions,
    previousActionsSummary,
    currentStepIndex,
    previousMessages,
    lastAction,
    correctionAttempts,
    consecutiveFailures: task.consecutiveFailures || 0,
    consecutiveSuccessWithoutTaskComplete:
      (task as any).consecutiveSuccessWithoutTaskComplete ?? 0,
    webSearchResult: task.webSearchResult,
  }
}

/**
 * Create a new task
 * @param provisionalTaskId - Optional pre-generated taskId (for logging traceability)
 */
export async function createTask(
  tenantId: string,
  userId: string,
  url: string,
  query: string,
  webSearchResult?: WebSearchResult | null,
  provisionalTaskId?: string
): Promise<string> {
  const taskId = provisionalTaskId || randomUUID()
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
