/**
 * Goal Achieved Node
 *
 * When verification passes with high confidence and the semantic verdict
 * indicates the user's goal was achieved, we complete the task by setting
 * actionResult to finish() so the graph terminates with status "completed"
 * instead of looping (verification → planning → action_generation → …).
 *
 * @see docs/VERIFICATION_PROCESS.md
 */

import { logger } from "@/lib/utils/logger"
import type { InteractGraphState } from "../types"

/**
 * Goal achieved node - sets actionResult to finish() so finalize marks task completed.
 *
 * @param state - Current graph state (must have verificationResult with goal-achieved semantics)
 * @returns Updated state with actionResult = finish() and expectedOutcome from verification reason
 */
export async function goalAchievedNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { verificationResult, query } = state
  const log = logger.child({
    process: "Graph:goal_achieved",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  // Use engine-set semanticSummary for display; do not parse reason text.
  const description =
    verificationResult?.semanticSummary ??
    verificationResult?.reason?.substring(0, 200) ??
    "Task completed."

  log.info("Goal achieved — setting actionResult to finish()", {
    confidence: verificationResult?.confidence,
    description: description.substring(0, 80),
  })

  return {
    actionResult: {
      thought: query
        ? `Task complete: "${query}". ${description}`
        : `Task complete. ${description}`,
      action: "finish()",
    },
    expectedOutcome: { description },
    status: "executing",
  }
}
