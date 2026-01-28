/**
 * Correction Node
 *
 * Generates a correction when verification fails.
 * Uses the Self-Correction Engine to suggest an alternative action.
 */

import * as Sentry from "@sentry/nextjs"
import { generateCorrection } from "@/lib/agent/self-correction-engine"
import type { PlanStep } from "@/lib/models/task"
import { logger } from "@/lib/utils/logger"
import type { CorrectionResult, InteractGraphState } from "../types"

/**
 * Correction node - generates correction for failed action
 *
 * @param state - Current graph state
 * @returns Updated state with correction result
 */
export async function correctionNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const {
    verificationResult,
    dom,
    url,
    ragChunks,
    hasOrgKnowledge,
    plan,
    currentStepIndex,
    lastAction,
    correctionAttempts,
  } = state
  const log = logger.child({
    process: "Graph:correction",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  if (!verificationResult || verificationResult.success) {
    log.info("No failed verification, skipping correction")
    return {
      status: "executing",
    }
  }

  log.info(`Generating correction for failed action: ${lastAction}`)

  // Check max retries
  if (correctionAttempts >= 3) {
    log.info("Max correction attempts reached")
    return {
      error: "Max correction attempts exceeded",
      status: "failed",
    }
  }

  try {
    // Get the failed step from plan or create a synthetic one
    const failedStep = plan && currentStepIndex < plan.steps.length
      ? plan.steps[currentStepIndex]
      : {
          index: currentStepIndex,
          description: lastAction || "Unknown action",
          toolType: "DOM" as const,
          status: "failed" as const,
        }

    if (!failedStep) {
      log.info("No failed step found")
      return {
        error: "No failed step to correct",
        status: "failed",
      }
    }

    // Generate correction with cost tracking context
    // Use type assertion to match the expected VerificationResult type
    // The graph's VerificationResult is compatible but TypeScript can't infer it
    const correction = await generateCorrection(
      failedStep,
      verificationResult as any, // Type assertion for engine compatibility
      dom,
      url,
      ragChunks,
      hasOrgKnowledge,
      lastAction || "",
      [], // Previous correction attempts (simplified for now)
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
      }
    )

    if (correction) {
      log.info(
        `Correction generated: strategy=${correction.strategy}, action=${correction.retryAction}`
      )

      const correctionResult: CorrectionResult = {
        strategy: correction.strategy,
        reason: correction.reason,
        retryAction: correction.retryAction,
        // Convert correctedStep to PlanStep format if it exists
        correctedStep: correction.correctedStep
          ? ({
              index: currentStepIndex,
              description: correction.correctedStep.description,
              toolType: "DOM",
              status: "active",
              expectedOutcome: correction.correctedStep.expectedOutcome as Record<string, unknown> | undefined,
            } as PlanStep)
          : undefined,
      }

      return {
        correctionResult,
        actionResult: {
          thought: `Correction applied (${correction.strategy}): ${correction.reason}`,
          action: correction.retryAction,
        },
        correctionAttempts: correctionAttempts + 1,
        status: "executing",
      }
    }

    log.info("Correction generation failed")
    return {
      error: "Failed to generate correction",
      status: "failed",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-correction" },
      extra: { lastAction, verificationReason: verificationResult.reason },
    })
    log.error("Error", error)

    return {
      error: error instanceof Error ? error.message : "Unknown error in correction",
      status: "failed",
    }
  }
}

/**
 * Router function after correction
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterCorrection(
  state: InteractGraphState
): "outcome_prediction" | "finalize" {
  const log = logger.child({
    process: "Graph:router",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })
  if (state.status === "failed" || !state.actionResult) {
    log.info("Routing to finalize (correction failed)")
    return "finalize"
  }

  log.info("Routing to outcome_prediction (correction succeeded)")
  return "outcome_prediction"
}
