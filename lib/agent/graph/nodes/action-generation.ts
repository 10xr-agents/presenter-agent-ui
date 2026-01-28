/**
 * Action Generation Node
 *
 * Generates an action using the LLM when step refinement fails
 * or when there's no plan. This is the fallback path for action generation.
 *
 * Supports Action Chaining (Phase 2 Task 1):
 * - Detects form-fill and batch operation opportunities
 * - Generates chains of related actions when safe
 * - Falls back to single actions when chaining not appropriate
 */

import * as Sentry from "@sentry/nextjs"
import { validateActionName } from "@/lib/agent/action-config"
import {
  type ActionChain,
  enhancePromptForChaining,
  identifyChainableGroups,
  parseChainFromLLMResponse,
} from "@/lib/agent/chaining"
import { callActionLLM } from "@/lib/agent/llm-client"
import { buildActionPrompt, parseActionResponse } from "@/lib/agent/prompt-builder"
import { logger } from "@/lib/utils/logger"
import type { ChainedActionResult, ChainMetadataResult, InteractGraphState } from "../types"

/**
 * Action generation node - generates action via LLM
 *
 * Supports Action Chaining (Phase 2 Task 1):
 * - Analyzes task and DOM for chaining opportunities
 * - Enhances prompt with chain instructions when appropriate
 * - Parses chain responses from LLM
 * - Falls back to single actions when chaining not safe
 *
 * @param state - Current graph state
 * @returns Updated state with action result
 */
export async function actionGenerationNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const {
    query,
    url,
    dom,
    ragChunks,
    hasOrgKnowledge,
    previousActions,
    plan,
    currentStepIndex,
    verificationResult,
    correctionResult,
  } = state
  const log = logger.child({
    process: "Graph:action_generation",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  log.info("Generating action via LLM")

  const startTime = Date.now()

  try {
    // Build system messages based on context
    const systemMessages: string[] = []

    // Get current plan step for chain analysis
    let currentPlanStep: string | undefined
    if (plan && currentStepIndex < plan.steps.length) {
      const currentStep = plan.steps[currentStepIndex]
      if (currentStep) {
        currentPlanStep = currentStep.description
        systemMessages.push(`Current plan step (${currentStepIndex + 1}/${plan.steps.length}): ${currentStep.description}`)
      }
    }

    // Add verification failure context
    if (verificationResult && !verificationResult.success) {
      systemMessages.push(
        `PREVIOUS ACTION FAILED: ${verificationResult.reason}. ` +
        `Please try a different approach or selector.`
      )
    }

    // Add correction context
    if (correctionResult) {
      systemMessages.push(
        `CORRECTION APPLIED: Strategy="${correctionResult.strategy}", ` +
        `Reason="${correctionResult.reason}". Follow the suggested approach.`
      )
    }

    // Check for chaining opportunity (Phase 2 Task 1)
    // Only attempt chaining when:
    // - No verification failure (stable state)
    // - No correction in progress
    // - Task looks like form-fill or batch operation
    const canAttemptChaining =
      !verificationResult?.success === false && // No failure
      !correctionResult // No correction in progress

    // Analyze DOM for chainable action groups
    let chainOpportunity: { canChain: boolean; reason: string | null; elementIds: number[] } = {
      canChain: false,
      reason: null,
      elementIds: [],
    }

    if (canAttemptChaining && currentPlanStep) {
      chainOpportunity = identifyChainableGroups(currentPlanStep, dom, query)
      if (chainOpportunity.canChain) {
        log.info(
          `Chaining opportunity detected: ${chainOpportunity.reason}, ${chainOpportunity.elementIds.length} elements`
        )
      }
    }

    // Build prompt (enhanced with chain instructions if opportunity detected)
    const { system, user } = buildActionPrompt({
      query,
      currentTime: new Date().toISOString(),
      previousActions,
      ragChunks,
      hasOrgKnowledge,
      dom,
      systemMessages,
    })

    // Enhance prompt for chaining if opportunity detected
    const systemPrompt = chainOpportunity.canChain
      ? enhancePromptForChaining(system, currentPlanStep, dom)
      : system

    // Call LLM with cost tracking context
    const llmResponse = await callActionLLM(systemPrompt, user, {
      generationName: chainOpportunity.canChain ? "action_generation_chain" : "action_generation",
      tenantId: state.tenantId,
      userId: state.userId,
      sessionId: state.sessionId,
      taskId: state.taskId,
      actionType: "ACTION_GENERATION",
      metadata: {
        query,
        url,
        hasOrgKnowledge,
        planStep: currentStepIndex + 1,
        hasCorrection: !!correctionResult,
        hasVerificationFailure: verificationResult && !verificationResult.success,
        chainingAttempted: chainOpportunity.canChain,
      },
    })
    const llmDuration = Date.now() - startTime

    if (!llmResponse) {
      log.error("LLM returned null response")
      return {
        error: "LLM returned null response",
        status: "failed",
      }
    }

    // Try to parse chain response first (if chaining was attempted)
    let actionChain: ActionChain | null = null
    if (chainOpportunity.canChain) {
      actionChain = parseChainFromLLMResponse(llmResponse.thought, dom)
      if (actionChain) {
        log.info(
          `Chain parsed: ${actionChain.actions.length} actions, reason=${actionChain.metadata.chainReason}`
        )
      }
    }

    // Parse response (llmResponse.thought contains the raw LLM output)
    const parsedResponse = parseActionResponse(llmResponse.thought)

    if (!parsedResponse) {
      log.error("Failed to parse LLM response")
      return {
        error: "Failed to parse LLM response",
        status: "failed",
      }
    }

    const { thought, action } = parsedResponse

    // Handle special actions
    
    // googleSearch action - execute web search inline
    // Note: We skip the inline search in graph execution and let the route handle it
    // This simplifies the graph logic and avoids needing tenantId in this node
    // The original route.ts code handles googleSearch() actions properly

    // Validate action name
    if (!validateActionName(action)) {
      log.error(`Invalid action name: ${action}`)
      return {
        error: `Invalid action: ${action}`,
        status: "failed",
      }
    }

    // Build action result
    const actionResult: {
      thought: string
      action: string
      chainedActions?: ChainedActionResult[]
      chainMetadata?: ChainMetadataResult
    } = {
      thought,
      action,
    }

    // Add chain data if chain was successfully parsed
    if (actionChain && actionChain.actions.length > 1) {
      actionResult.chainedActions = actionChain.actions.map((a) => ({
        action: a.action,
        description: a.description,
        index: a.index,
        canFail: a.canFail,
        targetElementId: a.targetElementId,
      }))
      actionResult.chainMetadata = {
        totalActions: actionChain.metadata.totalActions,
        estimatedDuration: actionChain.metadata.estimatedDuration,
        safeToChain: actionChain.metadata.safeToChain,
        chainReason: actionChain.metadata.chainReason,
        containerSelector: actionChain.metadata.containerSelector,
      }

      // Update action to be the first in chain for backwards compatibility
      const firstChainAction = actionChain.actions[0]
      if (firstChainAction) {
        actionResult.action = firstChainAction.action
      }

      log.info(
        `Generated chain of ${actionChain.actions.length} actions (${llmDuration}ms)`
      )
    } else {
      log.info(`Generated single action: ${action} (${llmDuration}ms)`)
    }

    return {
      actionResult,
      llmUsage: llmResponse.usage,
      llmDuration,
      status: "executing",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-action-generation" },
      extra: { query, url },
    })
    log.error("Error", error)

    return {
      error: error instanceof Error ? error.message : "Unknown error in action generation",
      status: "failed",
    }
  }
}

/**
 * Router function after action generation
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterActionGeneration(
  state: InteractGraphState
): "outcome_prediction" | "finalize" {
  const log = logger.child({
    process: "Graph:router",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })
  if (state.status === "failed" || !state.actionResult) {
    log.info("Routing to finalize (action generation failed)")
    return "finalize"
  }

  log.info("Routing to outcome_prediction")
  return "outcome_prediction"
}
