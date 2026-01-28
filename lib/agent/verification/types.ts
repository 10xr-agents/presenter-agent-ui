/**
 * Verification types — shared across verification engine modules.
 * @see docs/VERIFICATION_PROCESS.md
 */

import type { ExpectedOutcome } from "@/lib/models/task-action"

/**
 * Context for cost tracking (optional)
 */
export interface VerificationContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
}

/**
 * Client-side verification result from browser extension.
 * Extension runs document.querySelector() after action execution.
 * @see docs/VERIFICATION_PROCESS.md
 */
export interface ClientVerification {
  elementFound: boolean
  selector?: string
  urlChanged?: boolean
  timestamp?: number
}

/**
 * Actual state extracted from DOM
 */
export interface ActualState {
  domSnapshot: string
  url: string
  extractedText?: string
  elementStates?: Array<{
    selector: string
    exists: boolean
    text?: string
  }>
}

/**
 * DOM-based check results
 */
export interface DOMCheckResults {
  elementExists?: boolean
  elementNotExists?: boolean
  elementTextMatches?: boolean
  urlChanged?: boolean
  attributeChanged?: boolean
  elementsAppeared?: boolean
}

/**
 * Phase 3 Task 3: Next-goal verification result
 */
export interface NextGoalCheckResult {
  available: boolean
  reason: string
  required: boolean
}

/**
 * Verification result
 */
export interface VerificationResult {
  success: boolean
  confidence: number
  expectedState: ExpectedOutcome
  actualState: ActualState
  comparison: {
    domChecks?: DOMCheckResults
    semanticMatch?: boolean
    overallMatch: boolean
    nextGoalCheck?: NextGoalCheckResult
  }
  reason: string
}

/**
 * Observation-Based Verification (v3.0): Client observations from extension.
 */
export interface ClientObservations {
  didNetworkOccur?: boolean
  didDomMutate?: boolean
  didUrlChange?: boolean
}

/**
 * Before-state shape stored on TaskAction for observation-based verification.
 */
export interface BeforeState {
  url: string
  domHash: string
  activeElement?: string
  semanticSkeleton?: Record<string, unknown>
}
