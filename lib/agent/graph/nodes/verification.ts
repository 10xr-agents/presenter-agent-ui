/**
 * Verification Node
 *
 * Verifies that the previous action was executed successfully.
 * Uses the Verification Engine to compare expected vs actual state.
 *
 * On success: Proceeds to next action generation
 * On failure: Routes to correction node
 */

import * as Sentry from "@sentry/nextjs"
import { verifyAction } from "@/lib/agent/verification-engine"
import type { InteractGraphState, VerificationResult } from "../types"

/**
 * Verification node - verifies previous action outcome
 *
 * @param state - Current graph state
 * @returns Updated state with verification result
 */
export async function verificationNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { lastActionExpectedOutcome, lastAction, dom, url, previousUrl } = state

  // If no expected outcome, skip verification
  if (!lastActionExpectedOutcome) {
    console.log(`[Graph:verification] No expected outcome, skipping verification`)
    return {
      verificationResult: undefined,
      status: "executing",
    }
  }

  console.log(`[Graph:verification] Verifying previous action: ${lastAction}`)

  try {
    // Determine previous URL for comparison
    const prevUrl = previousUrl || url

    const result = await verifyAction(
      lastActionExpectedOutcome,
      dom, // Current DOM (after action was executed)
      url, // Current URL
      prevUrl, // Previous URL for comparison
      lastAction || "", // The action that was executed
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
      }
    )

    console.log(
      `[Graph:verification] Verification ${result.success ? "SUCCESS" : "FAILED"}: ` +
      `confidence=${result.confidence.toFixed(2)}, reason=${result.reason}`
    )

    const verificationResult: VerificationResult = {
      success: result.success,
      confidence: result.confidence,
      reason: result.reason,
      expectedState: result.expectedState as unknown as Record<string, unknown>,
      actualState: result.actualState as unknown as Record<string, unknown>,
      comparison: result.comparison as unknown as Record<string, unknown>,
    }

    if (result.success) {
      // Verification succeeded - reset consecutive failures
      return {
        verificationResult,
        consecutiveFailures: 0,
        status: "executing",
      }
    }

    // Verification failed - increment failures and route to correction
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
    console.error(`[Graph:verification] Verification error:`, error)

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
): "correction" | "planning" | "finalize" {
  const { verificationResult, consecutiveFailures, correctionAttempts } = state

  // Check for max retries exceeded
  if (correctionAttempts >= 3) {
    console.log(`[Graph:router] Routing to finalize (max retries exceeded)`)
    return "finalize"
  }

  // Check for consecutive failures exceeded
  if (consecutiveFailures >= 3) {
    console.log(`[Graph:router] Routing to finalize (consecutive failures exceeded)`)
    return "finalize"
  }

  // Verification failed - route to correction
  if (verificationResult && !verificationResult.success) {
    console.log(`[Graph:router] Routing to correction (verification failed)`)
    return "correction"
  }

  // Verification succeeded or skipped - continue to planning/action
  console.log(`[Graph:router] Routing to planning (verification passed)`)
  return "planning"
}
