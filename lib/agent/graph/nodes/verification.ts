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
import {
  completeSubTask,
  extractSubTaskOutputs,
  getCurrentSubTask,
  isHierarchicalPlanComplete,
} from "@/lib/agent/hierarchical-planning"
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
    hierarchicalPlan,
  } = state
  const log = logger.child({
    process: "Graph:verification",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  // Phase 4 Task 9: Sub-task objective for hierarchical verification
  const currentSubTask =
    hierarchicalPlan != null ? getCurrentSubTask(hierarchicalPlan) : null
  const subTaskObjective = currentSubTask?.objective

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

  log.info(
    `Verifying previous action: ${lastAction} (observation-based)${subTaskObjective ? ` [sub-task: ${subTaskObjective.substring(0, 40)}...]` : ""}`
  )

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
      },
      subTaskObjective
    )

    log.info(
      `Verification ${result.success ? "SUCCESS" : "FAILED"}: confidence=${result.confidence.toFixed(2)}, action_succeeded=${result.action_succeeded}, task_completed=${result.task_completed}, sub_task_completed=${result.sub_task_completed ?? "—"}, goalAchieved=${result.goalAchieved === true}, reason=${result.reason}`
    )

    let updatedHierarchicalPlan = hierarchicalPlan
    const subTaskConfidenceOk = result.confidence >= 0.7

    // Phase 4 Task 9: Advance or fail sub-task when hierarchical and sub_task_completed was evaluated
    if (
      hierarchicalPlan != null &&
      currentSubTask != null &&
      result.sub_task_completed !== undefined
    ) {
      if (result.sub_task_completed === true && subTaskConfidenceOk) {
        const outputs =
          currentSubTask.outputs.length > 0
            ? extractSubTaskOutputs(
                currentSubTask,
                dom,
                result.semanticSummary ?? result.reason
              )
            : {}
        updatedHierarchicalPlan = completeSubTask(hierarchicalPlan, {
          success: true,
          outputs,
          summary: result.semanticSummary ?? result.reason,
        })
        log.info(
          `Sub-task "${currentSubTask.name}" completed; advanced to index ${updatedHierarchicalPlan.currentSubTaskIndex}`
        )
      } else if (result.sub_task_completed === false && !result.success) {
        updatedHierarchicalPlan = completeSubTask(hierarchicalPlan, {
          success: false,
          outputs: {},
          summary: result.reason,
          error: result.reason,
        })
        log.info(`Sub-task "${currentSubTask.name}" failed (sub_task_completed=false)`)
      }
    }

    let goalAchieved = result.goalAchieved
    // Phase 4 Task 9: When hierarchical, goal achieved when all sub-tasks are complete
    if (
      updatedHierarchicalPlan != null &&
      isHierarchicalPlanComplete(updatedHierarchicalPlan)
    ) {
      goalAchieved = true
      log.info("All sub-tasks complete; setting goalAchieved=true")
    }

    const verificationResult: VerificationResult = {
      success: result.success,
      confidence: result.confidence,
      reason: result.reason,
      expectedState: result.expectedState as unknown as Record<string, unknown>,
      actualState: result.actualState as unknown as Record<string, unknown>,
      comparison: result.comparison as unknown as Record<string, unknown>,
      goalAchieved,
      action_succeeded: result.action_succeeded,
      task_completed: result.task_completed,
      sub_task_completed: result.sub_task_completed,
      semanticSummary: result.semanticSummary,
    }

    const out: Partial<InteractGraphState> = {
      verificationResult,
      status: result.success ? "executing" : "correcting",
    }
    if (result.success) {
      out.consecutiveFailures = 0
    } else {
      out.consecutiveFailures = state.consecutiveFailures + 1
    }
    if (updatedHierarchicalPlan !== hierarchicalPlan) {
      out.hierarchicalPlan = updatedHierarchicalPlan
    }
    return out
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

  // Verification engine set goalAchieved=true when semantic LLM returned task_completed=true with confidence >= 0.85
  if (verificationResult?.goalAchieved === true) {
    log.info("Routing to goal_achieved (goalAchieved=true)")
    return "goal_achieved"
  }

  // Verification succeeded or skipped - continue to planning/action
  log.info("Routing to planning (verification passed)")
  return "planning"
}
