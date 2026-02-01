/**
 * DOM Element Mapping
 *
 * Extracts elementId → selectorPath mapping from DOM for robust element finding.
 * Used to provide fallback selectors when element IDs become stale on dynamic sites.
 *
 * @see docs/ROBUST_ELEMENT_SELECTORS_SPEC.md
 */

// NOTE: element-id parsing must support string ids (e.g., "f1_5") for iframe extraction.
// Use deterministic parsers from action-parser (no regex scraping of IDs).
import { extractActionName, extractClickElementId, extractSetValueParams } from "./action-parser"

/**
 * Element mapping entry with selector path and metadata
 */
export interface ElementMapping {
  /** Element id as sent by the client (string in semantic protocols; may be numeric string or prefixed like "f1_5"). */
  id: string
  selectorPath: string | null
  tag?: string
  name?: string
  ariaLabel?: string
  placeholder?: string
}

/**
 * Map of elementId to ElementMapping
 */
export type ElementMap = Map<string, ElementMapping>

/**
 * Extract element mapping from semantic V3 interactiveTree.
 *
 * NOTE: V3 uses string IDs (field `i`) in the payload, but the action contract
 * still uses numeric ids in click(123)/setValue(123,"...") in this backend.
 * We therefore only include nodes whose `i` parses to a positive integer.
 */
export function extractElementMappingFromInteractiveTree(
  interactiveTree: Array<{
    i: string
    r: string
    n: string
  }>
): ElementMap {
  const map: ElementMap = new Map()

  if (!Array.isArray(interactiveTree) || interactiveTree.length === 0) {
    return map
  }

  // Minimal role → tag mapping for debugging / selector fallback heuristics
  const roleToTag: Record<string, string> = {
    btn: "button",
    button: "button",
    inp: "input",
    input: "input",
    textbox: "input",
    searchbox: "input",
    textarea: "textarea",
    link: "a",
    chk: "input",
    checkbox: "input",
    radio: "input",
    sel: "select",
    select: "select",
    opt: "option",
    option: "option",
    switch: "button",
    tab: "button",
    menu: "button",
  }

  for (const node of interactiveTree) {
    const id = (node.i ?? "").trim()
    if (!id) continue

    const tag = roleToTag[node.r] ?? undefined
    map.set(id, {
      id,
      selectorPath: null,
      tag,
      name: node.n ?? undefined,
      ariaLabel: node.n ?? undefined,
    })
  }

  if (process.env.NODE_ENV === "development") {
    console.log(
      `[dom-element-mapping] extractElementMappingFromInteractiveTree: Extracted ${map.size} elements`
    )
    if (map.size > 0) {
      const first5 = Array.from(map.entries()).slice(0, 5)
      first5.forEach(([id, el]) => {
        console.log(
          `[dom-element-mapping] Element ${id}: tag=${el.tag}, name=${el.name ?? "null"}, selectorPath=${el.selectorPath ?? "null"}`
        )
      })
    }
  }

  return map
}

/**
 * Extract element mapping from DOM string.
 *
 * The extension sends DOM in a templatized format:
 *   [id] tagName attr="value" attr="value"
 * Example:
 *   [6] textarea type="search" name="q" aria-label="Search"
 *
 * @param dom - The DOM string from the extension (templatized format)
 * @returns Map of elementId to ElementMapping
 */
export function extractElementMapping(dom: string): ElementMap {
  const map: ElementMap = new Map()

  if (!dom || typeof dom !== "string") {
    return map
  }

  // Primary pattern: Templatized DOM format [id] tagName ...
  // Matches: [6] textarea type="search" name="q" aria-label="Search"
  const templatizedPattern = /\[(\d+)\]\s*([a-zA-Z][a-zA-Z0-9]*)\s*([^\n\[]*)/g

  let match: RegExpExecArray | null
  while ((match = templatizedPattern.exec(dom)) !== null) {
    const idStr = match[1] ?? ""
    const tag = match[2]?.toLowerCase()
    const attrsStr = match[3] ?? ""
    const id = idStr.trim()
    if (!id || !tag) continue

    // Extract attributes from the rest of the line
    const nameMatch = attrsStr.match(/\bname="([^"]+)"/)
    const ariaLabelMatch = attrsStr.match(/\baria-label="([^"]+)"/i)
    const placeholderMatch = attrsStr.match(/\bplaceholder="([^"]+)"/)
    const typeMatch = attrsStr.match(/\btype="([^"]+)"/)
    const testIdMatch = attrsStr.match(/\bdata-testid="([^"]+)"/)
    const selectorPathMatch = attrsStr.match(/\bdata-selector-path="([^"]+)"/)

    // Build selectorPath from explicit attribute or generate from available data
    let selectorPath: string | null = null
    if (selectorPathMatch?.[1]) {
      selectorPath = decodeHtmlEntities(selectorPathMatch[1])
    }

    map.set(id, {
      id,
      selectorPath,
      tag,
      name: nameMatch?.[1],
      ariaLabel: ariaLabelMatch?.[1],
      placeholder: placeholderMatch?.[1],
    })

    // Store additional metadata for later selector generation
    const element = map.get(id)
    if (element) {
      // Store type and testId for enhanced selector generation
      ;(element as ElementMapping & { type?: string; testId?: string }).type = typeMatch?.[1]
      ;(element as ElementMapping & { type?: string; testId?: string }).testId = testIdMatch?.[1]
    }
  }

  // Fallback: Also try HTML format with data-element-id (for compatibility)
  if (map.size === 0) {
    const htmlPattern = /<([a-zA-Z][a-zA-Z0-9]*)[^>]*\bdata-element-id="([^"]+)"[^>]*>/gi
    while ((match = htmlPattern.exec(dom)) !== null) {
      const fullMatch = match[0]
      const tag = match[1]?.toLowerCase()
      const idStr = match[2] ?? ""
      const id = idStr.trim()
      if (!id) continue

      const selectorPathMatch = fullMatch.match(/data-selector-path="([^"]+)"/)
      const selectorPath = selectorPathMatch?.[1] ?? null
      const nameMatch = fullMatch.match(/\bname="([^"]+)"/)
      const ariaLabelMatch = fullMatch.match(/aria-label="([^"]+)"/)
      const placeholderMatch = fullMatch.match(/placeholder="([^"]+)"/)

      map.set(id, {
        id,
        selectorPath: selectorPath ? decodeHtmlEntities(selectorPath) : null,
        tag,
        name: nameMatch?.[1],
        ariaLabel: ariaLabelMatch?.[1],
        placeholder: placeholderMatch?.[1],
      })
    }
  }

  // Debug: Log extraction stats
  if (process.env.NODE_ENV === "development") {
    console.log(`[dom-element-mapping] extractElementMapping: Extracted ${map.size} elements from ${dom.length} chars`)
    if (map.size > 0) {
      // Log first few elements to verify extraction
      const first5 = Array.from(map.entries()).slice(0, 5)
      first5.forEach(([id, el]) => {
        console.log(`[dom-element-mapping] Element ${id}: tag=${el.tag}, name=${el.name ?? "null"}, ariaLabel=${el.ariaLabel ?? "null"}`)
      })
      
      // Log search-related elements (textarea, input with name containing 'q' or 'search')
      const searchElements = Array.from(map.entries()).filter(([, el]) => {
        const isTextarea = el.tag === "textarea"
        const isSearchInput = el.tag === "input" && (el.name === "q" || el.name === "search" || el.name?.includes("query"))
        const hasSearchLabel = el.ariaLabel?.toLowerCase().includes("search")
        return isTextarea || isSearchInput || hasSearchLabel
      })
      if (searchElements.length > 0) {
        console.log(`[dom-element-mapping] Search-related elements found:`)
        searchElements.forEach(([id, el]) => {
          const ext = el as ElementMapping & { type?: string }
          console.log(`[dom-element-mapping]   ID ${id}: tag=${el.tag}, name=${el.name ?? "null"}, ariaLabel=${el.ariaLabel ?? "null"}, type=${ext.type ?? "null"}`)
        })
      }
    }
  }

  return map
}

/**
 * Extract element mapping from skeleton DOM.
 *
 * Skeleton DOM has a simpler format with id="N" attributes.
 * Also looks for data-selector-path attributes.
 *
 * @param skeletonDom - The skeleton DOM string
 * @returns Map of elementId to ElementMapping
 */
export function extractElementMappingFromSkeleton(skeletonDom: string): ElementMap {
  const map: ElementMap = new Map()

  if (!skeletonDom || typeof skeletonDom !== "string") {
    return map
  }

  // Pattern for skeleton DOM format: <tag id="N" ...>
  const skeletonPattern = /<([a-zA-Z][a-zA-Z0-9]*)[^>]*\bid="([^"]+)"[^>]*>/gi

  let match: RegExpExecArray | null
  while ((match = skeletonPattern.exec(skeletonDom)) !== null) {
    const fullMatch = match[0]
    const tag = match[1]?.toLowerCase()
    const idStr = match[2] ?? ""
    const id = idStr.trim()
    if (!id) continue

    // Extract data-selector-path if present
    const selectorPathMatch = fullMatch.match(/data-selector-path="([^"]+)"/)
    const selectorPath = selectorPathMatch?.[1] ?? null

    // Extract additional attributes
    const nameMatch = fullMatch.match(/\bname="([^"]+)"/)
    const ariaLabelMatch = fullMatch.match(/aria-label="([^"]+)"/)
    const placeholderMatch = fullMatch.match(/placeholder="([^"]+)"/)

    map.set(id, {
      id,
      selectorPath: selectorPath ? decodeHtmlEntities(selectorPath) : null,
      tag,
      name: nameMatch?.[1],
      ariaLabel: ariaLabelMatch?.[1],
      placeholder: placeholderMatch?.[1],
    })
  }

  // Debug: Log extraction stats
  if (process.env.NODE_ENV === "development") {
    console.log(`[dom-element-mapping] extractElementMappingFromSkeleton: Extracted ${map.size} elements`)
    if (map.size > 0) {
      // Log first few elements to verify extraction
      const first5 = Array.from(map.entries()).slice(0, 5)
      first5.forEach(([id, el]) => {
        console.log(`[dom-element-mapping] Element ${id}: tag=${el.tag}, name=${el.name ?? "null"}, selectorPath=${el.selectorPath ?? "null"}`)
      })
    }
  }

  return map
}

/**
 * Get selectorPath for an element ID from the mapping.
 *
 * If no explicit selectorPath exists, attempts to generate one from
 * available attributes (name, aria-label, placeholder).
 *
 * @param elementId - The element ID to look up
 * @param elementMap - The element mapping
 * @returns selectorPath or null if not available
 */
export function getSelectorPath(elementId: string, elementMap: ElementMap): string | null {
  const element = elementMap.get(elementId)
  if (!element) return null

  // Return explicit selectorPath if available
  if (element.selectorPath) {
    return element.selectorPath
  }

  // Generate fallback selector from attributes
  return generateFallbackSelector(element)
}

/**
 * Extended element mapping with additional metadata for selector generation
 */
interface ExtendedElementMapping extends ElementMapping {
  type?: string
  testId?: string
}

/**
 * Generate a fallback CSS selector from element attributes.
 *
 * Priority:
 * 1. data-testid (explicit test selector, most reliable)
 * 2. name attribute (most stable for forms)
 * 3. aria-label (accessible and usually stable)
 * 4. placeholder (for inputs)
 * 5. type + tag combination (as last resort)
 *
 * @param element - The element mapping entry
 * @returns Generated selector or null
 */
function generateFallbackSelector(element: ElementMapping): string | null {
  const { tag, name, ariaLabel, placeholder } = element
  const ext = element as ExtendedElementMapping

  // Priority 1: data-testid (explicit test selector, most reliable)
  if (ext.testId && tag) {
    return `${tag}[data-testid="${escapeSelector(ext.testId)}"]`
  }

  // Priority 2: name attribute (most stable for forms)
  if (name && tag) {
    return `${tag}[name="${escapeSelector(name)}"]`
  }

  // Priority 3: aria-label (accessible and usually stable)
  if (ariaLabel && tag) {
    return `${tag}[aria-label="${escapeSelector(ariaLabel)}"]`
  }

  // Priority 4: placeholder (for inputs)
  if (placeholder && tag) {
    return `${tag}[placeholder="${escapeSelector(placeholder)}"]`
  }

  // Priority 5: type + tag for unique inputs (e.g., input[type="email"])
  if (ext.type && tag && ["email", "password", "tel", "search", "url"].includes(ext.type)) {
    return `${tag}[type="${escapeSelector(ext.type)}"]`
  }

  return null
}

/**
 * Escape special characters in CSS selector values
 */
function escapeSelector(value: string): string {
  return value.replace(/["\\]/g, "\\$&")
}

/**
 * Decode HTML entities in attribute values
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Parse action string to extract action name and element ID.
 *
 * Examples:
 * - "click(13)" → { name: "click", elementId: 13 }
 * - "setValue(42, \"hello\")" → { name: "setValue", elementId: 42, args: { value: "hello" } }
 * - "navigate(\"https://...\")" → { name: "navigate", elementId: undefined }
 *
 * @param action - The action string
 * @returns Parsed action details
 */
export function parseActionForDetails(action: string): {
  name: string
  elementId?: string
  args?: Record<string, unknown>
} | null {
  if (!action || typeof action !== "string") {
    return null
  }

  const trimmed = action.trim()

  // Extract action name using deterministic parsing
  const name = extractActionName(trimmed)
  if (!name) return null

  // Element-id parsing: use deterministic helpers for click/setValue.
  if (name === "click") {
    const raw = extractClickElementId(trimmed)
    const elementId = raw ? raw.replace(/^"(.+)"$/, "$1").trim() : undefined
    return { name, ...(elementId ? { elementId } : {}) }
  }

  if (name === "setValue") {
    const parsed = extractSetValueParams(trimmed)
    if (!parsed) return { name }
    const elementId = parsed.elementId.replace(/^"(.+)"$/, "$1").trim()
    const args: Record<string, unknown> = { value: parsed.text }
    return { name, ...(elementId ? { elementId } : {}), args }
  }

  // Other actions: we do not reliably parse ids here (varied parameter shapes).
  return { name }
}

/**
 * Build actionDetails object for API response.
 *
 * @param action - The action string
 * @param elementMap - The element mapping
 * @returns ActionDetails object or undefined if not applicable
 */
export function buildActionDetails(
  action: string | undefined,
  elementMap: ElementMap
): {
  name: string
  elementId?: string
  selectorPath?: string
  args?: Record<string, unknown>
} | undefined {
  if (!action) return undefined

  const parsed = parseActionForDetails(action)
  if (!parsed) return undefined

  const { name, elementId, args } = parsed

  // Get selectorPath if we have an element ID
  let selectorPath: string | undefined
  if (elementId !== undefined) {
    selectorPath = getSelectorPath(elementId, elementMap) ?? undefined

    // Debug: Log selectorPath resolution
    if (process.env.NODE_ENV === "development") {
      const element = elementMap.get(elementId)
      if (element) {
        console.log(`[dom-element-mapping] buildActionDetails: elementId=${elementId}, tag=${element.tag}, name=${element.name ?? "null"}, ariaLabel=${element.ariaLabel ?? "null"}, explicitPath=${element.selectorPath ?? "null"}, resolvedPath=${selectorPath ?? "null"}`)
      } else {
        console.log(`[dom-element-mapping] buildActionDetails: elementId=${elementId} NOT FOUND in elementMap (size=${elementMap.size})`)
      }
    }
  }

  return {
    name,
    elementId,
    selectorPath,
    args,
  }
}
