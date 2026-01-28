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
 * - navigation: navigate(...), goBack(...), OR click on <a> tags / nav links
 * - generic: everything else (click without popup, setValue, etc.)
 */
export function classifyActionType(action: string, dom: string): ActionType {
  const t = action.trim()

  // Explicit navigation commands
  if (/^navigate\(/i.test(t) || /^goBack\s*\(\s*\)/i.test(t)) {
    return "navigation"
  }

  const clickMatch = t.match(/^click\s*\(\s*(\d+)\s*\)\s*$/)
  if (clickMatch) {
    const elementId = clickMatch[1]
    
    // Try to find the element in the DOM
    // Match patterns like: id="123" or id='123' or id=123
    const elementRegex = new RegExp(`id=["']?${elementId}["']?[^>]*>`, "i")
    const elementMatch = dom.match(elementRegex)
    
    if (elementMatch) {
      const elementHtml = elementMatch[0]
      
      // Check for dropdown/popup indicators
      const hasPopup =
        /aria-haspopup=["']?[^"'\s>]+["']?/i.test(elementHtml) ||
        /data-has-popup=["']?[^"'\s>]+["']?/i.test(elementHtml)
      if (hasPopup) return "dropdown"
      
      // Check for navigation indicators:
      // 1. Element is an <a> tag (anchor link)
      // 2. Element has href attribute
      // 3. Element has role="link"
      // 4. Element is inside a <nav> element (we check if parent context suggests navigation)
      const isAnchorTag = elementMatch[0].toLowerCase().startsWith("<a ")
      const hasHref = /href=["']?[^"'\s>]+["']?/i.test(elementHtml)
      const hasRoleLink = /role=["']?link["']?/i.test(elementHtml)
      
      if (isAnchorTag || hasHref || hasRoleLink) {
        return "navigation"
      }
    }
    
    // Additional check: Look for the element by expanding the regex to capture the tag name
    const tagRegex = new RegExp(`<(\\w+)[^>]*id=["']?${elementId}["']?[^>]*>`, "i")
    const tagMatch = dom.match(tagRegex)
    if (tagMatch) {
      const tagName = tagMatch[1]?.toLowerCase()
      // <a> tags are navigation
      if (tagName === "a") {
        return "navigation"
      }
    }
  }

  return "generic"
}
