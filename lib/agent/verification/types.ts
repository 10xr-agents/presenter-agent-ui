/**
 * Verification types — shared across verification engine modules.
 * @see docs/VERIFICATION_PROCESS.md
 */

import type { ExpectedOutcome } from "@/lib/models/task-action"

/**
 * Context for cost tracking and Langfuse trace linkage (optional)
 */
export interface VerificationContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
  /** Langfuse trace ID for this interact request (costs and scores attached to this trace) */
  langfuseTraceId?: string
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
 * Summary of verification outcome for planning/step-refinement context.
 * Passed so prompts can state "Previous action succeeded; full goal not yet achieved."
 * @see docs/VERIFICATION_PROCESS.md Task 7, docs/PLANNER_PROCESS.md
 */
export interface VerificationSummary {
  /** True when the LLM said this action did something useful (e.g. form opened). */
  action_succeeded?: boolean
  /** True when the LLM said the entire user goal is done. */
  task_completed?: boolean
}

/**
 * Verification result.
 * goalAchieved is set deterministically from semantic verification: when the LLM
 * returns task_completed=true and confidence is high enough, we set goalAchieved=true.
 * success is set when action_succeeded=true and confidence >= 0.7 (so we route to next
 * action vs correction). The graph uses goalAchieved and success only (no parsing of reason).
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
  /**
   * True when verification passed and semantic verdict indicated the user's goal
   * was achieved (LLM returned task_completed=true with sufficient confidence).
   * Set by the engine; graph router uses this only to decide task complete.
   */
  goalAchieved?: boolean
  /**
   * True when the LLM says this action did something useful (e.g. form opened).
   * Used with success: route to next action when action_succeeded; else correction.
   */
  action_succeeded?: boolean
  /**
   * True when the LLM says the entire user goal is done (e.g. form submitted, task complete).
   * Used with confidence >= 0.85 to set goalAchieved.
   */
  task_completed?: boolean
  /**
   * Phase 4 Task 9: True when current sub-task objective was achieved (hierarchical only).
   * Used with confidence >= 0.7 to advance to next sub-task or fail sub-task.
   */
  sub_task_completed?: boolean
  /**
   * Short semantic summary for display (e.g. in goal_achieved node).
   * Set by the engine from semantic verdict; do not parse reason text for display.
   */
  semanticSummary?: string
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
