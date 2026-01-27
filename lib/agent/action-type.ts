/**
 * Action-Type Classification
 *
 * Classifies actions (e.g. click, navigate) into behavior types so that
 * outcome prediction and verification can use action-type–specific rules.
 * This prevents over-specific checks (e.g. elementShouldNotExist for
 * dropdowns) and false verification failures.
 *
 * Used by: Outcome Prediction Engine, Verification Engine.
 */

export type ActionType = "dropdown" | "navigation" | "generic"

/**
 * Classify action type from action string and DOM.
 *
 * - dropdown: click on element with aria-haspopup or data-has-popup
 * - navigation: navigate(...), goBack(...)
 * - generic: everything else (click without popup, setValue, etc.)
 */
export function classifyActionType(action: string, dom: string): ActionType {
  const t = action.trim()

  if (/^navigate\(/i.test(t) || /^goBack\s*\(\s*\)/i.test(t)) {
    return "navigation"
  }

  const clickMatch = t.match(/^click\s*\(\s*(\d+)\s*\)\s*$/)
  if (clickMatch) {
    const elementId = clickMatch[1]
    const elementRegex = new RegExp(`id=["']?${elementId}["']?[^>]*>`, "i")
    const elementMatch = dom.match(elementRegex)
    if (elementMatch) {
      const elementHtml = elementMatch[0]
      const hasPopup =
        /aria-haspopup=["']?[^"'\s>]+["']?/i.test(elementHtml) ||
        /data-has-popup=["']?[^"'\s>]+["']?/i.test(elementHtml)
      if (hasPopup) return "dropdown"
    }
  }

  return "generic"
}
