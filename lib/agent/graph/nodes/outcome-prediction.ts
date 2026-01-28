/**
 * Outcome Prediction Node
 *
 * Predicts the expected outcome of an action for verification.
 * Uses the Outcome Prediction Engine to generate expectations
 * that will be checked in the next verification step.
 */

import * as Sentry from "@sentry/nextjs"
import { predictOutcome } from "@/lib/agent/outcome-prediction-engine"
import { logger } from "@/lib/utils/logger"
import type { InteractGraphState } from "../types"

/**
 * Outcome prediction node - predicts expected outcome of action
 *
 * @param state - Current graph state
 * @returns Updated state with expected outcome
 */
export async function outcomePredictionNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { actionResult, dom, url, ragChunks, hasOrgKnowledge } = state
  const log = logger.child({
    process: "Graph:outcome_prediction",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  if (!actionResult) {
    log.info("No action result, skipping prediction")
    return {
      status: "executing",
    }
  }

  log.info(`Predicting outcome for: ${actionResult.action}`)

  try {
    const prediction = await predictOutcome(
      actionResult.action,
      actionResult.thought,
      dom,
      url,
      ragChunks,
      hasOrgKnowledge,
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
      }
    )

    if (prediction) {
      log.info(`Prediction generated: ${prediction.description?.substring(0, 50) || "no description"}`)
      return {
        expectedOutcome: prediction,
        status: "executing",
      }
    }

    log.info("No prediction generated")
    return {
      status: "executing",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-outcome-prediction" },
      extra: { action: actionResult.action },
    })
    log.error("Error", error)

    // Continue without prediction (non-critical)
    return {
      status: "executing",
    }
  }
}

/**
 * Router function after outcome prediction (always goes to finalize)
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterOutcomePrediction(
  state: InteractGraphState
): "finalize" {
  const log = logger.child({
    process: "Graph:router",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })
  log.info("Routing to finalize")
  return "finalize"
}
