/**
 * Run interact graph from the route — main entry and LangFuse tracing.
 * @see INTERACT_FLOW_WALKTHROUGH.md
 */

import * as Sentry from "@sentry/nextjs"
import {
  buildActionDetails,
  extractElementMapping,
  extractElementMappingFromInteractiveTree,
  extractElementMappingFromSkeleton,
} from "@/lib/agent/dom-element-mapping"
import {
  finalizeInteractTrace,
  type InteractTraceContext,
  recordCorrectionAttempt,
  recordNodeExecution,
  recordVerificationScore,
  startInteractTrace,
} from "@/lib/observability"
import { logger } from "@/lib/utils/logger"
import { renderInteractiveTreeAsHtml } from "@/lib/agent/semantic-v3"
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
    // Hybrid Vision + Skeleton
    screenshot,
    domMode,
    skeletonDom,
    screenshotHash,
    // Semantic-first V3
    interactiveTree,
    semanticNodes,
    viewport,
    pageTitle,
    scrollPosition,
    scrollableContainers,
    recentEvents,
    hasErrors,
    hasSuccess,
  } = input
  const startTime = Date.now()

  const domStr = dom ?? ""

  // Extract element mapping for robust selector fallbacks.
  //
  // Priority order (semantic-first negotiation):
  // 1) interactiveTree (semantic) — stable IDs, canonical in new contract
  // 2) skeletonDom (if it has numeric ids)
  // 3) full dom (legacy)
  let elementMap =
    interactiveTree && interactiveTree.length > 0
      ? extractElementMappingFromInteractiveTree(interactiveTree)
      : skeletonDom
        ? extractElementMappingFromSkeleton(skeletonDom)
        : extractElementMapping(domStr)

  // If skeletonDom didn't yield any elements, fall back to dom
  // This handles the case where skeletonDom is HTML structure without element IDs
  if (elementMap.size === 0 && skeletonDom && domStr) {
    elementMap = extractElementMapping(domStr)
    if (process.env.NODE_ENV === "development") {
      if (elementMap.size > 0) {
        console.log(
          `[run-graph] Fallback: skeletonDom had no IDs, extracted ${elementMap.size} elements from dom (${domStr.length} chars)`
        )
        // Log first few elements
        const first3 = Array.from(elementMap.entries()).slice(0, 3)
        first3.forEach(([id, el]) => {
          console.log(`[run-graph] Fallback element ${id}: tag=${el.tag}, name=${el.name ?? "null"}, ariaLabel=${el.ariaLabel ?? "null"}`)
        })
      } else {
        console.log(`[run-graph] Fallback: dom also had no elements. DOM sample (first 500 chars):`)
        console.log(domStr.substring(0, 500))
      }
    }
  }
  
  // CRITICAL DEBUG: Print BOTH DOMs to understand what the LLM sees vs what we extract
  if (process.env.NODE_ENV === "development") {
    if (skeletonDom) {
      console.log(`\n========== SKELETON DOM DUMP (${skeletonDom.length} chars) ==========`)
      // Print the skeletonDom which the LLM might be using
      const chunkSize = 2000
      for (let i = 0; i < Math.min(skeletonDom.length, 8000); i += chunkSize) {
        console.log(`[SkeletonDOM chunk ${i}-${Math.min(i + chunkSize, skeletonDom.length)}]:`)
        console.log(skeletonDom.substring(i, i + chunkSize))
      }
      if (skeletonDom.length > 8000) {
        console.log(`... (truncated, total ${skeletonDom.length} chars)`)
      }
      console.log(`========== END SKELETON DOM DUMP ==========\n`)
    }
    
    if (domStr) {
      console.log(`\n========== FULL DOM DUMP (${domStr.length} chars) - first 4000 chars ==========`)
      console.log(domStr.substring(0, 4000))
      console.log(`... (truncated, total ${domStr.length} chars)`)
      console.log(`========== END FULL DOM DUMP ==========\n`)
    }
  }

  // Debug: Log element map stats and DOM samples
  if (process.env.NODE_ENV === "development") {
    const source = interactiveTree?.length
      ? "interactiveTree"
      : skeletonDom
        ? "skeletonDom"
        : "dom"
    const sourceLen =
      source === "interactiveTree"
        ? interactiveTree?.length ?? 0
        : (skeletonDom || domStr).length
    console.log(
      `[run-graph] Element map extraction: source=${source}, size=${elementMap.size}, sourceLen=${sourceLen}`
    )
    
    // Log DOM sample to understand format (only if extraction failed)
    if (elementMap.size === 0 && sourceLen > 0) {
      console.log(`[run-graph] Source sample:`)
      if (source === "interactiveTree") {
        console.log(JSON.stringify(interactiveTree?.slice(0, 5) ?? [], null, 2))
      } else {
        const sourceData = skeletonDom || domStr
        console.log(sourceData.substring(0, 800))
      }
    }
  }

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
      dom: domStr,
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
      // Hybrid Vision + Skeleton
      screenshot,
      domMode,
      skeletonDom,
      screenshotHash,
      // Semantic-first V3
      interactiveTree,
      semanticNodes,
      viewport,
      pageTitle,
      scrollPosition,
      scrollableContainers,
      recentEvents,
      hasErrors,
      hasSuccess,
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
        input: { query, domLength: domStr.length, interactiveCount: interactiveTree?.length ?? 0 },
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
      const domForPersistence =
        domStr ||
        skeletonDom ||
        renderInteractiveTreeAsHtml(interactiveTree, recentEvents)
      await saveGraphResults(
        tenantId,
        currentTaskId,
        graphResult,
        sessionId,
        userId,
        url,
        domForPersistence
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
    // Build actionDetails with selectorPath for robust element finding
    const actionDetails = buildActionDetails(graphResult.actionResult?.action, elementMap)
    return {
      success: graphResult.success,
      taskId: currentTaskId || "",
      isNewTask,
      thought: graphResult.actionResult?.thought,
      action: graphResult.actionResult?.action,
      // Backend-driven page-state negotiation
      requestedDomMode: graphResult.requestedDomMode,
      needsSkeletonDom: graphResult.needsSkeletonDom,
      needsScreenshot: graphResult.needsScreenshot,
      needsContextReason: graphResult.needsContextReason,
      // Robust Element Selectors: Include structured action details with selectorPath
      actionDetails,
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
