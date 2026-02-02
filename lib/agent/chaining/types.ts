/**
 * Action Chaining Types
 *
 * Defines types for action chaining - the ability to batch multiple
 * related actions (e.g., form field fills) into a single response,
 * reducing round-trips and improving performance.
 *
 * Includes verification levels for lighter client-side verification
 * when full server verification is not needed.
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Batch & Adapt Task 1
 * @see VERIFICATION_PROCESS.md - Tiered verification
 */

import { z } from "zod"

// =============================================================================
// Core Chain Types
// =============================================================================

/**
 * Verification level for chained actions
 *
 * Determines how verification should be performed:
 * - "client": Client-side verification only (fastest, for low-risk actions)
 * - "lightweight": Server-side lightweight LLM verification (Tier 2)
 * - "full": Full server-side semantic verification (Tier 3)
 *
 * Client-side verification is appropriate for:
 * - Form field inputs where the value can be validated locally
 * - Checkbox/radio selections where state change is deterministic
 * - Actions within a safe container (same form, no navigation)
 *
 * @see VERIFICATION_PROCESS.md § Tiered Verification
 */
export type VerificationLevel = "client" | "lightweight" | "full"

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
  /**
   * Verification level for this action.
   * Determines how verification should be performed.
   *
   * - "client": Client-side only (value validation, state change check)
   * - "lightweight": Server-side lightweight LLM (Tier 2)
   * - "full": Full semantic verification (Tier 3)
   *
   * Defaults to "client" for chained actions unless specified otherwise.
   */
  verificationLevel?: VerificationLevel
  /**
   * Client-side verification checks to perform.
   * Only used when verificationLevel is "client".
   */
  clientVerificationChecks?: ClientVerificationCheck[]
}

/**
 * Client-side verification check types
 */
export type ClientVerificationCheckType =
  | "value_matches"      // Input value matches expected
  | "element_visible"    // Element is visible after action
  | "element_enabled"    // Element is enabled
  | "state_changed"      // Element state changed (checked, selected)
  | "no_error_message"   // No error message appeared
  | "success_message"    // Success message appeared

/**
 * A single client-side verification check
 */
export interface ClientVerificationCheck {
  /** Type of check to perform */
  type: ClientVerificationCheckType
  /** Target element ID (if applicable) */
  elementId?: number
  /** Expected value (for value_matches) */
  expectedValue?: string
  /** Text pattern to look for (for message checks) */
  textPattern?: string
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
  /**
   * Default verification level for all actions in this chain.
   * Individual actions can override this with their own verificationLevel.
   */
  defaultVerificationLevel?: VerificationLevel
  /**
   * Whether client-side verification is sufficient for this chain.
   * If true, the client can verify all actions locally without
   * sending intermediate verification requests to the server.
   */
  clientVerificationSufficient?: boolean
  /**
   * Final verification level for after all chain actions complete.
   * Even if clientVerificationSufficient is true, the final state
   * may need server verification.
   */
  finalVerificationLevel?: VerificationLevel
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
 * Schema for verification level
 */
export const verificationLevelSchema = z.enum(["client", "lightweight", "full"])

/**
 * Schema for client verification check type
 */
export const clientVerificationCheckTypeSchema = z.enum([
  "value_matches",
  "element_visible",
  "element_enabled",
  "state_changed",
  "no_error_message",
  "success_message",
])

/**
 * Schema for client verification check
 */
export const clientVerificationCheckSchema = z.object({
  type: clientVerificationCheckTypeSchema,
  elementId: z.number().int().positive().optional(),
  expectedValue: z.string().optional(),
  textPattern: z.string().optional(),
})

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
  verificationLevel: verificationLevelSchema.optional(),
  clientVerificationChecks: z.array(clientVerificationCheckSchema).optional(),
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
  defaultVerificationLevel: verificationLevelSchema.optional(),
  clientVerificationSufficient: z.boolean().optional(),
  finalVerificationLevel: verificationLevelSchema.optional(),
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

// =============================================================================
// Verification Level Helpers
// =============================================================================

/**
 * Action types that are safe for client-only verification
 * These actions have deterministic, locally-verifiable outcomes
 */
const CLIENT_VERIFIABLE_ACTIONS: ChainableActionType[] = [
  "setValue",   // Value can be checked immediately
  "check",      // Checkbox state is deterministic
  "uncheck",    // Checkbox state is deterministic
  "select",     // Selection state is deterministic
  "focus",      // Focus state can be checked
  "blur",       // Blur is deterministic
]

/**
 * Action types that may trigger navigation or complex state changes
 * These require at least lightweight server verification
 */
const REQUIRES_SERVER_VERIFICATION: ChainableActionType[] = [
  "click",      // Clicks can trigger navigation, modals, etc.
]

/**
 * Determine the appropriate verification level for an action
 *
 * @param actionType - The type of action
 * @param isLastInChain - Whether this is the last action in a chain
 * @param hasNavigationRisk - Whether the action might cause navigation
 * @returns The recommended verification level
 */
export function determineVerificationLevel(
  actionType: ChainableActionType | undefined,
  isLastInChain: boolean,
  hasNavigationRisk: boolean = false
): VerificationLevel {
  // If action might cause navigation, need full verification
  if (hasNavigationRisk) {
    return "full"
  }

  // Unknown action type = be safe with full verification
  if (!actionType) {
    return "full"
  }

  // Clicks always need server verification (at least lightweight)
  if (REQUIRES_SERVER_VERIFICATION.includes(actionType)) {
    return isLastInChain ? "full" : "lightweight"
  }

  // Safe actions can use client verification for intermediate steps
  if (CLIENT_VERIFIABLE_ACTIONS.includes(actionType)) {
    // Last action in chain needs at least lightweight verification
    return isLastInChain ? "lightweight" : "client"
  }

  // Default to lightweight for non-interactive actions
  return "lightweight"
}

/**
 * Check if an action chain can use client-side verification
 *
 * @param actions - The chained actions
 * @param chainReason - Why the actions were chained
 * @returns Whether client-side verification is sufficient
 */
export function canUseClientVerification(
  actions: ChainedAction[],
  chainReason: ChainReason
): boolean {
  // Form fills and related inputs are safe for client verification
  const safeReasons: ChainReason[] = ["FORM_FILL", "RELATED_INPUTS", "BULK_SELECTION"]
  if (!safeReasons.includes(chainReason)) {
    return false
  }

  // Check each action
  for (const action of actions) {
    const actionType = action.actionType ?? extractActionType(action.action)

    // If any action requires server verification, chain can't use client-only
    if (!actionType || REQUIRES_SERVER_VERIFICATION.includes(actionType)) {
      return false
    }

    // High-risk actions always need server verification
    if (isHighRiskAction(action.action)) {
      return false
    }
  }

  return true
}

/**
 * Build client verification checks for an action
 *
 * @param action - The action string
 * @param actionType - The type of action
 * @returns Array of client verification checks
 */
export function buildClientVerificationChecks(
  action: string,
  actionType: ChainableActionType | undefined
): ClientVerificationCheck[] {
  const checks: ClientVerificationCheck[] = []
  const elementId = extractElementId(action)

  switch (actionType) {
    case "setValue": {
      // Extract expected value from action
      const valueMatch = action.match(/setValue\(\d+,\s*['"]([^'"]*)['"]\)/)
      const expectedValue = valueMatch?.[1]
      if (elementId && expectedValue !== undefined) {
        checks.push({
          type: "value_matches",
          elementId,
          expectedValue,
        })
      }
      break
    }

    case "check":
      if (elementId) {
        checks.push({
          type: "state_changed",
          elementId,
        })
      }
      break

    case "uncheck":
      if (elementId) {
        checks.push({
          type: "state_changed",
          elementId,
        })
      }
      break

    case "select":
      if (elementId) {
        checks.push({
          type: "state_changed",
          elementId,
        })
      }
      break

    case "focus":
    case "blur":
      if (elementId) {
        checks.push({
          type: "element_visible",
          elementId,
        })
      }
      break

    default:
      // Add a basic no-error check for other actions
      checks.push({
        type: "no_error_message",
      })
  }

  return checks
}
