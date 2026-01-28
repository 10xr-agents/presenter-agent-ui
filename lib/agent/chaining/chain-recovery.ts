/**
 * Chain Recovery Logic
 *
 * Handles partial chain failures and determines recovery strategies.
 * When a client reports that an action chain partially failed, this
 * module analyzes the state and recommends how to proceed.
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Batch & Adapt Task 1
 */

import * as Sentry from "@sentry/nextjs"
import type {
  ActionChain,
  ChainedAction,
  ChainPartialState,
  ChainActionError,
  ChainRecoveryStrategy,
  ChainRecoveryResult,
} from "./types"
import { analyzeChainSafety } from "./chain-analyzer"
import { generateChainFromActions } from "./chain-generator"

// =============================================================================
// Configuration
// =============================================================================

/**
 * Maximum retry attempts for a single failed action
 */
const MAX_RETRY_ATTEMPTS = 2

/**
 * If remaining actions < this threshold, switch to single-action mode
 */
const MIN_REMAINING_FOR_CHAIN = 2

// =============================================================================
// Core Recovery Functions
// =============================================================================

/**
 * Handle partial chain failure
 *
 * When a client reports that a chain failed at index N, this function
 * analyzes the situation and returns a recovery strategy.
 *
 * @param originalChain - The original chain that was sent to the client
 * @param lastExecutedActionIndex - Index of the last successfully executed action
 * @param partialState - State information from the client
 * @param currentDom - Current DOM state (after failure)
 * @param error - Error details from the failed action
 * @returns Recovery result with strategy and next steps
 */
export async function handleChainPartialFailure(
  originalChain: ActionChain,
  lastExecutedActionIndex: number,
  partialState: ChainPartialState,
  currentDom: string,
  error?: ChainActionError
): Promise<ChainRecoveryResult> {
  console.log(
    `[ChainRecovery] Handling partial failure at index ${lastExecutedActionIndex}`,
    `Total chain size: ${originalChain.actions.length}`
  )

  const failedActionIndex = lastExecutedActionIndex + 1
  const failedAction = originalChain.actions[failedActionIndex]

  // Validate state consistency
  if (partialState.totalActionsInChain !== originalChain.actions.length) {
    Sentry.captureMessage("Chain length mismatch in recovery", {
      level: "warning",
      extra: {
        expected: originalChain.actions.length,
        reported: partialState.totalActionsInChain,
      },
    })
  }

  // If no failed action found (edge case), regenerate
  if (!failedAction) {
    console.log(`[ChainRecovery] Failed action not found, regenerating chain`)
    return createRegenerateResult(originalChain, lastExecutedActionIndex, currentDom)
  }

  // Check if failed action has canFail=true
  if (failedAction.canFail) {
    console.log(`[ChainRecovery] Action marked as canFail, skipping to next`)
    return createSkipResult(originalChain, failedActionIndex, currentDom)
  }

  // Analyze error type for recovery strategy
  const strategy = determineRecoveryStrategy(error, failedAction, currentDom)

  switch (strategy) {
    case "RETRY_FAILED":
      return createRetryResult(failedAction, currentDom, error)

    case "SKIP_FAILED":
      return createSkipResult(originalChain, failedActionIndex, currentDom)

    case "REGENERATE_CHAIN":
      return createRegenerateResult(originalChain, lastExecutedActionIndex, currentDom)

    case "SINGLE_ACTION":
      return createSingleActionResult(originalChain, failedActionIndex, currentDom)

    case "ABORT":
    default:
      return {
        strategy: "ABORT",
        reason: error?.message || "Unrecoverable chain failure",
      }
  }
}

/**
 * Determine recovery strategy based on error type and context
 */
function determineRecoveryStrategy(
  error: ChainActionError | undefined,
  failedAction: ChainedAction,
  currentDom: string
): ChainRecoveryStrategy {
  if (!error) {
    // No error details - try to regenerate with current DOM
    return "REGENERATE_CHAIN"
  }

  switch (error.code) {
    case "ELEMENT_NOT_FOUND":
      // Element missing - try to find alternative or regenerate
      if (canFindAlternativeElement(failedAction, currentDom)) {
        return "RETRY_FAILED"
      }
      return "REGENERATE_CHAIN"

    case "TIMEOUT":
      // Timeout might be transient - retry once, then regenerate
      return "RETRY_FAILED"

    case "ELEMENT_NOT_VISIBLE":
    case "ELEMENT_OBSCURED":
      // Visibility issues - might need DOM update, regenerate
      return "REGENERATE_CHAIN"

    case "ELEMENT_DISABLED":
      // Element disabled - skip or regenerate depending on context
      if (failedAction.canFail) {
        return "SKIP_FAILED"
      }
      return "REGENERATE_CHAIN"

    case "INVALID_STATE":
      // Page state changed unexpectedly - fall back to single actions
      return "SINGLE_ACTION"

    case "NETWORK_ERROR":
      // Network issues - abort chain execution
      return "ABORT"

    default:
      // Unknown error - be conservative, regenerate
      return "REGENERATE_CHAIN"
  }
}

// =============================================================================
// Recovery Result Builders
// =============================================================================

/**
 * Create a retry result with a corrected action
 */
function createRetryResult(
  failedAction: ChainedAction,
  currentDom: string,
  error?: ChainActionError
): ChainRecoveryResult {
  // Try to find alternative selector
  const alternativeAction = findAlternativeAction(failedAction, currentDom, error)

  if (alternativeAction) {
    return {
      strategy: "RETRY_FAILED",
      reason: `Retrying with alternative selector: ${error?.code || "unknown error"}`,
      correctedAction: alternativeAction,
    }
  }

  // Can't find alternative - fall back to regenerate
  return {
    strategy: "REGENERATE_CHAIN",
    reason: `Cannot find alternative for failed action, regenerating chain`,
  }
}

/**
 * Create a skip result that continues with remaining actions
 */
function createSkipResult(
  originalChain: ActionChain,
  skipIndex: number,
  currentDom: string
): ChainRecoveryResult {
  const remainingActions = originalChain.actions.slice(skipIndex + 1)

  if (remainingActions.length < MIN_REMAINING_FOR_CHAIN) {
    // Too few remaining - switch to single action mode
    const firstAction = remainingActions[0]
    if (remainingActions.length === 1 && firstAction) {
      return {
        strategy: "SINGLE_ACTION",
        reason: "Only one action remaining after skip",
        singleAction: {
          action: firstAction.action,
          thought: `Continuing with: ${firstAction.description}`,
        },
      }
    }
    return {
      strategy: "ABORT",
      reason: "No actions remaining after skip",
    }
  }

  // Create new chain with remaining actions
  const newChain: ActionChain = {
    actions: remainingActions.map((a, i) => ({ ...a, index: i })),
    metadata: {
      ...originalChain.metadata,
      totalActions: remainingActions.length,
    },
  }

  return {
    strategy: "SKIP_FAILED",
    reason: `Skipped failed action (canFail=true), continuing with ${remainingActions.length} remaining`,
    newChain,
  }
}

/**
 * Create a regenerate result that builds a new chain from current DOM
 */
function createRegenerateResult(
  originalChain: ActionChain,
  lastSuccessIndex: number,
  currentDom: string
): ChainRecoveryResult {
  // Get remaining action descriptions (for context in regeneration)
  const remainingActions = originalChain.actions.slice(lastSuccessIndex + 1)

  if (remainingActions.length === 0) {
    return {
      strategy: "ABORT",
      reason: "No actions remaining to regenerate",
    }
  }

  // For regeneration, we need the LLM to generate new actions
  // Return a result that signals the need for LLM regeneration
  return {
    strategy: "REGENERATE_CHAIN",
    reason: `Regenerating chain from current DOM state. Completed ${lastSuccessIndex + 1}/${originalChain.actions.length} actions.`,
    // newChain will be populated by the calling code after LLM call
  }
}

/**
 * Create a single-action mode result
 */
function createSingleActionResult(
  originalChain: ActionChain,
  fromIndex: number,
  currentDom: string
): ChainRecoveryResult {
  const nextAction = originalChain.actions[fromIndex]

  if (!nextAction) {
    return {
      strategy: "ABORT",
      reason: "No action available for single-action mode",
    }
  }

  return {
    strategy: "SINGLE_ACTION",
    reason: "Switching to single-action mode for stability",
    singleAction: {
      action: nextAction.action,
      thought: `Single-action mode: ${nextAction.description}`,
    },
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if we can find an alternative element for the failed action
 */
function canFindAlternativeElement(
  failedAction: ChainedAction,
  currentDom: string
): boolean {
  // Extract the action type and look for similar elements
  const actionType = failedAction.actionType
  const originalId = failedAction.targetElementId

  if (!actionType || !originalId) {
    return false
  }

  // Look for similar elements in DOM
  // This is a heuristic - we look for elements of the same type near the original position
  const elementPattern = getElementPatternForAction(actionType)
  if (!elementPattern) {
    return false
  }

  const matches = currentDom.match(new RegExp(elementPattern, "gi"))
  // If we find other matching elements, we might be able to use one
  return matches !== null && matches.length > 1
}

/**
 * Find an alternative action when the original element is not found
 */
function findAlternativeAction(
  failedAction: ChainedAction,
  currentDom: string,
  error?: ChainActionError
): ChainedAction | undefined {
  const actionType = failedAction.actionType
  const originalId = failedAction.targetElementId

  if (!actionType || !originalId) {
    return undefined
  }

  // Look for elements of the same type
  const elementPattern = getElementPatternForAction(actionType)
  if (!elementPattern) {
    return undefined
  }

  // Find all matching elements using exec() loop (compatible with all targets)
  const regex = new RegExp(`\\[(\\d+)\\]\\s*${elementPattern}`, "gi")
  const matches: RegExpExecArray[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(currentDom)) !== null) {
    matches.push(match)
  }

  if (matches.length === 0) {
    return undefined
  }

  // Find the closest ID to the original (heuristic: element IDs are often sequential)
  let closestMatch: { id: number; distance: number } | null = null

  for (const m of matches) {
    const idStr = m[1]
    if (!idStr) continue
    
    const id = parseInt(idStr, 10)
    if (id === originalId) continue // Skip the original

    const distance = Math.abs(id - originalId)
    if (!closestMatch || distance < closestMatch.distance) {
      closestMatch = { id, distance }
    }
  }

  if (!closestMatch || closestMatch.distance > 10) {
    // No close alternative found
    return undefined
  }

  // Build alternative action with new element ID
  const newAction = failedAction.action.replace(
    new RegExp(`\\(${originalId}`),
    `(${closestMatch.id}`
  )

  return {
    ...failedAction,
    action: newAction,
    targetElementId: closestMatch.id,
    description: `${failedAction.description} (alternative element)`,
  }
}

/**
 * Get DOM pattern for an action type
 */
function getElementPatternForAction(actionType: string): string | null {
  switch (actionType) {
    case "setValue":
      return "(?:input|textarea)"
    case "select":
      return "select"
    case "check":
    case "uncheck":
      return 'input[^\\[]*type="checkbox"'
    case "click":
      return "(?:button|a|\\[role=button\\])"
    default:
      return null
  }
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate chain partial state from client
 */
export function validateChainPartialState(
  partialState: ChainPartialState,
  originalChain: ActionChain
): { valid: boolean; error?: string } {
  // Check total matches
  if (partialState.totalActionsInChain !== originalChain.actions.length) {
    return {
      valid: false,
      error: `Total actions mismatch: expected ${originalChain.actions.length}, got ${partialState.totalActionsInChain}`,
    }
  }

  // Check executed actions count is reasonable
  if (partialState.executedActions.length >= originalChain.actions.length) {
    return {
      valid: false,
      error: "Executed actions count exceeds total",
    }
  }

  // Validate executed actions match original chain
  for (let i = 0; i < partialState.executedActions.length; i++) {
    const executed = partialState.executedActions[i]
    const original = originalChain.actions[i]?.action

    if (executed !== original) {
      return {
        valid: false,
        error: `Action mismatch at index ${i}: expected "${original}", got "${executed}"`,
      }
    }
  }

  return { valid: true }
}

// =============================================================================
// Exports
// =============================================================================

export {
  MAX_RETRY_ATTEMPTS,
  MIN_REMAINING_FOR_CHAIN,
  determineRecoveryStrategy,
}
