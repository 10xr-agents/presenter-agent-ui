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
import { buildActionPrompt, parseActionResponse } from "@/lib/agent/prompt-builder"
import { callActionLLM } from "@/lib/agent/llm-client"
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

  console.log(`[Graph:direct_action] Fast-path action generation for: "${query.substring(0, 50)}..."`)

  const startTime = Date.now()

  try {
    // Build a simplified prompt for direct action
    // No system messages about failures since this is a new simple task
    const { system, user } = buildActionPrompt({
      query,
      currentTime: new Date().toISOString(),
      previousActions,
      ragChunks,
      hasOrgKnowledge,
      dom,
      systemMessages: [],
    })

    // Call LLM with cost tracking context (fast path)
    const llmResponse = await callActionLLM(system, user, {
      generationName: "direct_action",
      tenantId: state.tenantId,
      userId: state.userId,
      sessionId: state.sessionId,
      taskId: state.taskId,
      actionType: "DIRECT_ACTION",
      metadata: {
        query,
        url,
        hasOrgKnowledge,
        complexity: "SIMPLE",
      },
    })
    const llmDuration = Date.now() - startTime

    if (!llmResponse) {
      console.error(`[Graph:direct_action] LLM returned null response`)
      return {
        error: "LLM returned null response",
        status: "failed",
      }
    }

    // Parse response (llmResponse.thought contains the raw LLM output)
    const parsedResponse = parseActionResponse(llmResponse.thought)

    if (!parsedResponse) {
      console.error(`[Graph:direct_action] Failed to parse LLM response`)
      return {
        error: "Failed to parse LLM response",
        status: "failed",
      }
    }

    console.log(`[Graph:direct_action] Generated action: ${parsedResponse.action} (${llmDuration}ms)`)

    return {
      actionResult: {
        thought: parsedResponse.thought,
        action: parsedResponse.action,
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
    console.error(`[Graph:direct_action] Error:`, error)

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
  if (state.status === "failed" || !state.actionResult) {
    console.log(`[Graph:router] Routing to finalize (direct action failed)`)
    return "finalize"
  }

  console.log(`[Graph:router] Routing to outcome_prediction`)
  return "outcome_prediction"
}
