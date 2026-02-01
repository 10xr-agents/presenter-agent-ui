/**
 * DOM Skeleton Extraction
 *
 * Server-side DOM distillation for the hybrid vision + skeleton pipeline.
 * Extracts only interactive elements from HTML DOM strings, reducing token
 * usage by ~80% while preserving all actionable elements.
 *
 * This module provides backward compatibility when the Chrome extension
 * hasn't been updated to send skeletonDom directly.
 */

import { JSDOM } from "jsdom"

/**
 * Interactive element data
 */
export interface SkeletonElement {
  tag: string
  id?: string
  text?: string
  attrs: Record<string, string>
  children?: SkeletonElement[]
}

/**
 * Result of skeleton extraction
 */
export interface SkeletonExtractionResult {
  /** Skeleton HTML string */
  skeleton: string
  /** Number of interactive elements found */
  elementCount: number
  /** Original DOM size in characters */
  originalSize: number
  /** Skeleton size in characters */
  skeletonSize: number
  /** Compression ratio (skeleton/original) */
  compressionRatio: number
}

/**
 * Tags that are always interactive
 */
const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "option",
  "label",
])

/**
 * Tags to completely discard (and their children)
 */
const DISCARD_TAGS = new Set([
  "style",
  "script",
  "noscript",
  "svg",
  "path",
  "link",
  "meta",
  "head",
  "template",
])

/**
 * Roles that indicate interactivity
 */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "tab",
  "checkbox",
  "radio",
  "switch",
  "option",
  "listbox",
  "combobox",
  "textbox",
  "searchbox",
  "slider",
  "spinbutton",
  "menu",
  "menubar",
  "tablist",
  "tree",
  "treeitem",
  "grid",
  "gridcell",
  "row",
])

/**
 * Attributes to keep in skeleton
 */
const KEEP_ATTRS = new Set([
  "id",
  "name",
  "type",
  "href",
  "value",
  "placeholder",
  "role",
  "aria-label",
  "title",
  "data-testid",
  "for",
  "action",
  "method",
])

/**
 * Extract skeleton DOM from full HTML string.
 * Returns only interactive elements with essential attributes.
 *
 * @param html - Full HTML string (from document.documentElement.outerHTML)
 * @param options - Extraction options
 * @returns Skeleton extraction result with HTML string and metrics
 */
export function extractSkeletonDom(
  html: string,
  options: {
    /** Max text content length per element (default: 100) */
    maxTextLength?: number
    /** Include element count in output (default: true) */
    includeMetrics?: boolean
  } = {}
): SkeletonExtractionResult {
  const maxTextLength = options.maxTextLength ?? 100
  const originalSize = html.length

  // Parse HTML using JSDOM
  const dom = new JSDOM(html)
  const document = dom.window.document

  // Extract interactive elements
  let elementCount = 0
  const skeleton = extractNode(document.body, maxTextLength, () => elementCount++)

  // Build skeleton HTML
  const skeletonHtml = skeletonToHtml(skeleton)
  const skeletonSize = skeletonHtml.length

  return {
    skeleton: skeletonHtml,
    elementCount,
    originalSize,
    skeletonSize,
    compressionRatio: skeletonSize / originalSize,
  }
}

/**
 * Recursively extract interactive elements from a DOM node
 */
function extractNode(
  element: Element | null,
  maxTextLength: number,
  onInteractive: () => void
): SkeletonElement | null {
  if (!element) return null

  const tag = element.tagName.toLowerCase()

  // Skip discard tags
  if (DISCARD_TAGS.has(tag)) return null

  // Skip hidden elements
  if (isHidden(element)) return null

  // Check if interactive
  const interactive = isInteractive(element)

  // Extract children recursively
  const children: SkeletonElement[] = []
  for (const child of element.children) {
    const childSkeleton = extractNode(child, maxTextLength, onInteractive)
    if (childSkeleton) {
      children.push(childSkeleton)
    }
  }

  // If not interactive and no interactive children, skip
  if (!interactive && children.length === 0) return null

  // Build skeleton element
  const skeleton: SkeletonElement = {
    tag,
    children: children.length > 0 ? children : undefined,
    attrs: {},
  }

  if (interactive) {
    onInteractive()

    // Get element ID (generate if missing)
    const id = element.getAttribute("id") || element.getAttribute("data-testid")
    if (id) {
      skeleton.id = id
    }

    // Extract essential attributes
    skeleton.attrs = extractEssentialAttrs(element)

    // Get visible text
    const text = getVisibleText(element, maxTextLength)
    if (text) {
      skeleton.text = text
    }
  }

  return skeleton
}

/**
 * Check if an element is interactive
 */
function isInteractive(element: Element): boolean {
  const tag = element.tagName.toLowerCase()

  // Always interactive tags
  if (INTERACTIVE_TAGS.has(tag)) return true

  // Check for click handlers (attribute-based)
  if (element.hasAttribute("onclick")) return true
  if (element.hasAttribute("ng-click")) return true
  if (element.hasAttribute("v-on:click")) return true
  if (element.hasAttribute("@click")) return true

  // Check for interactive roles
  const role = element.getAttribute("role")
  if (role && INTERACTIVE_ROLES.has(role)) return true

  // Check for tabindex (focusable)
  const tabindex = element.getAttribute("tabindex")
  if (tabindex !== null && parseInt(tabindex, 10) >= 0) return true

  // Check for contenteditable
  if (element.getAttribute("contenteditable") === "true") return true

  // Check for data-action (common pattern)
  if (element.hasAttribute("data-action")) return true

  return false
}

/**
 * Check if an element is hidden
 */
function isHidden(element: Element): boolean {
  // Check aria-hidden
  if (element.getAttribute("aria-hidden") === "true") return true

  // Check hidden attribute
  if (element.hasAttribute("hidden")) return true

  // Check style attribute for display:none or visibility:hidden
  const style = element.getAttribute("style") || ""
  if (style.includes("display: none") || style.includes("display:none")) return true
  if (style.includes("visibility: hidden") || style.includes("visibility:hidden")) return true

  // Check type="hidden" for inputs
  if (element.getAttribute("type") === "hidden") return true

  return false
}

/**
 * Extract essential attributes from an element
 */
function extractEssentialAttrs(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {}

  for (const attr of element.attributes) {
    if (KEEP_ATTRS.has(attr.name)) {
      attrs[attr.name] = attr.value
    }
  }

  return attrs
}

/**
 * Get visible text content (truncated)
 */
function getVisibleText(element: Element, maxLength: number): string | undefined {
  // Get direct text content (not from children)
  let text = ""
  for (const node of element.childNodes) {
    if (node.nodeType === 3) {
      // Text node
      text += node.textContent || ""
    }
  }

  text = text.trim()
  if (!text) {
    // Fallback to innerText for elements like buttons
    text = element.textContent?.trim() || ""
  }

  if (!text) return undefined

  // Truncate and clean whitespace
  text = text.replace(/\s+/g, " ")
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text
}

/**
 * Convert skeleton tree to minimal HTML string
 */
function skeletonToHtml(skeleton: SkeletonElement | null, indent = 0): string {
  if (!skeleton) return ""

  const { tag, id, attrs = {}, text, children } = skeleton
  const pad = "  ".repeat(indent)

  // Build attribute string
  const attrParts: string[] = []
  if (id) attrParts.push(`id="${escapeHtml(id)}"`)
  for (const [key, value] of Object.entries(attrs)) {
    if (key !== "id") {
      // Don't duplicate id
      attrParts.push(`${key}="${escapeHtml(value)}"`)
    }
  }
  const attrStr = attrParts.length > 0 ? " " + attrParts.join(" ") : ""

  // Self-closing tags
  const SELF_CLOSING = new Set(["input", "br", "hr", "img", "meta", "link"])
  if (SELF_CLOSING.has(tag)) {
    return `${pad}<${tag}${attrStr} />\n`
  }

  // Build content
  let content = ""
  if (text && (!children || children.length === 0)) {
    content = escapeHtml(text)
  } else if (children && children.length > 0) {
    content = "\n" + children.map((c) => skeletonToHtml(c, indent + 1)).join("") + pad
  }

  return `${pad}<${tag}${attrStr}>${content}</${tag}>\n`
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Get or create skeleton DOM from state.
 * If skeletonDom is already provided, returns it.
 * Otherwise, extracts skeleton from full DOM.
 *
 * @param dom - Full DOM string
 * @param skeletonDom - Pre-extracted skeleton (optional)
 * @returns Skeleton DOM string
 */
export function getOrCreateSkeleton(dom: string, skeletonDom?: string): string {
  if (skeletonDom) {
    return skeletonDom
  }

  const result = extractSkeletonDom(dom)
  return result.skeleton
}

/**
 * Get effective DOM content based on mode.
 * Returns the appropriate DOM representation for LLM processing.
 *
 * @param dom - Full DOM string
 * @param skeletonDom - Pre-extracted skeleton (optional)
 * @param domMode - Processing mode
 * @returns DOM content string to use
 */
export function getEffectiveDom(
  dom: string,
  skeletonDom?: string,
  domMode?: "skeleton" | "full" | "hybrid"
): string {
  switch (domMode) {
    case "skeleton":
    case "hybrid":
      return getOrCreateSkeleton(dom, skeletonDom)
    case "full":
    default:
      return dom
  }
}
