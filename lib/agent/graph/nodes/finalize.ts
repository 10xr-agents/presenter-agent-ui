/**
 * Finalize Node
 *
 * Final node in the graph. Prepares the response based on the current state.
 * This node doesn't modify state - it's just the terminal point of the graph.
 */

import { logger } from "@/lib/utils/logger"
import type { InteractGraphState } from "../types"

/**
 * Finalize node - marks graph execution as complete
 *
 * @param state - Current graph state
 * @returns Final state
 */
export async function finalizeNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { status, actionResult, error, startTime } = state
  const log = logger.child({
    process: "Graph:finalize",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  const duration = Date.now() - startTime
  log.info(`Graph execution complete in ${duration}ms, status=${status}`)

  // Determine final status based on state
  let finalStatus = status

  if (error) {
    finalStatus = "failed"
    log.info(`Error: ${error}`)
  } else if (status === "needs_user_input") {
    // Keep needs_user_input status
    finalStatus = "needs_user_input"
  } else if (actionResult) {
    // Check for terminal actions
    if (actionResult.action.startsWith("finish(")) {
      finalStatus = "completed"
    } else if (actionResult.action.startsWith("fail(")) {
      finalStatus = "failed"
    } else {
      finalStatus = "executing"
    }
  }

  return {
    status: finalStatus,
  }
}
