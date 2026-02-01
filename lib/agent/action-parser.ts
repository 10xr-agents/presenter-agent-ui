/**
 * Action Parser Utilities
 *
 * Deterministic string parsing for action strings (no regex).
 * Used to extract structured data from action strings like finish("message").
 *
 * All functions use simple string operations (indexOf, slice, startsWith, etc.)
 * for predictable, debuggable behavior.
 */

/**
 * Extract the action name from an action string.
 * Uses simple string operations for deterministic behavior.
 *
 * @param action - The action string (e.g., 'click(123)', 'setValue(42, "text")')
 * @returns The action name, or undefined if invalid format
 *
 * @example
 * extractActionName('click(123)') // "click"
 * extractActionName('setValue(42, "text")') // "setValue"
 * extractActionName('invalid') // undefined
 */
export function extractActionName(action: string): string | undefined {
  const trimmed = action.trim()
  const parenIndex = trimmed.indexOf("(")

  if (parenIndex <= 0) {
    return undefined
  }

  const name = trimmed.slice(0, parenIndex)

  // Verify it's a valid identifier (letters only)
  for (let i = 0; i < name.length; i++) {
    const char = name[i]!
    if (!((char >= "a" && char <= "z") || (char >= "A" && char <= "Z"))) {
      return undefined
    }
  }

  return name
}

/**
 * Extract the element ID from a click action.
 * Uses simple string operations for deterministic behavior.
 *
 * @param action - The action string (e.g., 'click(123)')
 * @returns The element ID as string, or null if not a valid click action
 *
 * @example
 * extractClickElementId('click(123)') // "123"
 * extractClickElementId('click(abc)') // "abc"
 * extractClickElementId('setValue(123, "x")') // null
 */
export function extractClickElementId(action: string): string | null {
  const trimmed = action.trim()

  if (!trimmed.startsWith("click(") || !trimmed.endsWith(")")) {
    return null
  }

  // Extract content between click( and )
  const inner = trimmed.slice(6, -1).trim()

  if (!inner) {
    return null
  }

  // For click, we expect a simple value (no quotes, no commas for basic case)
  // Handle potential coordinate case: click(123, 10, 20)
  const commaIndex = inner.indexOf(",")
  if (commaIndex > 0) {
    return inner.slice(0, commaIndex).trim()
  }

  return inner
}

/**
 * Extract parameters from a setValue action.
 * Uses simple string operations for deterministic behavior.
 *
 * @param action - The action string (e.g., 'setValue(42, "Hello World")')
 * @returns Object with elementId and text, or null if not valid
 *
 * @example
 * extractSetValueParams('setValue(42, "Hello")') // { elementId: "42", text: "Hello" }
 * extractSetValueParams('setValue(42, "Text with (parens)")') // { elementId: "42", text: "Text with (parens)" }
 * extractSetValueParams('click(123)') // null
 */
export function extractSetValueParams(action: string): { elementId: string; text: string } | null {
  const trimmed = action.trim()

  if (!trimmed.startsWith("setValue(") || !trimmed.endsWith(")")) {
    return null
  }

  // Extract content between setValue( and )
  const inner = trimmed.slice(9, -1).trim()

  // Find the comma separating elementId from the quoted text
  const commaIndex = inner.indexOf(",")
  if (commaIndex <= 0) {
    return null
  }

  const elementId = inner.slice(0, commaIndex).trim()
  const rest = inner.slice(commaIndex + 1).trim()

  // Rest should be a quoted string (with optional third parameter)
  if (!rest.startsWith('"')) {
    return null
  }

  // Parse the quoted string
  let i = 1
  let text = ""

  while (i < rest.length) {
    const char = rest[i]

    // Handle escape sequences
    if (char === "\\" && i + 1 < rest.length) {
      const nextChar = rest[i + 1]
      if (nextChar === "n") {
        text += "\n"
      } else if (nextChar === "t") {
        text += "\t"
      } else if (nextChar === "r") {
        text += "\r"
      } else {
        text += nextChar
      }
      i += 2
      continue
    }

    // Found closing quote
    if (char === '"') {
      return { elementId, text }
    }

    text += char
    i++
  }

  return null
}

// NOTE: XML tag parsing (parseXmlTag, parseActionResponse) has been removed.
// The codebase uses Gemini's structured output with responseJsonSchema which returns
// JSON directly (e.g., { thought, action }). No XML parsing is needed.
// See: lib/llm/response-schemas.ts for ACTION_RESPONSE_SCHEMA and other schemas.
// See: docs/GEMINI_USAGE.md for structured output documentation.

// ============================================================================
// DOM Parsing Utilities (Deterministic)
// ============================================================================

/**
 * Find an HTML element by its id attribute in a DOM string.
 * Returns the full opening tag of the element.
 * Uses deterministic string search.
 *
 * @param dom - The DOM string to search
 * @param elementId - The element ID to find
 * @returns The opening tag string, or undefined if not found
 *
 * @example
 * findElementById('<div id="123" class="btn">Click</div>', '123')
 * // Returns: '<div id="123" class="btn">'
 */
export function findElementById(dom: string, elementId: string): string | undefined {
  // Search for id="elementId", id='elementId', or id=elementId patterns
  const patterns = [`id="${elementId}"`, `id='${elementId}'`, `id=${elementId} `, `id=${elementId}>`]

  for (const pattern of patterns) {
    const idIndex = dom.indexOf(pattern)
    if (idIndex === -1) continue

    // Find the opening < before this id
    let tagStart = idIndex
    while (tagStart > 0 && dom[tagStart] !== "<") {
      tagStart--
    }

    if (dom[tagStart] !== "<") continue

    // Find the closing > after the id
    let tagEnd = idIndex + pattern.length
    while (tagEnd < dom.length && dom[tagEnd] !== ">") {
      tagEnd++
    }

    if (tagEnd >= dom.length) continue

    return dom.slice(tagStart, tagEnd + 1)
  }

  return undefined
}

/**
 * Extract the tag name from an HTML opening tag.
 *
 * @param tag - The opening tag string (e.g., '<div id="123">')
 * @returns The tag name in lowercase, or undefined if invalid
 */
export function extractTagName(tag: string): string | undefined {
  if (!tag.startsWith("<")) return undefined

  let i = 1
  let name = ""

  // Skip whitespace after <
  while (i < tag.length && (tag[i] === " " || tag[i] === "\t" || tag[i] === "\n")) {
    i++
  }

  // Extract tag name (letters, numbers, hyphens)
  while (i < tag.length) {
    const char = tag[i]!
    if (
      (char >= "a" && char <= "z") ||
      (char >= "A" && char <= "Z") ||
      (char >= "0" && char <= "9") ||
      char === "-"
    ) {
      name += char
      i++
    } else {
      break
    }
  }

  return name.length > 0 ? name.toLowerCase() : undefined
}

/**
 * Check if an HTML tag contains a specific attribute.
 * Case-insensitive attribute name matching.
 *
 * @param tag - The HTML tag string
 * @param attrName - The attribute name to check for
 * @returns True if the attribute exists
 */
export function hasAttribute(tag: string, attrName: string): boolean {
  const lowerTag = tag.toLowerCase()
  const lowerAttr = attrName.toLowerCase()

  // Check for attr=" or attr=' or attr= (followed by space or >)
  return (
    lowerTag.includes(` ${lowerAttr}="`) ||
    lowerTag.includes(` ${lowerAttr}='`) ||
    lowerTag.includes(` ${lowerAttr}=`) ||
    lowerTag.includes(` ${lowerAttr} `) ||
    lowerTag.includes(` ${lowerAttr}>`)
  )
}

/**
 * Get the value of an attribute from an HTML tag.
 * Returns undefined if attribute not found.
 *
 * @param tag - The HTML tag string
 * @param attrName - The attribute name
 * @returns The attribute value, or undefined
 */
export function getAttributeValue(tag: string, attrName: string): string | undefined {
  const lowerTag = tag.toLowerCase()
  const lowerAttr = attrName.toLowerCase()

  // Try attr="value"
  let searchStr = ` ${lowerAttr}="`
  let idx = lowerTag.indexOf(searchStr)
  if (idx !== -1) {
    const valueStart = idx + searchStr.length
    const valueEnd = tag.indexOf('"', valueStart)
    if (valueEnd !== -1) {
      return tag.slice(valueStart, valueEnd)
    }
  }

  // Try attr='value'
  searchStr = ` ${lowerAttr}='`
  idx = lowerTag.indexOf(searchStr)
  if (idx !== -1) {
    const valueStart = idx + searchStr.length
    const valueEnd = tag.indexOf("'", valueStart)
    if (valueEnd !== -1) {
      return tag.slice(valueStart, valueEnd)
    }
  }

  // Try attr=value (unquoted)
  searchStr = ` ${lowerAttr}=`
  idx = lowerTag.indexOf(searchStr)
  if (idx !== -1) {
    const valueStart = idx + searchStr.length
    // Unquoted value ends at space or >
    let valueEnd = valueStart
    while (valueEnd < tag.length && tag[valueEnd] !== " " && tag[valueEnd] !== ">") {
      valueEnd++
    }
    if (valueEnd > valueStart) {
      return tag.slice(valueStart, valueEnd)
    }
  }

  return undefined
}

/**
 * Check if an attribute value matches a pattern (case-insensitive contains check).
 *
 * @param tag - The HTML tag string
 * @param attrName - The attribute name
 * @param valuePattern - The value pattern to check (simple substring match)
 * @returns True if the attribute exists and contains the pattern
 */
export function attributeContains(tag: string, attrName: string, valuePattern: string): boolean {
  const value = getAttributeValue(tag, attrName)
  if (!value) return false
  return value.toLowerCase().includes(valuePattern.toLowerCase())
}

/**
 * Check if element has popup/dropdown indicators.
 */
export function hasPopupIndicator(tag: string): boolean {
  return hasAttribute(tag, "aria-haspopup") || hasAttribute(tag, "data-has-popup")
}

/**
 * Check if element has navigation indicators (link, tab, etc.).
 */
export function hasNavigationIndicator(tag: string): boolean {
  const tagName = extractTagName(tag)

  // <a> tags are navigation
  if (tagName === "a") return true

  // href attribute indicates navigation
  if (hasAttribute(tag, "href")) return true

  // role="link" or role="tab"
  const role = getAttributeValue(tag, "role")
  if (role && (role.toLowerCase() === "link" || role.toLowerCase() === "tab")) return true

  // Tab-related attributes
  if (hasAttribute(tag, "data-tab")) return true
  if (hasAttribute(tag, "data-tab-value")) return true

  // data-state with active/inactive (tab indicator)
  const dataState = getAttributeValue(tag, "data-state")
  if (dataState && (dataState.toLowerCase() === "active" || dataState.toLowerCase() === "inactive")) {
    return true
  }

  // aria-selected (tab indicator)
  if (hasAttribute(tag, "aria-selected")) return true

  return false
}

/**
 * Parse a finish action and extract the message.
 * Uses simple string operations for deterministic behavior.
 *
 * @param action - The action string (e.g., 'finish("Hello world")')
 * @returns The extracted message, or undefined if not a valid finish with message
 *
 * @example
 * parseFinishMessage('finish("Hello")') // "Hello"
 * parseFinishMessage('finish("Text with (parentheses)")') // "Text with (parentheses)"
 * parseFinishMessage('finish()') // undefined
 * parseFinishMessage('click(123)') // undefined
 */
export function parseFinishMessage(action: string): string | undefined {
  // Must start with finish( and end with )
  if (!action.startsWith("finish(") || !action.endsWith(")")) {
    return undefined
  }

  // Extract content between finish( and )
  const inner = action.slice(7, -1).trim() // Remove 'finish(' and ')'

  // Must start with a quote to be a message
  if (!inner || !inner.startsWith('"')) {
    return undefined
  }

  // Parse the quoted string, handling escape sequences
  let i = 1 // Start after opening quote
  let message = ""

  while (i < inner.length) {
    const char = inner[i]

    // Handle escape sequences
    if (char === "\\" && i + 1 < inner.length) {
      const nextChar = inner[i + 1]
      // Common escape sequences
      if (nextChar === "n") {
        message += "\n"
      } else if (nextChar === "t") {
        message += "\t"
      } else if (nextChar === "r") {
        message += "\r"
      } else {
        // For \\, \", etc. - just take the escaped character
        message += nextChar
      }
      i += 2
      continue
    }

    // Found closing quote
    if (char === '"') {
      return message
    }

    // Regular character
    message += char
    i++
  }

  // No closing quote found - invalid format
  return undefined
}

/**
 * Parse a fail action and extract the reason.
 * Uses simple string operations for deterministic behavior.
 *
 * @param action - The action string (e.g., 'fail("Element not found")')
 * @returns The extracted reason, or undefined if not a valid fail with message
 */
export function parseFailMessage(action: string): string | undefined {
  // Must start with fail( and end with )
  if (!action.startsWith("fail(") || !action.endsWith(")")) {
    return undefined
  }

  // Extract content between fail( and )
  const inner = action.slice(5, -1).trim() // Remove 'fail(' and ')'

  // Must start with a quote to be a message
  if (!inner || !inner.startsWith('"')) {
    return undefined
  }

  // Parse the quoted string, handling escape sequences
  let i = 1 // Start after opening quote
  let message = ""

  while (i < inner.length) {
    const char = inner[i]

    // Handle escape sequences
    if (char === "\\" && i + 1 < inner.length) {
      const nextChar = inner[i + 1]
      if (nextChar === "n") {
        message += "\n"
      } else if (nextChar === "t") {
        message += "\t"
      } else if (nextChar === "r") {
        message += "\r"
      } else {
        message += nextChar
      }
      i += 2
      continue
    }

    // Found closing quote
    if (char === '"') {
      return message
    }

    // Regular character
    message += char
    i++
  }

  // No closing quote found
  return undefined
}

/**
 * Check if an action is a terminal action (finish or fail).
 */
export function isTerminalAction(action: string): boolean {
  return action.startsWith("finish(") || action.startsWith("fail(")
}

/**
 * Build a finish action string from a message.
 * Properly escapes special characters.
 *
 * @param message - The message to include in the finish action
 * @returns The complete finish action string
 */
export function buildFinishAction(message?: string): string {
  if (!message) {
    return "finish()"
  }

  // Escape special characters in the message
  const escaped = message
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/"/g, '\\"') // Escape quotes
    .replace(/\n/g, "\\n") // Escape newlines
    .replace(/\r/g, "\\r") // Escape carriage returns
    .replace(/\t/g, "\\t") // Escape tabs

  return `finish("${escaped}")`
}
