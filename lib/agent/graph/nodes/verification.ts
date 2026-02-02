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
 * Phase 5: Tiered verification for token efficiency:
 * - Tier 1 (Deterministic): Zero LLM tokens for unambiguous outcomes
 * - Tier 2 (Lightweight): ~100 tokens for simple final steps
 * - Tier 3 (Full LLM): Current implementation for complex cases
 *
 * @see docs/VERIFICATION_PROCESS.md
 */

import * as Sentry from "@sentry/nextjs"
import { classifyActionType } from "@/lib/agent/action-type"
import {
  detectBlocker,
  requiresUserIntervention,
  canAutoRetry,
  canAutoDismiss,
  type BlockerDetectionResult,
} from "@/lib/agent/blocker-detection"
import {
  completeSubTask,
  extractSubTaskOutputs,
  getCurrentSubTask,
  isHierarchicalPlanComplete,
} from "@/lib/agent/hierarchical-planning"
import { checkNextGoalAvailability } from "@/lib/agent/verification/confidence"
import { extractActualState } from "@/lib/agent/verification/dom-checks"
import {
  type TieredVerificationExtras,
  verifyActionWithObservations,
} from "@/lib/agent/verification-engine"
import { renderInteractiveTreeAsHtml } from "@/lib/agent/semantic-v3"
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
    // Use the best available "DOM-like" snapshot for verification:
    // - full dom if provided
    // - else skeletonDom if provided
    // - else render a compact synthetic HTML from semantic interactiveTree
    const domForVerification =
      dom && dom.length > 0
        ? dom
        : state.skeletonDom && state.skeletonDom.length > 0
          ? state.skeletonDom
          : renderInteractiveTreeAsHtml(state.interactiveTree, state.recentEvents)

    // Blocker detection: check for conditions that require user intervention
    // Skip cookie consent (often auto-dismissable) and page errors (handled by correction)
    const blockerResult = detectBlocker(domForVerification, url, {
      skipCookieConsent: true, // Let the action system try to dismiss these
      skipPageErrors: true, // Let correction handle navigation errors
      minConfidence: 0.8, // Higher threshold to reduce false positives
    })

    if (blockerResult.detected && blockerResult.type) {
      log.info(
        `Blocker detected: type=${blockerResult.type}, confidence=${blockerResult.confidence?.toFixed(2)}, pattern="${blockerResult.matchedPattern}"`
      )

      // Blockers requiring user intervention pause the task
      if (requiresUserIntervention(blockerResult.type)) {
        log.info(
          `User intervention required for ${blockerResult.type}, pausing task`
        )
        return {
          blockerResult,
          status: "awaiting_user",
          verificationResult: {
            success: false,
            confidence: blockerResult.confidence ?? 0.9,
            reason: blockerResult.description ?? `Blocker detected: ${blockerResult.type}`,
            goalAchieved: false,
            action_succeeded: false,
            task_completed: false,
          },
        }
      }

      // Auto-retry blockers (rate limit): route to correction with delay hint
      if (canAutoRetry(blockerResult.type)) {
        log.info(
          `Auto-retry blocker detected (${blockerResult.type}), routing to correction`
        )
        return {
          blockerResult,
          status: "correcting",
          verificationResult: {
            success: false,
            confidence: blockerResult.confidence ?? 0.9,
            reason: blockerResult.description ?? `Rate limited, will retry`,
            goalAchieved: false,
            action_succeeded: false,
            task_completed: false,
            routeToCorrection: true,
          },
          consecutiveFailures: state.consecutiveFailures + 1,
        }
      }

      // Auto-dismissable blockers (cookie consent): let action system handle
      if (canAutoDismiss(blockerResult.type)) {
        log.info(
          `Auto-dismissable blocker detected (${blockerResult.type}), continuing with verification`
        )
        // Store the blocker result but continue with normal verification
        // The action generator will see the banner and try to dismiss it
      }
    }

    // Phase 5: Classify action type for tiered verification
    const actionType = classifyActionType(lastAction, domForVerification)

    // Phase 5: Build next goal check if we have expected outcome
    let nextGoalCheck: { available: boolean; reason: string; required: boolean } | undefined
    // NOTE: Only run selector-based next-goal checks when we have real HTML (full or skeleton),
    // otherwise the synthetic semantic HTML can create false negatives.
    const hasRealHtmlSnapshot =
      (dom && dom.length > 0) || (state.skeletonDom && state.skeletonDom.length > 0)
    if (state.lastActionExpectedOutcome?.nextGoal && hasRealHtmlSnapshot) {
      const actualState = extractActualState(domForVerification, url)
      nextGoalCheck = checkNextGoalAvailability(
        state.lastActionExpectedOutcome.nextGoal,
        actualState.domSnapshot
      )
    }

    // Phase 5: Build tiered verification extras
    const tieredExtras: TieredVerificationExtras = {
      actionType,
      complexity: state.complexity,
      plan: state.plan,
      hierarchicalPlan: state.hierarchicalPlan,
      expectedOutcome: state.lastActionExpectedOutcome,
      nextGoalCheck,
    }

    const result = await verifyActionWithObservations(
      lastActionBeforeState,
      domForVerification,
      url,
      lastAction,
      query || "",
      clientObservations,
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
        langfuseTraceId: state.langfuseTraceId,
      },
      subTaskObjective,
      tieredExtras
    )

    log.info(
      `Verification ${result.success ? "SUCCESS" : "FAILED"}: tier=${result.verificationTier ?? "full"}, confidence=${result.confidence.toFixed(2)}, action_succeeded=${result.action_succeeded}, task_completed=${result.task_completed}, sub_task_completed=${result.sub_task_completed ?? "—"}, goalAchieved=${result.goalAchieved === true}, tokensSaved=${result.tokensSaved ?? 0}`
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
                domForVerification,
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
      // Phase 5: Tiered verification metadata
      verificationTier: result.verificationTier,
      tokensSaved: result.tokensSaved,
      routeToCorrection: result.routeToCorrection,
    }

    // Phase 5: Handle routeToCorrection flag from Tier 1 Check 1.4
    // This bypasses Tier 2/3 and goes directly to correction
    const shouldCorrect = !result.success || result.routeToCorrection === true

    const out: Partial<InteractGraphState> = {
      verificationResult,
      status: shouldCorrect ? "correcting" : "executing",
    }
    if (!shouldCorrect) {
      // Success path: reset failures, track consecutive successes
      out.consecutiveFailures = 0
      // Semantic loop prevention: count consecutive successes without task completion
      const nextVelocity =
        goalAchieved === true ? 0 : (state.consecutiveSuccessWithoutTaskComplete ?? 0) + 1
      out.consecutiveSuccessWithoutTaskComplete = nextVelocity
      if (nextVelocity >= 5) {
        out.error =
          "Reflection: I've performed several steps without completing the goal. You may want to rephrase or try a different approach."
        out.status = "failed"
      }
    } else {
      // Failure or routeToCorrection path: increment failures
      out.consecutiveFailures = state.consecutiveFailures + 1
      out.consecutiveSuccessWithoutTaskComplete = 0
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
): "correction" | "planning" | "goal_achieved" | "finalize" | "awaiting_user" {
  const {
    verificationResult,
    consecutiveFailures,
    correctionAttempts,
    consecutiveSuccessWithoutTaskComplete,
    blockerResult,
  } = state
  const log = logger.child({
    process: "Graph:router",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  // Blocker requiring user intervention - pause the task
  if (
    state.status === "awaiting_user" ||
    (blockerResult?.detected && blockerResult.type && requiresUserIntervention(blockerResult.type))
  ) {
    log.info(`Routing to awaiting_user (blocker: ${blockerResult?.type})`)
    return "awaiting_user"
  }

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

  // Semantic loop prevention: many steps without sub-goal completion (e.g. paging forever)
  if ((consecutiveSuccessWithoutTaskComplete ?? 0) >= 5) {
    log.info("Routing to finalize (velocity check: 5+ steps without task completion)")
    return "finalize"
  }

  // Verification failed - route to correction
  // Phase 5: Also check routeToCorrection flag from Tier 1 Check 1.4 (hard failures)
  if (verificationResult && (!verificationResult.success || verificationResult.routeToCorrection === true)) {
    const reason = verificationResult.routeToCorrection
      ? "verification deterministic failure (routeToCorrection)"
      : "verification failed"
    log.info(`Routing to correction (${reason})`)
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
