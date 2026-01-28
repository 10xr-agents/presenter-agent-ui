/**
 * Chain Generator
 *
 * Generates action chains from LLM responses or plan analysis.
 * Handles both LLM-driven chain generation and heuristic-based grouping.
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Batch & Adapt Task 1
 */

import * as Sentry from "@sentry/nextjs"
import {
  analyzeChainSafety,
  buildChainMetadata,
  identifyChainableGroups,
  MAX_CHAIN_SIZE,
  MIN_CHAIN_SIZE,
} from "./chain-analyzer"
import type {
  ActionChain,
  ChainableActionType,
  ChainedAction,
  ChainMetadata,
  ChainReason,
} from "./types"
import {
  extractActionType,
  extractElementId,
  isChainableActionType,
  isHighRiskAction,
} from "./types"

// =============================================================================
// Chain Generation from Form Analysis
// =============================================================================

/**
 * Generate an action chain for form filling
 *
 * Analyzes the DOM to identify form fields and generates setValue actions
 * for each field based on the provided data mapping.
 *
 * @param fieldData - Map of field name/label to value
 * @param dom - Current DOM state
 * @param containerSelector - Optional form selector to constrain search
 * @returns ActionChain or null if chaining not possible
 */
export function generateFormFillChain(
  fieldData: Record<string, string>,
  dom: string,
  containerSelector?: string
): ActionChain | null {
  const entries = Object.entries(fieldData)

  if (entries.length < MIN_CHAIN_SIZE) {
    return null
  }

  const actions: ChainedAction[] = []
  let foundFields = 0

  for (const [fieldName, value] of entries) {
    // Find element ID for this field in DOM
    const elementId = findElementIdByLabel(dom, fieldName)

    if (elementId !== undefined) {
      actions.push({
        action: `setValue(${elementId}, '${escapeValue(value)}')`,
        description: `Enter ${fieldName}`,
        index: foundFields,
        targetElementId: elementId,
        actionType: "setValue",
      })
      foundFields++
    }
  }

  if (actions.length < MIN_CHAIN_SIZE) {
    return null
  }

  // Limit chain size
  const chainedActions = actions.slice(0, MAX_CHAIN_SIZE)

  return {
    actions: chainedActions.map((a, i) => ({ ...a, index: i })),
    metadata: buildChainMetadata(chainedActions, "FORM_FILL", containerSelector),
  }
}

/**
 * Generate an action chain from multiple LLM-generated actions
 *
 * When the LLM generates multiple actions (e.g., from parsing a plan step),
 * this function packages them into a chain if they're safe to chain.
 *
 * @param actions - Array of action strings
 * @param descriptions - Optional descriptions for each action
 * @param dom - Current DOM for safety analysis
 * @returns ActionChain or null if chaining not safe
 */
export function generateChainFromActions(
  actions: string[],
  descriptions?: string[],
  dom?: string
): ActionChain | null {
  if (actions.length < MIN_CHAIN_SIZE) {
    return null
  }

  // Filter out high-risk actions
  const safeActions = actions.filter((a) => !isHighRiskAction(a))
  if (safeActions.length < MIN_CHAIN_SIZE) {
    return null
  }

  // Verify all actions are chainable
  const chainableActions = safeActions.filter(isChainableActionType)
  if (chainableActions.length < MIN_CHAIN_SIZE) {
    return null
  }

  // Perform safety analysis if DOM provided
  if (dom) {
    const safety = analyzeChainSafety(chainableActions, dom)
    if (!safety.canChain) {
      console.log(`[ChainGenerator] Safety check failed: ${safety.reason}`)
      return null
    }
  }

  // Build chained actions
  const chainedActions: ChainedAction[] = chainableActions
    .slice(0, MAX_CHAIN_SIZE)
    .map((action, index) => ({
      action,
      description: descriptions?.[index] || generateActionDescription(action),
      index,
      targetElementId: extractElementId(action),
      actionType: extractActionType(action),
    }))

  // Determine chain reason
  const reason = determineChainReason(chainedActions)

  return {
    actions: chainedActions,
    metadata: buildChainMetadata(chainedActions, reason),
  }
}

/**
 * Parse an LLM response that may contain multiple actions
 *
 * The LLM may return multiple actions separated by newlines or semicolons
 * when it identifies a form-fill or batch operation.
 *
 * @param llmResponse - Raw LLM response text
 * @param dom - Current DOM for validation
 * @returns ActionChain or null if single action or parsing fails
 */
export function parseChainFromLLMResponse(
  llmResponse: string,
  dom?: string
): ActionChain | null {
  try {
    // Look for chain marker in response
    // Format: CHAIN: action1 | action2 | action3
    const chainMatch = llmResponse.match(/CHAIN:\s*(.+?)(?:\n|$)/i)
    if (chainMatch && chainMatch[1]) {
      const actions = chainMatch[1]
        .split("|")
        .map((a) => a.trim())
        .filter((a) => a.length > 0)

      if (actions.length >= MIN_CHAIN_SIZE) {
        return generateChainFromActions(actions, undefined, dom)
      }
    }

    // Look for numbered actions
    // Format: 1. action1\n2. action2\n3. action3
    const numberedActions = llmResponse.match(/^\d+\.\s*(\w+\([^)]+\))/gm)
    if (numberedActions && numberedActions.length >= MIN_CHAIN_SIZE) {
      const actions = numberedActions.map((a) => a.replace(/^\d+\.\s*/, ""))
      return generateChainFromActions(actions, undefined, dom)
    }

    // Look for action calls on separate lines
    const actionLines = llmResponse
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\w+\(\d+/.test(line))

    if (actionLines.length >= MIN_CHAIN_SIZE) {
      return generateChainFromActions(actionLines, undefined, dom)
    }

    return null
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "chain-generator" },
      extra: { llmResponseLength: llmResponse.length },
    })
    return null
  }
}

// =============================================================================
// Prompt Enhancement for Chain Generation
// =============================================================================

/**
 * Build chain generation instructions for the LLM prompt
 *
 * @param planStep - Current plan step (if available)
 * @param dom - Current DOM
 * @returns Additional prompt instructions for chain generation
 */
export function buildChainPromptInstructions(
  planStep?: string,
  dom?: string
): string {
  // Check if this looks like a form-fill task
  const isFormFillLikely =
    planStep && /fill|enter|input|complete|form|data/i.test(planStep)

  if (!isFormFillLikely) {
    return ""
  }

  return `
ACTION CHAINING INSTRUCTIONS:
If you need to fill multiple form fields, you can return multiple actions as a chain.
Format: CHAIN: action1 | action2 | action3

Example for form filling:
CHAIN: setValue(101, 'John') | setValue(102, 'Doe') | setValue(103, 'john@email.com')

Chain rules:
- Only chain setValue, select, check, uncheck actions
- Do NOT chain click actions (may cause navigation)
- Maximum ${MAX_CHAIN_SIZE} actions per chain
- All actions must target the same form/container
- Do NOT include submit/finish actions in chains

If unsure, return a single action instead of a chain.
`
}

/**
 * Enhance prompt for chain-aware action generation
 */
export function enhancePromptForChaining(
  basePrompt: string,
  planStep?: string,
  dom?: string
): string {
  const chainInstructions = buildChainPromptInstructions(planStep, dom)

  if (!chainInstructions) {
    return basePrompt
  }

  // Insert chain instructions after the action format section
  const insertPoint = basePrompt.indexOf("ACTION:")
  if (insertPoint !== -1) {
    return (
      basePrompt.slice(0, insertPoint) +
      chainInstructions +
      "\n" +
      basePrompt.slice(insertPoint)
    )
  }

  return basePrompt + "\n" + chainInstructions
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Find element ID by field label in DOM
 */
function findElementIdByLabel(dom: string, labelText: string): number | undefined {
  const normalizedLabel = labelText.toLowerCase().trim()

  // Pattern 1: Look for label[for="id"] followed by input
  // Pattern 2: Look for input with name/placeholder matching label
  // Pattern 3: Look for text near input element

  // Simplified pattern: [id] input ... labelText
  const patterns = [
    // Input with name containing label
    new RegExp(`\\[(\\d+)\\]\\s*(?:input|select|textarea)[^\\[]*name="${escapeRegex(normalizedLabel)}"`, "i"),
    // Input with placeholder containing label
    new RegExp(`\\[(\\d+)\\]\\s*(?:input|select|textarea)[^\\[]*placeholder="[^"]*${escapeRegex(normalizedLabel)}[^"]*"`, "i"),
    // Label text before input
    new RegExp(`${escapeRegex(normalizedLabel)}[^\\[]*\\[(\\d+)\\]\\s*(?:input|select|textarea)`, "i"),
    // Input followed by label text
    new RegExp(`\\[(\\d+)\\]\\s*(?:input|select|textarea)[^\\[]*${escapeRegex(normalizedLabel)}`, "i"),
  ]

  for (const pattern of patterns) {
    const match = dom.match(pattern)
    if (match && match[1]) {
      return parseInt(match[1], 10)
    }
  }

  return undefined
}

/**
 * Generate a human-readable description for an action
 */
function generateActionDescription(action: string): string {
  const type = extractActionType(action)
  const elementId = extractElementId(action)

  switch (type) {
    case "setValue": {
      const valueMatch = action.match(/setValue\(\d+,\s*'([^']*)'/)
      const value = valueMatch?.[1] ?? ""
      return `Enter "${value.substring(0, 20)}${value.length > 20 ? "..." : ""}"`
    }
    case "click":
      return `Click element ${elementId}`
    case "select": {
      const optionMatch = action.match(/select\(\d+,\s*'([^']*)'/)
      const option = optionMatch?.[1] ?? ""
      return `Select "${option}"`
    }
    case "check":
      return "Check checkbox"
    case "uncheck":
      return "Uncheck checkbox"
    case "focus":
      return `Focus element ${elementId}`
    case "blur":
      return `Remove focus from element ${elementId}`
    case "hover":
      return `Hover over element ${elementId}`
    case "scroll":
      return "Scroll page"
    case "wait": {
      const msMatch = action.match(/wait\((\d+)\)/)
      const ms = msMatch?.[1] ?? "?"
      return `Wait ${ms}ms`
    }
    default:
      return `Execute ${action.substring(0, 30)}`
  }
}

/**
 * Determine the reason for chaining based on action types
 */
function determineChainReason(actions: ChainedAction[]): ChainReason {
  const types = actions.map((a) => a.actionType).filter((t): t is ChainableActionType => t !== undefined)

  // All setValue = form fill
  if (types.every((t) => t === "setValue")) {
    return "FORM_FILL"
  }

  // Mix of setValue and select = form fill
  if (types.every((t) => t === "setValue" || t === "select")) {
    return "FORM_FILL"
  }

  // All check/uncheck = bulk selection
  if (types.every((t) => t === "check" || t === "uncheck")) {
    return "BULK_SELECTION"
  }

  // Related input types
  if (types.every((t) => ["setValue", "select", "check", "uncheck"].includes(t))) {
    return "RELATED_INPUTS"
  }

  return "SEQUENTIAL_STEPS"
}

/**
 * Escape special characters for use in a setValue action
 */
function escapeValue(value: string): string {
  return value.replace(/'/g, "\\'").replace(/\n/g, "\\n")
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// =============================================================================
// Exports
// =============================================================================

export {
  generateActionDescription,
  determineChainReason,
}
