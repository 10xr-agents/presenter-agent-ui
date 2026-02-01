/**
 * Action-Type Classification
 *
 * Classifies actions (e.g. click, navigate) into behavior types so that
 * outcome prediction and verification can use action-type–specific rules.
 * This prevents over-specific checks (e.g. elementShouldNotExist for
 * dropdowns) and false verification failures.
 *
 * Used by: Outcome Prediction Engine, Verification Engine.
 *
 * Uses deterministic string parsing (no regex) for predictable behavior.
 */

import {
  extractClickElementId,
  extractTagName,
  findElementById,
  hasNavigationIndicator,
  hasPopupIndicator,
} from "./action-parser"

export type ActionType = "dropdown" | "navigation" | "generic"

/**
 * Classify action type from action string and DOM.
 * Uses deterministic string parsing (no regex).
 *
 * - dropdown: click on element with aria-haspopup or data-has-popup
 * - navigation: navigate(...), goBack(...), OR click on <a> tags / nav links / tab buttons
 * - generic: everything else (click without popup, setValue, etc.)
 */
export function classifyActionType(action: string, dom: string): ActionType {
  const t = action.trim().toLowerCase()

  // Explicit navigation commands (deterministic string checks)
  if (t.startsWith("navigate(") || t.startsWith("goback(")) {
    return "navigation"
  }

  // Check if this is a click action
  const elementId = extractClickElementId(action)
  if (elementId) {
    // Find the element in the DOM using deterministic parsing
    const elementTag = findElementById(dom, elementId)

    if (elementTag) {
      // Check for dropdown/popup indicators
      if (hasPopupIndicator(elementTag)) {
        return "dropdown"
      }

      // Check for navigation indicators (links, tabs, etc.)
      if (hasNavigationIndicator(elementTag)) {
        return "navigation"
      }
    }

    // Fallback: check tag name even if full tag wasn't found
    // Sometimes the DOM structure makes it hard to capture the full tag
    const tagName = elementTag ? extractTagName(elementTag) : undefined
    if (tagName === "a") {
      return "navigation"
    }
  }

  return "generic"
}
