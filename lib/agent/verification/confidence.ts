/**
 * Confidence calculation and next-goal check for verification (prediction-based path).
 * @see docs/VERIFICATION_PROCESS.md
 */

import type { ActionType } from "@/lib/agent/action-type"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import type { ScopedLogger } from "@/lib/utils/logger"
import type {
  ClientVerification,
  DOMCheckResults,
  NextGoalCheckResult,
} from "./types"

const SEMANTIC_OVERRIDE_THRESHOLD = 0.85
const DOM_WEIGHT = 0.3
const SEMANTIC_WEIGHT = 0.7
const URL_CHANGE_BOOST = 0.5
const CLIENT_VERIFICATION_WEIGHT = 0.4
const NOT_FOUND_PENALTY_CAP = 0.6

/**
 * Phase 3 Task 3: Check if next-goal element/state is available.
 */
export function checkNextGoalAvailability(
  nextGoal: NonNullable<ExpectedOutcome["nextGoal"]>,
  dom: string
): NextGoalCheckResult {
  let available = false
  const checkResults: string[] = []

  if (nextGoal.selector) {
    if (nextGoal.selector.startsWith("#")) {
      const id = nextGoal.selector.substring(1)
      available = dom.includes(`id="${id}"`) || dom.includes(`id='${id}'`)
      checkResults.push(`selector(${nextGoal.selector}): ${available ? "found" : "not found"}`)
    } else if (nextGoal.selector.startsWith(".")) {
      const className = nextGoal.selector.substring(1)
      available =
        dom.includes(`class="${className}"`) ||
        dom.includes(`class='${className}'`) ||
        dom.includes(` ${className} `) ||
        dom.includes(` ${className}"`) ||
        dom.includes(` ${className}'`)
      checkResults.push(`selector(${nextGoal.selector}): ${available ? "found" : "not found"}`)
    } else {
      available = dom.toLowerCase().includes(`<${nextGoal.selector.toLowerCase()}`)
      checkResults.push(`selector(${nextGoal.selector}): ${available ? "found" : "not found"}`)
    }
  }

  if (!available && nextGoal.textContent) {
    available = dom.includes(nextGoal.textContent)
    checkResults.push(`text("${nextGoal.textContent}"): ${available ? "found" : "not found"}`)
  }

  if (!available && nextGoal.role) {
    const roleRegex = new RegExp(`role=["']?${nextGoal.role}["']?`, "i")
    available = roleRegex.test(dom)
    checkResults.push(`role(${nextGoal.role}): ${available ? "found" : "not found"}`)
  }

  if (checkResults.length === 0 && nextGoal.description) {
    available = true
    checkResults.push("no specific selector/text/role to verify")
  }

  const reason = available
    ? `Next-goal available: ${nextGoal.description} (${checkResults.join(", ")})`
    : `Next-goal NOT available: ${nextGoal.description} (${checkResults.join(", ")})`

  return { available, reason, required: nextGoal.required }
}

/**
 * Calculate confidence score (prediction-based path).
 */
export function calculateConfidence(
  domChecks: DOMCheckResults,
  semanticMatch: boolean,
  semanticConfidence = semanticMatch ? 1.0 : 0.0,
  actionType?: ActionType,
  urlActuallyChanged = false,
  expectedUrlChange = false,
  clientVerification?: ClientVerification,
  elementExpectedButMissing = false,
  log?: ScopedLogger
): number {
  let confidence = 0
  let maxConfidenceCap = 1.0

  if (clientVerification !== undefined) {
    if (clientVerification.elementFound) {
      confidence = Math.max(confidence, CLIENT_VERIFICATION_WEIGHT)
    } else {
      maxConfidenceCap = Math.min(maxConfidenceCap, NOT_FOUND_PENALTY_CAP)
      const msg = `Client querySelector returned false for selector "${clientVerification.selector}" - capping confidence at ${NOT_FOUND_PENALTY_CAP}`
      if (log) log.info(msg)
      else console.log(`[Verification] ${msg}`)
    }
    if (clientVerification.urlChanged !== undefined && expectedUrlChange) {
      if (clientVerification.urlChanged) {
        confidence += 0.2
      }
    }
  }

  const skipNotFoundPenaltyForNavigation = expectedUrlChange && urlActuallyChanged

  if (elementExpectedButMissing && domChecks.elementExists === false) {
    if (skipNotFoundPenaltyForNavigation) {
      const msg = "Expected element not found, but URL changed as expected - skipping penalty"
      if (log) log.info(msg)
      else console.log(`[Verification] ${msg}`)
    } else {
      maxConfidenceCap = Math.min(maxConfidenceCap, NOT_FOUND_PENALTY_CAP)
      const msg = `Expected element not found in DOM context - capping confidence at ${NOT_FOUND_PENALTY_CAP}`
      if (log) log.info(msg)
      else console.log(`[Verification] ${msg}`)
    }
  }

  let domScore = 0
  let domCount = 0
  if (domChecks.elementExists !== undefined) {
    domScore += domChecks.elementExists ? 1 : 0
    domCount++
  }
  if (domChecks.elementNotExists !== undefined) {
    domScore += domChecks.elementNotExists ? 1 : 0
    domCount++
  }
  if (domChecks.elementTextMatches !== undefined) {
    domScore += domChecks.elementTextMatches ? 1 : 0
    domCount++
  }
  if (domChecks.urlChanged !== undefined) {
    domScore += domChecks.urlChanged ? 1 : 0
    domCount++
  }
  if (domChecks.attributeChanged !== undefined) {
    domScore += domChecks.attributeChanged ? 1 : 0
    domCount++
  }
  if (domChecks.elementsAppeared !== undefined) {
    domScore += domChecks.elementsAppeared ? 1 : 0
    domCount++
  }

  const domAverage = domCount > 0 ? domScore / domCount : 0.5

  if ((actionType === "navigation" || actionType === "generic") && expectedUrlChange) {
    if (urlActuallyChanged) {
      confidence += URL_CHANGE_BOOST
    }
  }

  if (semanticConfidence >= SEMANTIC_OVERRIDE_THRESHOLD) {
    confidence = Math.max(confidence, semanticConfidence)
  } else {
    const weightedScore = domAverage * DOM_WEIGHT + semanticConfidence * SEMANTIC_WEIGHT
    confidence = Math.max(confidence, weightedScore)
  }

  confidence = Math.min(confidence, maxConfidenceCap)
  return Math.max(0, Math.min(1, confidence))
}
