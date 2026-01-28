/**
 * Action Chaining Types
 *
 * Defines types for action chaining - the ability to batch multiple
 * related actions (e.g., form field fills) into a single response,
 * reducing round-trips and improving performance.
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Batch & Adapt Task 1
 */

import { z } from "zod"

// =============================================================================
// Core Chain Types
// =============================================================================

/**
 * Supported action types that can be chained
 */
export type ChainableActionType =
  | "click"
  | "setValue"
  | "check"
  | "uncheck"
  | "select"
  | "focus"
  | "blur"
  | "hover"
  | "scroll"
  | "wait"

/**
 * A single action within a chain
 */
export interface ChainedAction {
  /** The action string (e.g., "setValue(101, 'John')") */
  action: string
  /** Human-readable description of what this action does */
  description: string
  /** Position in the chain (0-indexed) */
  index: number
  /**
   * If true, chain execution continues even if this action fails.
   * Use sparingly - only for truly optional actions.
   */
  canFail?: boolean
  /**
   * Target element ID for DOM actions.
   * Used for validation and recovery.
   */
  targetElementId?: number
  /**
   * Action type for categorization
   */
  actionType?: ChainableActionType
  /**
   * Expected outcome after this action (for mid-chain verification)
   */
  expectedOutcome?: {
    description?: string
    elementShouldExist?: string
    elementShouldHaveValue?: {
      selector: string
      value: string
    }
  }
}

/**
 * Metadata about the action chain
 */
export interface ChainMetadata {
  /** Total number of actions in the chain */
  totalActions: number
  /** Estimated execution duration in milliseconds */
  estimatedDuration?: number
  /**
   * Server's confidence that these actions can be safely chained.
   * Lower confidence = client should be more cautious about continuing on errors.
   */
  safeToChain: boolean
  /**
   * Reason why actions were grouped into a chain.
   * Helps debugging and improving chain detection.
   */
  chainReason: ChainReason
  /**
   * DOM container that groups these actions (if applicable)
   * e.g., "form#patient-registration"
   */
  containerSelector?: string
}

/**
 * Reasons why actions were chained
 */
export type ChainReason =
  | "FORM_FILL"        // Multiple fields in the same form
  | "RELATED_INPUTS"   // Related input fields (e.g., address components)
  | "BULK_SELECTION"   // Multiple checkbox/radio selections
  | "SEQUENTIAL_STEPS" // Steps that must execute in order
  | "OPTIMIZED_PATH"   // Optimization of naturally sequential actions

/**
 * Complete action chain response
 */
export interface ActionChain {
  /** Individual actions to execute */
  actions: ChainedAction[]
  /** Chain metadata */
  metadata: ChainMetadata
}

// =============================================================================
// Partial Failure Types (Client → Server)
// =============================================================================

/**
 * State reported by client when chain execution partially fails
 */
export interface ChainPartialState {
  /**
   * Actions that executed successfully (action strings).
   * Helps server understand what was completed.
   */
  executedActions: string[]
  /**
   * DOM state captured after the last successful action.
   * Optional - only sent if DOM changed significantly.
   */
  domAfterLastSuccess?: string
  /**
   * Total number of actions that were in the original chain.
   * Used for validation.
   */
  totalActionsInChain: number
}

/**
 * Error information for a failed chain action
 */
export interface ChainActionError {
  /** The action that failed */
  action: string
  /** Error message from client */
  message: string
  /** Error code (e.g., 'ELEMENT_NOT_FOUND', 'TIMEOUT') */
  code: string
  /** Element ID that couldn't be found (if applicable) */
  elementId?: number
  /** Index of the failed action in the chain */
  failedIndex: number
}

// =============================================================================
// Chain Safety Analysis Types
// =============================================================================

/**
 * Result from analyzing whether actions can be safely chained
 */
export interface ChainSafetyAnalysis {
  /** Whether these actions can be safely chained */
  canChain: boolean
  /** Confidence score (0-1) */
  confidence: number
  /** Reason for the decision */
  reason: string
  /**
   * If canChain is false, why not?
   */
  blockers?: ChainBlocker[]
  /**
   * Suggested chain groupings if actions can be partially chained
   */
  suggestedGroups?: ChainedAction[][]
}

/**
 * Reasons why chaining was blocked
 */
export type ChainBlocker =
  | "NAVIGATION_EXPECTED"      // Actions may cause page navigation
  | "ASYNC_DEPENDENCY"         // Action N+1 depends on server response from N
  | "CROSS_CONTAINER"          // Actions target different logical containers
  | "HIGH_RISK_ACTION"         // Contains finish(), fail(), or destructive actions
  | "DYNAMIC_CONTENT"          // Content may change after action
  | "REQUIRES_VERIFICATION"    // Actions need verification before continuing
  | "DIFFERENT_INTERACTION_TYPE" // Mix of click/input/select actions

// =============================================================================
// Chain Recovery Types (Server-Side)
// =============================================================================

/**
 * Recovery strategy when chain fails mid-execution
 */
export type ChainRecoveryStrategy =
  | "RETRY_FAILED"      // Retry the failed action with same/different selector
  | "SKIP_FAILED"       // Skip failed action if canFail=true
  | "REGENERATE_CHAIN"  // Regenerate remaining chain from current DOM
  | "SINGLE_ACTION"     // Fall back to single-action mode
  | "ABORT"             // Stop chain execution entirely

/**
 * Result of chain recovery analysis
 */
export interface ChainRecoveryResult {
  /** Recovery strategy to use */
  strategy: ChainRecoveryStrategy
  /** Reason for choosing this strategy */
  reason: string
  /**
   * If RETRY_FAILED: the corrected action to try
   */
  correctedAction?: ChainedAction
  /**
   * If REGENERATE_CHAIN: the new chain to execute
   */
  newChain?: ActionChain
  /**
   * If SINGLE_ACTION: the next single action
   */
  singleAction?: {
    action: string
    thought: string
  }
}

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

/**
 * Schema for a single chained action
 */
export const chainedActionSchema = z.object({
  action: z.string().min(1),
  description: z.string().min(1),
  index: z.number().int().nonnegative(),
  canFail: z.boolean().optional(),
  targetElementId: z.number().int().positive().optional(),
  actionType: z
    .enum([
      "click",
      "setValue",
      "check",
      "uncheck",
      "select",
      "focus",
      "blur",
      "hover",
      "scroll",
      "wait",
    ])
    .optional(),
  expectedOutcome: z
    .object({
      description: z.string().optional(),
      elementShouldExist: z.string().optional(),
      elementShouldHaveValue: z
        .object({
          selector: z.string(),
          value: z.string(),
        })
        .optional(),
    })
    .optional(),
})

/**
 * Schema for chain metadata
 */
export const chainMetadataSchema = z.object({
  totalActions: z.number().int().positive(),
  estimatedDuration: z.number().positive().optional(),
  safeToChain: z.boolean(),
  chainReason: z.enum([
    "FORM_FILL",
    "RELATED_INPUTS",
    "BULK_SELECTION",
    "SEQUENTIAL_STEPS",
    "OPTIMIZED_PATH",
  ]),
  containerSelector: z.string().optional(),
})

/**
 * Schema for the complete action chain
 */
export const actionChainSchema = z.object({
  actions: z.array(chainedActionSchema).min(1),
  metadata: chainMetadataSchema,
})

/**
 * Schema for partial state (client → server)
 */
export const chainPartialStateSchema = z.object({
  executedActions: z.array(z.string()),
  domAfterLastSuccess: z.string().optional(),
  totalActionsInChain: z.number().int().positive(),
})

/**
 * Schema for chain action error
 */
export const chainActionErrorSchema = z.object({
  action: z.string(),
  message: z.string(),
  code: z.string(),
  elementId: z.number().int().positive().optional(),
  failedIndex: z.number().int().nonnegative(),
})

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an action type can be chained
 */
export function isChainableActionType(action: string): boolean {
  const chainablePatterns = [
    /^click\(/,
    /^setValue\(/,
    /^check\(/,
    /^uncheck\(/,
    /^select\(/,
    /^focus\(/,
    /^blur\(/,
    /^hover\(/,
    /^scroll\(/,
    /^wait\(/,
  ]
  return chainablePatterns.some((pattern) => pattern.test(action))
}

/**
 * Check if an action is a high-risk action that shouldn't be in a chain
 */
export function isHighRiskAction(action: string): boolean {
  const highRiskPatterns = [
    /^finish\(/,
    /^fail\(/,
    /^navigate\(/,
    /^googleSearch\(/,
    /^submit\(/,  // Form submit can trigger navigation
    /^delete/i,   // Destructive actions
    /^remove/i,
  ]
  return highRiskPatterns.some((pattern) => pattern.test(action))
}

/**
 * Extract element ID from an action string
 */
export function extractElementId(action: string): number | undefined {
  // Pattern: actionName(elementId, ...) or actionName(elementId)
  const match = action.match(/^\w+\((\d+)/)
  const idStr = match?.[1]
  return idStr ? parseInt(idStr, 10) : undefined
}

/**
 * Extract action type from action string
 */
export function extractActionType(action: string): ChainableActionType | undefined {
  const match = action.match(/^(\w+)\(/)
  if (!match || !match[1]) return undefined
  
  const actionName = match[1].toLowerCase()
  const typeMap: Record<string, ChainableActionType> = {
    click: "click",
    setvalue: "setValue",
    check: "check",
    uncheck: "uncheck",
    select: "select",
    focus: "focus",
    blur: "blur",
    hover: "hover",
    scroll: "scroll",
    wait: "wait",
  }
  
  return typeMap[actionName]
}
