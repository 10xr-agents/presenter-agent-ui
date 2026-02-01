/**
 * Finalize Node
 *
 * Final node in the graph. Prepares the response based on the current state.
 * When status is failed, sets a user-facing actionResult.thought so the UI can show a message.
 * When status is completed with finish("message"), displays the finishMessage.
 */

import { logger } from "@/lib/utils/logger"
import type { InteractGraphState } from "../types"

/** Shorten verification/correction reason for display (avoid raw JSON or huge strings). */
function shortReason(reason: string | undefined, maxLen: number): string {
  if (!reason) return ""
  const trimmed = reason.trim()
  if (trimmed.length <= maxLen) return trimmed
  // Prefer first sentence or first segment before " | "
  const firstPart = trimmed.split(/\s*\|\s*/)[0]?.trim() ?? trimmed
  if (firstPart.length <= maxLen) return firstPart
  return firstPart.slice(0, maxLen - 3) + "..."
}

/**
 * Finalize node - marks graph execution as complete.
 * When failed, sets actionResult.thought so the UI can show a failure message.
 *
 * @param state - Current graph state
 * @returns Final state
 */
export async function finalizeNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { status, actionResult, error, verificationResult, query, startTime } = state
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

  // When failed, set a user-facing thought so the UI shows a clear message (not the last step's text)
  if (finalStatus === "failed") {
    const reason =
      shortReason(verificationResult?.reason, 200) ||
      shortReason(verificationResult?.semanticSummary, 200) ||
      error ||
      "Something went wrong."
    const taskLabel = query ? `"${query}"` : "this step"
    const thought = `I couldn't complete ${taskLabel}. ${reason} You can try rephrasing or continue from here.`
    return {
      status: finalStatus,
      actionResult: {
        thought,
        action: "fail()",
      },
    }
  }

  // When completed with finish("message"), display the finishMessage to the user
  // finishMessage is set by action-generation/step-refinement using deterministic parsing
  if (finalStatus === "completed" && actionResult?.finishMessage) {
    log.info("Using finishMessage for display", { messageLength: actionResult.finishMessage.length })
    return {
      status: finalStatus,
      actionResult: {
        thought: actionResult.finishMessage,
        action: actionResult.action,
        finishMessage: actionResult.finishMessage,
      },
    }
  }

  return {
    status: finalStatus,
  }
}
