/**
 * Verification engine modules — DOM checks, semantic verification, observation builder, confidence.
 * @see docs/VERIFICATION_PROCESS.md
 */

export type {
  VerificationContext,
  ClientVerification,
  ActualState,
  DOMCheckResults,
  NextGoalCheckResult,
  VerificationResult,
  ClientObservations,
  BeforeState,
} from "./types"

export { extractActualState, isPopupExpectation, performDOMChecks } from "./dom-checks"
export {
  performSemanticVerification,
  performSemanticVerificationOnObservations,
  type SemanticVerificationResult,
} from "./semantic-verification"
export { buildObservationList } from "./observation-builder"
export { calculateConfidence, checkNextGoalAvailability } from "./confidence"
