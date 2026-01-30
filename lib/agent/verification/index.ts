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
  VerificationTier,
} from "./types"

export { extractActualState, isPopupExpectation, performDOMChecks } from "./dom-checks"
export {
  parseSemanticVerificationResponse,
  performSemanticVerification,
  performSemanticVerificationOnObservations,
  type SemanticVerificationResult,
} from "./semantic-verification"
export {
  buildObservationList,
  type ObservationListResult,
} from "./observation-builder"
export { calculateConfidence, checkNextGoalAvailability } from "./confidence"

// Phase 5: Tiered verification
export {
  tryDeterministicVerification,
  performLightweightVerification,
  runTieredVerification,
  computeIsLastStep,
  estimateTokensSaved,
  type HeuristicResult,
  type LightweightResult,
  type TieredVerificationOptions,
} from "./tiered-verification"
