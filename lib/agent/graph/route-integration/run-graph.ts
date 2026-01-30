/**
 * Run interact graph from the route — main entry and LangFuse tracing.
 * @see INTERACT_FLOW_WALKTHROUGH.md
 */

import * as Sentry from "@sentry/nextjs"
import {
  finalizeInteractTrace,
  type InteractTraceContext,
  recordCorrectionAttempt,
  recordNodeExecution,
  recordVerificationScore,
  startInteractTrace,
} from "@/lib/observability"
import { logger } from "@/lib/utils/logger"
import { createTask, loadTaskContext } from "./context"
import { saveGraphResults } from "./persistence"
import type { RunGraphInput, RunGraphOutput } from "./types"
import { executeInteractGraph } from "../executor"

/**
 * Run the interact graph from the route.
 * Loads task context, executes graph, saves results, records LangFuse trace.
 */
export async function runInteractGraph(input: RunGraphInput): Promise<RunGraphOutput> {
  const {
    tenantId,
    userId,
    url,
    query,
    dom,
    previousUrl,
    sessionId,
    taskId,
    ragChunks,
    hasOrgKnowledge,
    clientVerification,
  } = input
  const startTime = Date.now()

  // Provisional ID Pattern: Generate taskId upfront for new tasks (logging traceability)
  // The ID is used for all logging but only persisted to DB on successful action generation
  const isNewTask = !taskId
  const provisionalTaskId = isNewTask ? crypto.randomUUID() : undefined
  let currentTaskId = taskId || provisionalTaskId

  const log = logger.child({ process: "RouteIntegration", sessionId, taskId: currentTaskId ?? "" })

  log.info(`Running graph for tenant ${tenantId}`)

  let traceCtx: InteractTraceContext = { enabled: false, metadata: {} }

  try {
    let taskContext: Awaited<ReturnType<typeof loadTaskContext>> | null = null

    if (taskId) {
      try {
        taskContext = await loadTaskContext(taskId, tenantId, sessionId)

        if (taskContext.task.status === "completed" || taskContext.task.status === "failed") {
          const terminalStatus = taskContext.task.status as string
          const thought =
            terminalStatus === "completed"
              ? "This task is already completed. No further action needed."
              : "This task already failed. You can start a new task or rephrase your request."
          log.info(`Task already ${terminalStatus}, returning 200 with action=finish() so client can stop cleanly`)
          return {
            success: true,
            taskId,
            isNewTask: false,
            thought,
            action: "finish()",
            currentStepIndex: 0,
            webSearchPerformed: false,
            complexity: "COMPLEX",
            complexityReason: "Task already completed/failed",
            status: terminalStatus,
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
      log.info(
        `Executing graph for existing task: taskId=${currentTaskId}, status=${taskContext.task.status}, previousActions.length=${taskContext.previousActions.length}, lastAction=${taskContext.lastAction?.action ?? "none"}`,
        { taskId: currentTaskId }
      )
    }

    // One Langfuse trace per interact request (per message) for cost and request tracing
    const langfuseTraceId = crypto.randomUUID()

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
      langfuseTraceId,
      ragChunks,
      hasOrgKnowledge,
      plan: taskContext?.plan,
      currentStepIndex: taskContext?.currentStepIndex ?? 0,
      hierarchicalPlan: taskContext?.hierarchicalPlan,
      previousActions: taskContext?.previousActions || [],
      previousActionsSummary: taskContext?.previousActionsSummary,
      previousMessages: taskContext?.previousMessages || [],
      lastActionExpectedOutcome: taskContext?.lastAction?.expectedOutcome,
      lastAction: taskContext?.lastAction?.action,
      lastActionBeforeState: taskContext?.lastAction?.beforeState,
      clientVerification,
      clientObservations: input.clientObservations,
      correctionAttempts: taskContext?.correctionAttempts || 0,
      consecutiveFailures: taskContext?.consecutiveFailures || 0,
      consecutiveSuccessWithoutTaskComplete:
        taskContext?.consecutiveSuccessWithoutTaskComplete ?? 0,
      webSearchResult: taskContext?.webSearchResult,
    })

    traceCtx = await startInteractTrace({
      tenantId,
      userId,
      sessionId,
      taskId: currentTaskId,
      query,
      url,
      complexity: graphResult.complexity,
      traceId: langfuseTraceId,
      tags: [
        `tenant:${tenantId}`,
        isNewTask ? "new_task" : "existing_task",
        hasOrgKnowledge ? "has_org_knowledge" : "no_org_knowledge",
      ],
    })

    if (traceCtx.enabled) {
      await recordNodeExecution(traceCtx, {
        name: "complexity_check",
        input: { query, domLength: dom.length },
        output: {
          complexity: graphResult.complexity,
          reason: graphResult.complexityReason,
        },
      })

      if (graphResult.contextAnalysis) {
        await recordNodeExecution(traceCtx, {
          name: "context_analysis",
          input: { query, hasOrgKnowledge },
          output: graphResult.contextAnalysis,
        })
      }

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

      if (graphResult.verificationResult) {
        await recordVerificationScore(traceCtx, {
          success: graphResult.verificationResult.success,
          confidence: graphResult.verificationResult.confidence,
          reason: graphResult.verificationResult.reason,
        })
      }

      if (graphResult.correctionResult) {
        await recordCorrectionAttempt(traceCtx, {
          strategy: graphResult.correctionResult.strategy,
          success: true,
          attemptNumber: graphResult.correctionAttempts + 1,
          reason: graphResult.correctionResult.reason,
        })
      }

      if (graphResult.actionResult) {
        await recordNodeExecution(traceCtx, {
          name: graphResult.complexity === "SIMPLE" ? "direct_action" : "action_generation",
          input: { query, currentStep: graphResult.currentStepIndex },
          output: {
            action: graphResult.actionResult.action,
            thoughtLength: graphResult.actionResult.thought?.length ?? 0,
          },
          durationMs: graphResult.llmDuration,
          metadata: { usage: graphResult.llmUsage },
        })
      }
    }

    // Persist task to DB only on successful action generation (not for needs_user_input or failures)
    // Use the provisional taskId we generated at the start for logging traceability
    if (isNewTask && graphResult.status !== "needs_user_input" && graphResult.actionResult) {
      currentTaskId = await createTask(
        tenantId,
        userId,
        url,
        query,
        graphResult.webSearchResult,
        provisionalTaskId // Use pre-generated ID so logs match the persisted task
      )
    }

    if (currentTaskId) {
      await saveGraphResults(
        tenantId,
        currentTaskId,
        graphResult,
        sessionId,
        userId,
        url,
        input.dom
      )
    }

    const graphDuration = Date.now() - startTime

    await finalizeInteractTrace(traceCtx, {
      status: graphResult.status,
      action: graphResult.actionResult?.action,
      thought: graphResult.actionResult?.thought,
      durationMs: graphDuration,
      complexity: graphResult.complexity,
    })

    const missingInfo = graphResult.contextAnalysis?.missingInfo
    return {
      success: graphResult.success,
      taskId: currentTaskId || "",
      isNewTask,
      thought: graphResult.actionResult?.thought,
      action: graphResult.actionResult?.action,
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
      userQuestion: missingInfo
        ?.filter((info) => info.type === "PRIVATE_DATA")
        .map((info) => info.description || info.field)
        .join(", "),
      missingInformation: missingInfo?.map((info) => info.field),
      graphDuration,
    }
  } catch (error: unknown) {
    const graphDuration = Date.now() - startTime

    Sentry.captureException(error, {
      tags: { component: "route-integration" },
      extra: { tenantId, query: query.substring(0, 100), taskId: currentTaskId },
    })

    log.error("Error", error, { taskId: currentTaskId ?? "" })

    await finalizeInteractTrace(traceCtx, {
      status: "failed",
      durationMs: graphDuration,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return {
      success: false,
      taskId: currentTaskId || "",
      isNewTask,
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
