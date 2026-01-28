/**
 * Verification Engine — entry point for observation-based and prediction-based verification.
 * @see docs/VERIFICATION_PROCESS.md
 */

import type { ExpectedOutcome } from "@/lib/models/task-action"
import { computeDomHash, hasSignificantUrlChange } from "@/lib/utils/dom-helpers"
import { logger } from "@/lib/utils/logger"
import { classifyActionType } from "./action-type"
import {
  type BeforeState,
  buildObservationList,
  calculateConfidence,
  checkNextGoalAvailability,
  type ClientObservations,
  type ClientVerification,
  extractActualState,
  isPopupExpectation,
  performDOMChecks,
  performSemanticVerification,
  performSemanticVerificationOnObservations,
  type SemanticVerificationResult,
  type VerificationContext,
  type VerificationResult,
} from "./verification"

// Re-export types and entry points for backward compatibility
export type {
  VerificationContext,
  ClientVerification,
  ClientObservations,
  ActualState,
  DOMCheckResults,
  NextGoalCheckResult,
  VerificationResult,
} from "./verification"

/** Minimum confidence for goal achieved when task_completed is true (Task 2: low-confidence completion band). */
const GOAL_ACHIEVED_MIN_CONFIDENCE = 0.7
/** Above this confidence we do not log "Low confidence completion". */
const LOW_CONFIDENCE_COMPLETION_MAX = 0.85

/**
 * Compute goalAchieved and whether to log low-confidence completion (Task 2).
 * When task_completed is true and confidence >= 0.70 we set goalAchieved = true (single finish).
 * When goalAchieved is true and confidence < 0.85 we log "Low confidence completion".
 */
export function computeGoalAchieved(
  task_completed: boolean,
  confidence: number
): { goalAchieved: boolean; lowConfidenceCompletion: boolean } {
  const goalAchieved = task_completed && confidence >= GOAL_ACHIEVED_MIN_CONFIDENCE
  const lowConfidenceCompletion = goalAchieved && confidence < LOW_CONFIDENCE_COMPLETION_MAX
  return { goalAchieved, lowConfidenceCompletion }
}

/**
 * Observation-Based Verification (v3.0): Verify using before/after state comparison.
 * If no changes were observed (URL same, DOM hash same, no client observations), we fail without calling LLM.
 * Phase 4 Task 9: When subTaskObjective is provided (hierarchical), also evaluates sub_task_completed.
 */
export async function verifyActionWithObservations(
  beforeState: BeforeState,
  currentDom: string,
  currentUrl: string,
  action: string,
  userGoal: string,
  clientObservations: ClientObservations | undefined,
  context?: VerificationContext,
  subTaskObjective?: string
): Promise<VerificationResult> {
  const log = logger.child({
    process: "Verification",
    sessionId: context?.sessionId,
    taskId: context?.taskId ?? "",
  })

  const afterDomHash = computeDomHash(currentDom)
  const { observations, meaningfulContentChange } = buildObservationList(
    beforeState,
    currentUrl,
    afterDomHash,
    undefined,
    clientObservations,
    currentDom
  )

  const urlChanged = beforeState.url !== currentUrl
  // Task 3: skeleton-primary — meaningfulContentChange is true only when skeleton diff had items or (no skeleton) domHash changed; skeleton diff empty but hash changed → false.
  const clientSawSomething =
    clientObservations?.didNetworkOccur === true ||
    clientObservations?.didDomMutate === true ||
    clientObservations?.didUrlChange === true

  const somethingChanged = urlChanged || meaningfulContentChange || clientSawSomething
  if (!somethingChanged) {
    log.info("[Observation] No changes detected — failing without LLM")
    const actualState = extractActualState(currentDom, currentUrl)
    return {
      success: false,
      confidence: 0.2,
      reason: `No changes observed: URL same, DOM unchanged. Observations: ${observations.join(" | ")}`,
      expectedState: { description: userGoal },
      actualState,
      comparison: { semanticMatch: false, overallMatch: false },
    }
  }
  if (clientSawSomething && !urlChanged && !meaningfulContentChange) {
    log.info("[Observation] Client witness override: proceeding with LLM (extension reported change)")
  }

  const semanticResult = await performSemanticVerificationOnObservations(
    userGoal,
    action,
    observations,
    context,
    subTaskObjective
  )

  const confidence = semanticResult.confidence
  const action_succeeded = semanticResult.action_succeeded
  const task_completed = semanticResult.task_completed
  // Route to next action when this action did something useful and confidence is sufficient.
  const success = action_succeeded && confidence >= 0.7
  const actualState = extractActualState(currentDom, currentUrl)
  const reasonParts = [
    ...observations,
    `Semantic verdict: ${semanticResult.reason}`,
    `Confidence: ${(confidence * 100).toFixed(1)}%`,
    `action_succeeded: ${action_succeeded}`,
    `task_completed: ${task_completed}`,
  ]

  // Deterministic: goal achieved when semantic LLM said task_completed=true and confidence >= 0.70 (Task 2: includes low-confidence band).
  const { goalAchieved, lowConfidenceCompletion } = computeGoalAchieved(task_completed, confidence)
  if (lowConfidenceCompletion) {
    log.info(
      `[Observation] Low confidence completion: task_completed=true, confidence=${confidence.toFixed(2)} (in [0.70, 0.85)); setting goalAchieved=true for single finish.`
    )
  }
  log.info(
    `[Observation] ${success ? "SUCCESS" : "FAILED"}: confidence=${confidence.toFixed(2)}, action_succeeded=${action_succeeded}, task_completed=${task_completed}, goalAchieved=${goalAchieved}, ${semanticResult.reason}`
  )

  const semanticSummary =
    semanticResult.reason?.substring(0, 300)?.trim() || undefined

  const result: VerificationResult = {
    success,
    confidence,
    reason: reasonParts.join(" | "),
    expectedState: { description: userGoal },
    actualState,
    comparison: { semanticMatch: task_completed, overallMatch: success },
    goalAchieved,
    action_succeeded,
    task_completed,
    semanticSummary,
  }
  if (subTaskObjective != null && semanticResult.sub_task_completed !== undefined) {
    result.sub_task_completed = semanticResult.sub_task_completed
  }
  return result
}

/**
 * Verify if action achieved expected outcome (prediction-based path).
 * Used for correction and legacy flows.
 */
export async function verifyAction(
  expectedOutcome: ExpectedOutcome,
  currentDom: string,
  currentUrl: string,
  previousUrl?: string,
  previousAction?: string,
  context?: VerificationContext,
  clientVerification?: ClientVerification
): Promise<VerificationResult> {
  const log = logger.child({
    process: "Verification",
    sessionId: context?.sessionId,
    taskId: context?.taskId ?? "",
  })

  const actualState = extractActualState(currentDom, currentUrl)
  const actionType =
    previousAction !== undefined ? classifyActionType(previousAction, currentDom) : undefined
  const domChecks = performDOMChecks(expectedOutcome, actualState, previousUrl, actionType)

  const domChanges = expectedOutcome.domChanges
  const isPopupFromOutcome = domChanges ? isPopupExpectation(domChanges) : false
  const isDropdown = isPopupFromOutcome || actionType === "dropdown"

  const urlActuallyChanged = previousUrl
    ? hasSignificantUrlChange(previousUrl, currentUrl)
    : false
  const expectedUrlChange = domChanges?.urlShouldChange ?? false
  const elementExpectedButMissing =
    domChanges?.elementShouldExist !== undefined && domChecks.elementExists === false

  if (domChanges?.elementShouldExist) {
    log.info(
      `Expected element: "${domChanges.elementShouldExist}" → ${domChecks.elementExists ? "FOUND ✓" : "NOT FOUND ✗"}`
    )
  }
  if (clientVerification) {
    log.info(
      `Client verification received: elementFound=${clientVerification.elementFound}, selector="${clientVerification.selector}", urlChanged=${clientVerification.urlChanged}`
    )
  }

  const semanticResult: SemanticVerificationResult = isDropdown
    ? {
        action_succeeded: true,
        task_completed: false,
        match: true,
        reason: "Skipped (dropdown); DOM checks only.",
        confidence: 1.0,
      }
    : await performSemanticVerification(expectedOutcome, actualState, previousUrl, context)

  let confidence = calculateConfidence(
    domChecks,
    semanticResult.match,
    semanticResult.confidence,
    actionType,
    urlActuallyChanged,
    expectedUrlChange,
    clientVerification,
    elementExpectedButMissing,
    log
  )

  const isPopup = isDropdown
  const urlSame =
    domChanges?.urlShouldChange === false &&
    (previousUrl !== undefined ? !urlActuallyChanged : true)
  const expandedOk = domChecks.attributeChanged === true
  if (isPopup && urlSame && expandedOk) {
    confidence = Math.max(confidence, 0.75)
  }
  if (expectedUrlChange && urlActuallyChanged && semanticResult.match) {
    confidence = Math.max(confidence, 0.85)
  }
  if (expectedUrlChange && urlActuallyChanged) {
    const urlOnlyConfidence = 0.75
    if (confidence < urlOnlyConfidence) {
      log.info(
        `URL changed as expected (${previousUrl} → ${currentUrl}) - boosting confidence from ${(confidence * 100).toFixed(1)}% to ${(urlOnlyConfidence * 100).toFixed(1)}%`
      )
      confidence = urlOnlyConfidence
    }
  }
  if (
    !expectedUrlChange &&
    urlActuallyChanged &&
    (actionType === "generic" || actionType === "navigation")
  ) {
    const unexpectedNavConfidence = 0.7
    if (confidence < unexpectedNavConfidence) {
      log.info(
        `URL changed (unexpected) - likely navigation action. Boosting confidence from ${(confidence * 100).toFixed(1)}% to ${(unexpectedNavConfidence * 100).toFixed(1)}%`
      )
      confidence = unexpectedNavConfidence
    }
  }

  let nextGoalCheck = undefined
  if (expectedOutcome.nextGoal) {
    nextGoalCheck = checkNextGoalAvailability(expectedOutcome.nextGoal, actualState.domSnapshot)
    if (!nextGoalCheck.available && nextGoalCheck.required) {
      confidence = Math.min(confidence, 0.5)
    }
  }

  const nextGoalOk = !nextGoalCheck || nextGoalCheck.available || !nextGoalCheck.required
  const finalSuccess = confidence >= 0.7 && nextGoalOk

  const reasonParts: string[] = []
  if (domChecks.elementExists !== undefined) {
    reasonParts.push(`Element existence: ${domChecks.elementExists ? "✓" : "✗"}`)
  }
  if (domChecks.elementNotExists !== undefined) {
    reasonParts.push(`Element not present: ${domChecks.elementNotExists ? "✓" : "✗"}`)
  }
  if (domChecks.elementTextMatches !== undefined) {
    reasonParts.push(`Element text match: ${domChecks.elementTextMatches ? "✓" : "✗"}`)
  }
  if (domChecks.urlChanged !== undefined) {
    reasonParts.push(`URL changed: ${domChecks.urlChanged ? "✓" : "✗"}`)
  }
  if (domChecks.attributeChanged !== undefined) {
    reasonParts.push(`Attribute changed (popup): ${domChecks.attributeChanged ? "✓" : "✗"}`)
  }
  if (domChecks.elementsAppeared !== undefined) {
    reasonParts.push(`Menu items appeared: ${domChecks.elementsAppeared ? "✓" : "✗"}`)
  }
  reasonParts.push(`Semantic match: ${semanticResult.match ? "✓" : "✗"}`)
  if (nextGoalCheck) {
    const nextGoalStatus = nextGoalCheck.available ? "✓" : nextGoalCheck.required ? "✗" : "⚠"
    reasonParts.push(`Next-goal: ${nextGoalStatus}`)
  }
  reasonParts.push(`Confidence: ${(confidence * 100).toFixed(1)}%`)
  reasonParts.push(`Overall: ${semanticResult.reason}`)

  const semanticSummary =
    semanticResult.reason?.substring(0, 300)?.trim() || undefined

  const { goalAchieved, lowConfidenceCompletion } = computeGoalAchieved(
    semanticResult.task_completed === true,
    confidence
  )
  const goalAchievedFinal = finalSuccess && goalAchieved
  if (lowConfidenceCompletion && goalAchievedFinal) {
    log.info(
      `[Verification] Low confidence completion: task_completed=true, confidence=${confidence.toFixed(2)} (in [0.70, 0.85)); setting goalAchieved=true for single finish.`
    )
  }

  return {
    success: finalSuccess,
    confidence,
    expectedState: expectedOutcome,
    actualState,
    comparison: {
      domChecks,
      semanticMatch: semanticResult.match,
      overallMatch: finalSuccess,
      nextGoalCheck,
    },
    reason: reasonParts.join(" | "),
    goalAchieved: goalAchievedFinal,
    action_succeeded: semanticResult.action_succeeded,
    task_completed: semanticResult.task_completed,
    semanticSummary,
  }
}
