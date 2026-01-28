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

/**
 * Observation-Based Verification (v3.0): Verify using before/after state comparison.
 * If no changes were observed (URL same, DOM hash same, no client observations), we fail without calling LLM.
 */
export async function verifyActionWithObservations(
  beforeState: BeforeState,
  currentDom: string,
  currentUrl: string,
  action: string,
  userGoal: string,
  clientObservations: ClientObservations | undefined,
  context?: VerificationContext
): Promise<VerificationResult> {
  const log = logger.child({
    process: "Verification",
    sessionId: context?.sessionId,
    taskId: context?.taskId ?? "",
  })

  const afterDomHash = computeDomHash(currentDom)
  const observations = buildObservationList(
    beforeState,
    currentUrl,
    afterDomHash,
    undefined,
    clientObservations,
    currentDom
  )

  const urlChanged = beforeState.url !== currentUrl
  const domChanged = beforeState.domHash !== afterDomHash
  const clientSawSomething =
    clientObservations?.didNetworkOccur === true || clientObservations?.didDomMutate === true

  if (!urlChanged && !domChanged && !clientSawSomething) {
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

  const semanticResult = await performSemanticVerificationOnObservations(
    userGoal,
    action,
    observations,
    context
  )

  const confidence = semanticResult.confidence
  const success = confidence >= 0.7
  const actualState = extractActualState(currentDom, currentUrl)
  const reasonParts = [
    ...observations,
    `Semantic verdict: ${semanticResult.reason}`,
    `Confidence: ${(confidence * 100).toFixed(1)}%`,
  ]

  // Deterministic: goal achieved when semantic LLM said match=true and confidence is high enough.
  // Graph router uses goalAchieved only (no parsing of reason text).
  const goalAchieved =
    success && semanticResult.match === true && confidence >= 0.85

  log.info(
    `[Observation] ${success ? "SUCCESS" : "FAILED"}: confidence=${confidence.toFixed(2)}, goalAchieved=${goalAchieved}, ${semanticResult.reason}`
  )

  const semanticSummary =
    semanticResult.reason?.substring(0, 300)?.trim() || undefined

  return {
    success,
    confidence,
    reason: reasonParts.join(" | "),
    expectedState: { description: userGoal },
    actualState,
    comparison: { semanticMatch: semanticResult.match, overallMatch: success },
    goalAchieved,
    semanticSummary,
  }
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
    ? { match: true, reason: "Skipped (dropdown); DOM checks only.", confidence: 1.0 }
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
    semanticSummary,
  }
}
