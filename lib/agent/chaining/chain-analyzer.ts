/**
 * Chain Safety Analyzer
 *
 * Analyzes actions and DOM to determine if actions can be safely chained.
 * Uses heuristics to identify form fields, related inputs, and safe groupings.
 *
 * Chain Safety Criteria (from INTERACT_FLOW_WALKTHROUGH.md):
 * - Same form/container: Actions target elements in same logical group
 * - No navigation expected: URL should not change during chain
 * - No async dependencies: Action N+1 doesn't depend on server response from N
 * - Low-risk actions only: No finish(), fail(), or destructive actions
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Batch & Adapt Task 1
 */

import type {
  ChainableActionType,
  ChainBlocker,
  ChainedAction,
  ChainReason,
  ChainSafetyAnalysis,
} from "./types"
import {
  extractActionType,
  extractElementId,
  isChainableActionType,
  isHighRiskAction,
} from "./types"

// =============================================================================
// Configuration
// =============================================================================

/**
 * Maximum actions allowed in a single chain
 * Prevents runaway chains and limits blast radius of failures
 */
const MAX_CHAIN_SIZE = 10

/**
 * Minimum actions required for chaining
 * Single actions don't benefit from chaining
 */
const MIN_CHAIN_SIZE = 2

/**
 * Confidence threshold for chaining decision
 */
const CHAIN_CONFIDENCE_THRESHOLD = 0.7

// =============================================================================
// DOM Analysis Types
// =============================================================================

interface DOMElementInfo {
  id: number
  tagName: string
  type?: string
  name?: string
  formId?: string
  containerSelector?: string
  isInput: boolean
  isButton: boolean
  isSelect: boolean
}

// =============================================================================
// Core Analysis Functions
// =============================================================================

/**
 * Analyze if a list of actions can be safely chained
 *
 * @param actions - Actions to analyze (as strings)
 * @param dom - Current DOM state
 * @returns Safety analysis result
 */
export function analyzeChainSafety(
  actions: string[],
  dom: string
): ChainSafetyAnalysis {
  // Early exit for single or no actions
  if (actions.length < MIN_CHAIN_SIZE) {
    return {
      canChain: false,
      confidence: 1.0,
      reason: "Not enough actions to chain",
      blockers: [],
    }
  }

  // Check for high-risk actions
  const highRiskActions = actions.filter(isHighRiskAction)
  if (highRiskActions.length > 0) {
    return {
      canChain: false,
      confidence: 1.0,
      reason: `Contains high-risk actions: ${highRiskActions.join(", ")}`,
      blockers: ["HIGH_RISK_ACTION"],
    }
  }

  // Check all actions are chainable types
  const nonChainableActions = actions.filter((a) => !isChainableActionType(a))
  if (nonChainableActions.length > 0) {
    return {
      canChain: false,
      confidence: 1.0,
      reason: `Contains non-chainable actions: ${nonChainableActions.join(", ")}`,
      blockers: [],
    }
  }

  // Extract element IDs
  const elementIds = actions.map(extractElementId).filter((id): id is number => id !== undefined)
  if (elementIds.length === 0) {
    return {
      canChain: false,
      confidence: 0.8,
      reason: "Could not extract element IDs from actions",
      blockers: [],
    }
  }

  // Parse DOM to get element info
  const elementInfos = parseElementsFromDOM(dom, elementIds)

  // Check if elements are in the same container
  const containerAnalysis = analyzeContainerRelationship(elementInfos)

  // Check action type consistency
  const actionTypes = actions.map(extractActionType).filter((t): t is ChainableActionType => t !== undefined)
  const typeConsistency = analyzeActionTypeConsistency(actionTypes)

  // Calculate confidence based on factors
  const confidence = calculateChainConfidence({
    containerAnalysis,
    typeConsistency,
    actionCount: actions.length,
  })

  // Collect blockers
  const blockers: ChainBlocker[] = []
  if (!containerAnalysis.isSameContainer) {
    blockers.push("CROSS_CONTAINER")
  }
  if (!typeConsistency.isConsistent) {
    blockers.push("DIFFERENT_INTERACTION_TYPE")
  }

  const canChain = confidence >= CHAIN_CONFIDENCE_THRESHOLD && blockers.length === 0

  return {
    canChain,
    confidence,
    reason: canChain
      ? `Actions can be chained: ${containerAnalysis.reason}`
      : `Cannot chain: ${blockers.join(", ")}`,
    blockers: canChain ? undefined : blockers,
  }
}

/**
 * Identify chainable action groups from a plan step
 *
 * Analyzes the DOM and plan to identify clusters of actions that can
 * be executed together (e.g., filling multiple form fields).
 *
 * @param planStep - Current plan step description
 * @param dom - Current DOM state
 * @param query - User's original query
 * @returns Suggested action chains or empty if no chaining possible
 */
export function identifyChainableGroups(
  planStep: string,
  dom: string,
  query: string
): { canChain: boolean; reason: ChainReason | null; elementIds: number[] } {
  // Detect form-fill patterns
  const formFillPattern = /fill|enter|input|type|complete|form/i
  const isFormFillTask = formFillPattern.test(planStep) || formFillPattern.test(query)

  if (!isFormFillTask) {
    return { canChain: false, reason: null, elementIds: [] }
  }

  // Find form containers in DOM
  const formElements = extractFormElements(dom)

  if (formElements.length === 0) {
    return { canChain: false, reason: null, elementIds: [] }
  }

  // Group by form
  const groups = groupElementsByForm(formElements)

  // Find the largest group with input fields
  let bestGroup = { formId: "", elements: [] as DOMElementInfo[] }
  for (const [formId, elements] of Object.entries(groups)) {
    const inputs = elements.filter((e) => e.isInput || e.isSelect)
    if (inputs.length > bestGroup.elements.length) {
      bestGroup = { formId, elements: inputs }
    }
  }

  if (bestGroup.elements.length < MIN_CHAIN_SIZE) {
    return { canChain: false, reason: null, elementIds: [] }
  }

  // Limit to MAX_CHAIN_SIZE
  const chainableElements = bestGroup.elements.slice(0, MAX_CHAIN_SIZE)

  return {
    canChain: true,
    reason: "FORM_FILL",
    elementIds: chainableElements.map((e) => e.id),
  }
}

/**
 * Build chain metadata from actions
 */
export function buildChainMetadata(
  actions: ChainedAction[],
  reason: ChainReason,
  containerSelector?: string
): {
  totalActions: number
  estimatedDuration: number
  safeToChain: boolean
  chainReason: ChainReason
  containerSelector?: string
} {
  // Estimate duration: ~100ms per setValue, ~50ms per click
  const estimatedDuration = actions.reduce((total, action) => {
    const type = action.actionType || extractActionType(action.action)
    switch (type) {
      case "setValue":
      case "select":
        return total + 100
      case "click":
      case "check":
      case "uncheck":
        return total + 50
      case "wait": {
        // Extract wait duration if available
        const waitMatch = action.action.match(/wait\((\d+)\)/)
        const waitDuration = waitMatch?.[1]
        return total + (waitDuration ? parseInt(waitDuration, 10) : 100)
      }
      default:
        return total + 75
    }
  }, 0)

  return {
    totalActions: actions.length,
    estimatedDuration,
    safeToChain: true,
    chainReason: reason,
    containerSelector,
  }
}

// =============================================================================
// DOM Parsing Helpers
// =============================================================================

/**
 * Parse DOM to extract element information for given IDs
 */
function parseElementsFromDOM(dom: string, elementIds: number[]): DOMElementInfo[] {
  const elements: DOMElementInfo[] = []

  for (const id of elementIds) {
    // Look for element with this ID in simplified DOM format
    // Simplified DOM format: [id] tagName text...
    const idPattern = new RegExp(`\\[(${id})\\]\\s*(\\w+)(?:\\s+type="([^"]*)")?(?:\\s+name="([^"]*)")?`, "i")
    const match = dom.match(idPattern)

    if (match && match[2]) {
      const tagName = match[2].toLowerCase()
      const type = match[3] // optional, can be undefined
      const name = match[4] // optional, can be undefined

      elements.push({
        id,
        tagName,
        type,
        name,
        formId: extractFormIdFromContext(dom, id),
        isInput: tagName === "input" || tagName === "textarea",
        isButton: tagName === "button" || (tagName === "input" && (type === "submit" || type === "button")),
        isSelect: tagName === "select",
      })
    } else {
      // Element not found, add with minimal info
      elements.push({
        id,
        tagName: "unknown",
        isInput: false,
        isButton: false,
        isSelect: false,
      })
    }
  }

  return elements
}

/**
 * Extract form ID from DOM context for a given element
 */
function extractFormIdFromContext(dom: string, elementId: number): string | undefined {
  // Look for form context around the element
  // This is a heuristic - in practice, we'd need structured DOM parsing
  const beforeElement = dom.substring(0, dom.indexOf(`[${elementId}]`))
  
  // Find nearest form
  const formMatches = beforeElement.match(/\[(\d+)\]\s*form(?:\s+id="([^"]*)")?/gi)
  if (formMatches && formMatches.length > 0) {
    const lastForm = formMatches[formMatches.length - 1]
    if (lastForm) {
      const idMatch = lastForm.match(/\[(\d+)\]/)
      return idMatch?.[1]
    }
  }

  return undefined
}

/**
 * Extract form elements from DOM
 */
function extractFormElements(dom: string): DOMElementInfo[] {
  const elements: DOMElementInfo[] = []

  // Pattern to find input/select/textarea elements
  // Format: [id] tagName type="..." name="..."
  const inputPattern = /\[(\d+)\]\s*(input|select|textarea)(?:\s+type="([^"]*)")?(?:\s+name="([^"]*)")?/gi
  
  let match
  while ((match = inputPattern.exec(dom)) !== null) {
    const idStr = match[1]
    const tagNameStr = match[2]
    
    // Skip if required groups are missing
    if (!idStr || !tagNameStr) continue
    
    const id = parseInt(idStr, 10)
    const tagName = tagNameStr.toLowerCase()
    const type = match[3] // optional
    const name = match[4] // optional

    elements.push({
      id,
      tagName,
      type,
      name,
      formId: extractFormIdFromContext(dom, id),
      isInput: tagName === "input" || tagName === "textarea",
      isButton: tagName === "button" || (tagName === "input" && (type === "submit" || type === "button")),
      isSelect: tagName === "select",
    })
  }

  return elements
}

/**
 * Group elements by their form ID
 */
function groupElementsByForm(elements: DOMElementInfo[]): Record<string, DOMElementInfo[]> {
  const groups: Record<string, DOMElementInfo[]> = {}

  for (const element of elements) {
    const formId = element.formId || "_noform"
    if (!groups[formId]) {
      groups[formId] = []
    }
    groups[formId].push(element)
  }

  return groups
}

// =============================================================================
// Analysis Helpers
// =============================================================================

/**
 * Analyze if elements are in the same container
 */
function analyzeContainerRelationship(elements: DOMElementInfo[]): {
  isSameContainer: boolean
  reason: string
  containerSelector?: string
} {
  if (elements.length === 0) {
    return { isSameContainer: false, reason: "No elements found" }
  }

  // Check if all elements have the same form ID
  const formIds = new Set(elements.map((e) => e.formId).filter(Boolean))

  if (formIds.size === 1) {
    const formId = Array.from(formIds)[0]
    return {
      isSameContainer: true,
      reason: `All elements in form ${formId}`,
      containerSelector: `form#${formId}`,
    }
  }

  if (formIds.size === 0) {
    // No form context - check if all are inputs (likely same form without ID)
    const allInputs = elements.every((e) => e.isInput || e.isSelect)
    if (allInputs) {
      return {
        isSameContainer: true,
        reason: "All elements are input fields",
      }
    }
  }

  return {
    isSameContainer: false,
    reason: `Elements spread across ${formIds.size} containers`,
  }
}

/**
 * Analyze action type consistency
 */
function analyzeActionTypeConsistency(actionTypes: ChainableActionType[]): {
  isConsistent: boolean
  reason: string
} {
  if (actionTypes.length === 0) {
    return { isConsistent: false, reason: "No action types found" }
  }

  // Group compatible action types
  const inputTypes = new Set(["setValue", "select", "check", "uncheck"])
  const navigationTypes = new Set(["click"])
  const passiveTypes = new Set(["focus", "blur", "hover", "scroll", "wait"])

  const hasInput = actionTypes.some((t) => inputTypes.has(t))
  const hasNavigation = actionTypes.some((t) => navigationTypes.has(t))
  const hasPassive = actionTypes.some((t) => passiveTypes.has(t))

  // Input + passive is OK (e.g., setValue followed by blur)
  // Input + click at end is OK (e.g., fill form then click submit) - but we handle submit separately
  // Mixed navigation types are problematic

  if (hasInput && !hasNavigation) {
    return { isConsistent: true, reason: "Input actions only" }
  }

  if (hasInput && hasNavigation && actionTypes.indexOf("click") === actionTypes.length - 1) {
    // Click only at the end might be OK (form submit)
    // But we're conservative here
    return { isConsistent: false, reason: "Click action may trigger navigation" }
  }

  if (!hasInput && hasNavigation) {
    return { isConsistent: false, reason: "Click actions should not be chained" }
  }

  return { isConsistent: true, reason: "Compatible action types" }
}

/**
 * Calculate overall chain confidence
 */
function calculateChainConfidence(factors: {
  containerAnalysis: { isSameContainer: boolean }
  typeConsistency: { isConsistent: boolean }
  actionCount: number
}): number {
  let confidence = 1.0

  // Container relationship is critical
  if (!factors.containerAnalysis.isSameContainer) {
    confidence *= 0.3
  }

  // Type consistency is important
  if (!factors.typeConsistency.isConsistent) {
    confidence *= 0.4
  }

  // More actions = slightly lower confidence (more can go wrong)
  if (factors.actionCount > 5) {
    confidence *= 0.9
  }
  if (factors.actionCount > 8) {
    confidence *= 0.85
  }

  return Math.max(0, Math.min(1, confidence))
}

// =============================================================================
// Exports
// =============================================================================

export {
  MAX_CHAIN_SIZE,
  MIN_CHAIN_SIZE,
  CHAIN_CONFIDENCE_THRESHOLD,
}
