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
import { parseFinishMessage, extractActionName } from "@/lib/agent/action-parser"
import {
  enhancePromptForChaining,
  identifyChainableGroups,
} from "@/lib/agent/chaining"
import { callActionLLM } from "@/lib/agent/llm-client"
import { handleMemoryAction, isMemoryAction, parseMemoryAction } from "@/lib/agent/memory"
import { computeContextRequestForAction } from "@/lib/agent/page-state-negotiation"
import { buildActionPrompt } from "@/lib/agent/prompt-builder"
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
    planExhausted,
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
    // Backend-driven negotiation: request heavier artifacts only when needed.
    const contextRequest = computeContextRequestForAction({
      query,
      dom: state.dom,
      screenshot: state.screenshot,
      skeletonDom: state.skeletonDom,
      interactiveTree: state.interactiveTree,
    })
    if (contextRequest) {
      log.info("Requesting additional page context (semantic-first)", {
        requestedDomMode: contextRequest.requestedDomMode,
        needsScreenshot: contextRequest.needsScreenshot ?? false,
        needsSkeletonDom: contextRequest.needsSkeletonDom ?? false,
      })
      return {
        status: contextRequest.requestedDomMode === "full" ? "needs_full_dom" : "needs_context",
        requestedDomMode: contextRequest.requestedDomMode,
        needsScreenshot: contextRequest.needsScreenshot,
        needsSkeletonDom: contextRequest.needsSkeletonDom,
        needsContextReason: contextRequest.reason,
      }
    }

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
    } else if (planExhausted && plan) {
      // All plan steps have been executed - tell LLM to check goal completion
      systemMessages.push(
        `PLAN COMPLETED: All ${plan.steps.length} planned steps have been executed. ` +
        `Check if the user's original goal "${query}" has been achieved. ` +
        `If the goal is complete (e.g., form submitted, invitation sent, action confirmed), call finish("Goal achieved: [brief description]"). ` +
        `If something is still missing or needs verification, take one more action to verify or complete.`
      )
      log.info(`Plan exhausted - instructing LLM to check goal completion`)
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
    const { system, user, useVisualMode } = buildActionPrompt({
      query,
      currentTime: new Date().toISOString(),
      previousActions,
      ragChunks,
      hasOrgKnowledge,
      dom,
      systemMessages,
      hybridOptions: {
        domMode: state.domMode,
        screenshot: state.screenshot,
        skeletonDom: state.skeletonDom,
        interactiveTree: state.interactiveTree,
        viewport: state.viewport,
        pageTitle: state.pageTitle,
        scrollPosition: state.scrollPosition,
        recentEvents: state.recentEvents,
        hasErrors: state.hasErrors,
        hasSuccess: state.hasSuccess,
      },
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
      images:
        useVisualMode && state.screenshot
          ? [{ data: state.screenshot, mimeType: "image/jpeg" }]
          : undefined,
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

    // Structured output returns thought/action only; chaining from raw LLM text is disabled.
    // callActionLLM returns structured output (thought, action) from Gemini JSON schema
    const { thought, action } = llmResponse

    // Handle special actions
    // googleSearch action - execute web search inline
    // Note: We skip the inline search in graph execution and let the route handle it
    // This simplifies the graph logic and avoids needing tenantId in this node
    // The original route.ts code handles googleSearch() actions properly

    // Handle memory actions (SERVER tools)
    const actionNameFromResponse = extractActionName(action)
    if (actionNameFromResponse && isMemoryAction(actionNameFromResponse)) {
      log.info(`Memory action detected: ${actionNameFromResponse}`)

      if (state.taskId && state.sessionId) {
        try {
          const parsed = parseMemoryAction(action)
          if (parsed) {
            const memoryResult = await handleMemoryAction({
              actionName: parsed.actionName as "remember" | "recall" | "exportToSession",
              taskId: state.taskId,
              sessionId: state.sessionId,
              parameters: parsed.parameters,
            })

            log.info(`Memory action result: ${memoryResult.message}`, {
              success: memoryResult.success,
              key: memoryResult.key,
            })

            return {
              actionResult: {
                thought: `${thought}\n\nMemory operation: ${memoryResult.message}`,
                action,
                toolAction: {
                  toolName: actionNameFromResponse,
                  toolType: "SERVER",
                  parameters: parsed.parameters,
                  memoryResult,
                },
              },
              llmUsage: llmResponse.usage,
              llmDuration,
              status: "executing",
            }
          }
        } catch (error: unknown) {
          log.error("Memory action error", error)
          // Continue with normal flow on error
        }
      } else {
        log.warn("Memory action requested but missing taskId or sessionId")
      }
    }

    // Validate action name
    if (!validateActionName(action)) {
      log.error(`Invalid action name: ${action}`)
      return {
        error: `Invalid action: ${action}`,
        status: "failed",
      }
    }

    // Build action result (single action; chaining not used with structured output)
    // Extract finishMessage if this is a finish action (deterministic parsing, no regex)
    const finishMessage = parseFinishMessage(action)

    const actionResult: {
      thought: string
      action: string
      finishMessage?: string
      chainedActions?: ChainedActionResult[]
      chainMetadata?: ChainMetadataResult
    } = {
      thought,
      action,
      ...(finishMessage && { finishMessage }),
    }

    log.info(`Generated single action: ${action} (${llmDuration}ms)`, {
      hasFinishMessage: !!finishMessage,
    })

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
