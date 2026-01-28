/**
 * Complexity Check Node
 *
 * Entry point for the graph. Classifies the task as SIMPLE or COMPLEX
 * to determine the routing path.
 *
 * SIMPLE tasks → direct_action (skip reasoning and planning)
 * COMPLEX tasks → context_analysis (full reasoning pipeline)
 */

import { logger } from "@/lib/utils/logger"
import { classifyComplexity } from "../complexity-classifier"
import type { InteractGraphState } from "../types"

/**
 * Complexity check node - classifies task complexity for routing
 *
 * @param state - Current graph state
 * @returns Updated state with complexity classification
 */
export async function complexityCheckNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { query, dom, isNewTask, previousActions } = state
  const log = logger.child({
    process: "Graph:complexity_check",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  log.info(`Classifying complexity for query: "${query.substring(0, 50)}..."`)

  // For existing tasks (continuation), always use COMPLEX path
  // because we need to verify the previous action
  if (!isNewTask && previousActions.length > 0) {
    log.info("Existing task with history → COMPLEX")
    return {
      complexity: "COMPLEX",
      complexityReason: "Existing task with action history requires verification",
      complexityConfidence: 1.0,
      status: "analyzing",
    }
  }

  // Classify new task complexity
  const classification = classifyComplexity(query, dom)

  log.info(
    `Classification: ${classification.complexity} (confidence: ${classification.confidence.toFixed(2)}, reason: ${classification.reason})`
  )

  return {
    complexity: classification.complexity,
    complexityReason: classification.reason,
    complexityConfidence: classification.confidence,
    status: classification.complexity === "SIMPLE" ? "executing" : "analyzing",
  }
}

/**
 * Router function to determine next node based on complexity
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterComplexityCheck(
  state: InteractGraphState
): "context_analysis" | "direct_action" | "verification" {
  const { complexity, isNewTask, previousActions } = state
  const log = logger.child({
    process: "Graph:router",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  // Existing task with history → verify previous action first
  if (!isNewTask && previousActions.length > 0) {
    log.info("Routing to verification (existing task)")
    return "verification"
  }

  // New task routing based on complexity
  if (complexity === "SIMPLE") {
    log.info("Routing to direct_action (SIMPLE task)")
    return "direct_action"
  }

  log.info("Routing to context_analysis (COMPLEX task)")
  return "context_analysis"
}
