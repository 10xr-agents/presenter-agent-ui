/**
 * Verification Node
 *
 * Verifies that the previous action was executed successfully using
 * observation-based verification (DOM diff). Compares beforeState (saved when
 * action was generated) with after state (current request). No prediction.
 *
 * On success: Proceeds to next action generation
 * On failure: Routes to correction node
 *
 * @see docs/VERIFICATION_PROCESS.md
 */

import * as Sentry from "@sentry/nextjs"
import { verifyActionWithObservations } from "@/lib/agent/verification-engine"
import { logger } from "@/lib/utils/logger"
import type { InteractGraphState, VerificationResult } from "../types"

/**
 * Verification node - verifies previous action outcome using observation-based verification only.
 *
 * Requires: lastAction and lastActionBeforeState (client sends DOM on every call, so we always save beforeState).
 * If lastAction exists but beforeState is missing (e.g. migration), we skip verification and continue.
 */
export async function verificationNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const {
    lastAction,
    lastActionBeforeState,
    dom,
    url,
    query,
    clientObservations,
  } = state
  const log = logger.child({
    process: "Graph:verification",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  // No previous action to verify
  if (!lastAction) {
    log.info("No previous action, skipping verification")
    return {
      verificationResult: undefined,
      status: "executing",
    }
  }

  // We need beforeState to verify (client sends DOM on every call, so we always save it)
  if (!lastActionBeforeState) {
    log.warn(
      "Previous action has no beforeState — cannot run observation-based verification. Skipping and continuing.",
      { lastAction }
    )
    return {
      verificationResult: undefined,
      status: "executing",
    }
  }

  log.info(`Verifying previous action: ${lastAction} (observation-based)`)

  try {
    const result = await verifyActionWithObservations(
      lastActionBeforeState,
      dom,
      url,
      lastAction,
      query || "",
      clientObservations,
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
      }
    )

    log.info(
      `Verification ${result.success ? "SUCCESS" : "FAILED"}: confidence=${result.confidence.toFixed(2)}, goalAchieved=${result.goalAchieved === true}, reason=${result.reason}`
    )

    const verificationResult: VerificationResult = {
      success: result.success,
      confidence: result.confidence,
      reason: result.reason,
      expectedState: result.expectedState as unknown as Record<string, unknown>,
      actualState: result.actualState as unknown as Record<string, unknown>,
      comparison: result.comparison as unknown as Record<string, unknown>,
      goalAchieved: result.goalAchieved,
      semanticSummary: result.semanticSummary,
    }

    if (result.success) {
      return { verificationResult, consecutiveFailures: 0, status: "executing" }
    }

    return {
      verificationResult,
      consecutiveFailures: state.consecutiveFailures + 1,
      status: "correcting",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-verification" },
      extra: { lastAction, url },
    })
    log.error("Verification error", error)

    // On error, assume success and continue (conservative)
    return {
      verificationResult: {
        success: true,
        confidence: 0.5,
        reason: "Verification error, assuming success",
      },
      status: "executing",
    }
  }
}

/**
 * Router function after verification
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterVerification(
  state: InteractGraphState
): "correction" | "planning" | "goal_achieved" | "finalize" {
  const { verificationResult, consecutiveFailures, correctionAttempts } = state
  const log = logger.child({
    process: "Graph:router",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  // Check for max retries exceeded
  if (correctionAttempts >= 3) {
    log.info("Routing to finalize (max retries exceeded)")
    return "finalize"
  }

  // Check for consecutive failures exceeded
  if (consecutiveFailures >= 3) {
    log.info("Routing to finalize (consecutive failures exceeded)")
    return "finalize"
  }

  // Verification failed - route to correction
  if (verificationResult && !verificationResult.success) {
    log.info("Routing to correction (verification failed)")
    return "correction"
  }

  // Verification engine set goalAchieved=true when semantic LLM returned match=true with high confidence
  if (verificationResult?.goalAchieved === true) {
    log.info("Routing to goal_achieved (goalAchieved=true)")
    return "goal_achieved"
  }

  // Verification succeeded or skipped - continue to planning/action
  log.info("Routing to planning (verification passed)")
  return "planning"
}
