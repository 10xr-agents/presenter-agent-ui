/**
 * Direct Action Node
 *
 * Fast-path for SIMPLE tasks. Skips planning and reasoning,
 * directly generates an action using the LLM.
 *
 * This node is optimized for single-action tasks like:
 * - "Click the Logout button"
 * - "Press Submit"
 * - "Go back"
 */

import * as Sentry from "@sentry/nextjs"
import { callActionLLM } from "@/lib/agent/llm-client"
import { computeContextRequestForAction } from "@/lib/agent/page-state-negotiation"
import { buildActionPrompt } from "@/lib/agent/prompt-builder"
import { logger } from "@/lib/utils/logger"
import type { InteractGraphState } from "../types"

/**
 * Direct action node - generates action without planning (fast path)
 *
 * @param state - Current graph state
 * @returns Updated state with action result
 */
export async function directActionNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { query, url, dom, ragChunks, hasOrgKnowledge, previousActions } = state
  const log = logger.child({
    process: "Graph:direct_action",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  log.info(`Fast-path action generation for: "${query.substring(0, 50)}..."`)

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

    // Build a simplified prompt for direct action
    // No system messages about failures since this is a new simple task
    const { system, user, useVisualMode } = buildActionPrompt({
      query,
      currentTime: new Date().toISOString(),
      previousActions,
      ragChunks,
      hasOrgKnowledge,
      dom,
      systemMessages: [],
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

    // Call LLM with cost tracking context (fast path)
    const llmResponse = await callActionLLM(system, user, {
      generationName: "direct_action",
      tenantId: state.tenantId,
      userId: state.userId,
      sessionId: state.sessionId,
      taskId: state.taskId,
      actionType: "DIRECT_ACTION",
      images:
        useVisualMode && state.screenshot
          ? [{ data: state.screenshot, mimeType: "image/jpeg" }]
          : undefined,
      metadata: {
        query,
        url,
        hasOrgKnowledge,
        complexity: "SIMPLE",
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

    // callActionLLM returns structured output (thought, action) from Gemini JSON schema
    log.info(`Generated action: ${llmResponse.action} (${llmDuration}ms)`)

    return {
      actionResult: {
        thought: llmResponse.thought,
        action: llmResponse.action,
      },
      llmUsage: llmResponse.usage,
      llmDuration,
      status: "executing",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-direct-action" },
      extra: { query, url },
    })
    log.error("Error", error)

    return {
      error: error instanceof Error ? error.message : "Unknown error in direct action",
      status: "failed",
    }
  }
}

/**
 * Router function after direct action
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterDirectAction(
  state: InteractGraphState
): "outcome_prediction" | "finalize" {
  const log = logger.child({
    process: "Graph:router",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })
  if (state.status === "failed" || !state.actionResult) {
    log.info("Routing to finalize (direct action failed)")
    return "finalize"
  }

  log.info("Routing to outcome_prediction")
  return "outcome_prediction"
}
