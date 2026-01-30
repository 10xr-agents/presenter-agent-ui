/**
 * DOM Helper Utilities
 *
 * Provides utilities for DOM cleaning, element existence checking,
 * context extraction, and state hashing for the verification engine.
 *
 * @see docs/VERIFICATION_PROCESS.md
 */

import { createHash } from "crypto"

/**
 * Compute a stable hash of the DOM for before/after comparison.
 * Uses cleaned DOM (no scripts/styles) and a bounded length so the hash
 * reflects meaningful content change, not arbitrary size.
 *
 * @param dom - Raw or cleaned DOM string
 * @param maxBytes - Max bytes to hash (default 50_000)
 * @returns Hex digest (e.g. sha256)
 */
export function computeDomHash(dom: string, maxBytes = 50_000): string {
  const cleaned = cleanDomForVerification(dom)
  const truncated =
    cleaned.length <= maxBytes ? cleaned : cleaned.substring(0, maxBytes)
  return createHash("sha256").update(truncated, "utf8").digest("hex")
}

/**
 * Remove scripts, styles, SVGs, and base64 content from DOM string.
 * This reduces token usage and focuses on meaningful content.
 *
 * @param dom - Raw DOM string
 * @returns Cleaned DOM string
 */
export function cleanDomForVerification(dom: string): string {
  let cleaned = dom

  // Remove script tags and content
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")

  // Remove style tags and content
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")

  // Remove SVG tags and content (often very large)
  cleaned = cleaned.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "[SVG]")

  // Remove base64 data URIs (images, fonts) - they bloat the DOM
  cleaned = cleaned.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "[BASE64]")

  // Remove inline styles (often verbose and not useful for verification)
  cleaned = cleaned.replace(/\sstyle="[^"]*"/gi, "")
  cleaned = cleaned.replace(/\sstyle='[^']*'/gi, "")

  // Remove data-* attributes that aren't semantically useful
  // Keep: data-has-popup, data-state, data-expanded
  cleaned = cleaned.replace(/\sdata-(?!has-popup|state|expanded)[a-z-]+="[^"]*"/gi, "")
  cleaned = cleaned.replace(/\sdata-(?!has-popup|state|expanded)[a-z-]+='[^']*'/gi, "")

  // Collapse multiple whitespace/newlines
  cleaned = cleaned.replace(/\s+/g, " ")

  return cleaned.trim()
}

/**
 * Extract text content from DOM, removing all HTML tags.
 * Useful for semantic verification.
 *
 * @param dom - DOM string
 * @param maxLength - Maximum length of extracted text
 * @returns Plain text content
 */
export function extractTextContent(dom: string, maxLength = 2000): string {
  // Remove all HTML tags
  let text = dom.replace(/<[^>]+>/g, " ")

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim()

  // Truncate if needed
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + "..."
  }

  return text
}

/**
 * Sanitize a selector string for safe use in regex patterns.
 * Handles:
 * - Standard regex special characters
 * - Unicode characters
 * - HTML entities (e.g., &quot;, &amp;, &#39;)
 *
 * @param selector - Raw selector string
 * @returns Regex-safe selector string
 */
export function sanitizeSelectorForRegex(selector: string): string {
  if (!selector) return ""

  // First, decode common HTML entities that might appear in selectors
  const decoded = selector
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    // Numeric HTML entities (decimal)
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    // Numeric HTML entities (hex)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  // Escape regex special characters
  // This includes all characters that have special meaning in regex
  const escaped = decoded.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  return escaped
}

/**
 * Check if an element with the given selector exists in the DOM.
 * Uses robust regex matching instead of simple includes().
 *
 * Handles:
 * - id="selector" and id='selector'
 * - class="selector" with word boundaries
 * - Text content matching for natural language selectors
 * - Tag names
 * - Unicode characters and HTML entities
 *
 * @param dom - DOM string to search
 * @param selector - Element selector (ID, class, or text)
 * @returns Whether the element exists
 */
export function checkElementExists(dom: string, selector: string): boolean {
  if (!selector || !dom) return false

  // Sanitize selector for regex (handles special chars, unicode, HTML entities)
  const safeSelector = sanitizeSelectorForRegex(selector)

  // 1. Check exact ID match (handles both quote styles)
  const idRegex = new RegExp(`id=["']${safeSelector}["']`, "i")
  if (idRegex.test(dom)) return true

  // 2. Check class match with word boundaries
  // Handles: class="btn primary selector" or class="selector other-class"
  const classRegex = new RegExp(`class=["'][^"']*\\b${safeSelector}\\b[^"']*["']`, "i")
  if (classRegex.test(dom)) return true

  // 3. Check for data-testid match
  const testIdRegex = new RegExp(`data-testid=["']${safeSelector}["']`, "i")
  if (testIdRegex.test(dom)) return true

  // 4. Check for name attribute match
  const nameRegex = new RegExp(`name=["']${safeSelector}["']`, "i")
  if (nameRegex.test(dom)) return true

  // 5. Check for aria-label match
  const ariaLabelRegex = new RegExp(`aria-label=["'][^"']*${safeSelector}[^"']*["']`, "i")
  if (ariaLabelRegex.test(dom)) return true

  // 6. Check for text content match
  // Heuristic: if selector looks like natural language (has spaces, no special chars)
  // or is a simple word without underscores/hyphens, search for it in text
  const looksLikeText = selector.includes(" ") || !/[_-]/.test(selector)
  if (looksLikeText) {
    // Case-insensitive text search
    if (dom.toLowerCase().includes(selector.toLowerCase())) return true
  }

  // 7. Check for tag name match (e.g., "button", "input")
  const tagRegex = new RegExp(`<${safeSelector}\\b`, "i")
  if (tagRegex.test(dom)) return true

  return false
}

/**
 * Check if an element with the given selector does NOT exist in the DOM.
 *
 * @param dom - DOM string to search
 * @param selector - Element selector
 * @returns Whether the element is absent
 */
export function checkElementNotExists(dom: string, selector: string): boolean {
  return !checkElementExists(dom, selector)
}

/**
 * Check if an element contains specific text.
 *
 * @param dom - DOM string to search
 * @param selector - Element selector
 * @param text - Expected text content
 * @returns Whether the element contains the text
 */
export function checkElementHasText(
  dom: string,
  selector: string,
  text: string
): boolean {
  if (!selector || !text || !dom) return false

  // Try to find the element by selector and check its content
  const safeSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

  // Build regex to find element with selector and capture content
  // This is a simplified check - looks for text near the selector
  const patterns = [
    // id="selector">text</
    new RegExp(`id=["']${safeSelector}["'][^>]*>([\\s\\S]*?)</`, "i"),
    // class="selector">text</
    new RegExp(`class=["'][^"']*\\b${safeSelector}\\b[^"']*["'][^>]*>([\\s\\S]*?)</`, "i"),
  ]

  for (const pattern of patterns) {
    const match = dom.match(pattern)
    if (match?.[1] && match[1].includes(text)) {
      return true
    }
  }

  // Fallback: just check if text exists anywhere in DOM
  return dom.includes(text)
}

/**
 * Check if aria-expanded attribute is set to the expected value.
 *
 * @param dom - DOM string to search
 * @param expectedValue - Expected value ("true" or "false")
 * @returns Whether the attribute matches
 */
export function checkAriaExpanded(dom: string, expectedValue: string): boolean {
  const regex = new RegExp(`aria-expanded=["']${expectedValue}["']`, "i")
  return regex.test(dom)
}

/**
 * Check if elements with specific ARIA roles exist in the DOM.
 *
 * @param dom - DOM string to search
 * @param roles - Array of roles to check for (e.g., ["menuitem", "option"])
 * @returns Whether any of the roles are found
 */
export function checkRolesExist(dom: string, roles: string[]): boolean {
  for (const role of roles) {
    const roleRegex = new RegExp(`role=["']${role}["']`, "i")
    if (roleRegex.test(dom)) return true

    // Also check for implicit roles (semantic elements)
    // menuitem often rendered as list/listitem
    if (role === "menuitem") {
      if (/role=["']list["']/i.test(dom) || /role=["']listitem["']/i.test(dom)) {
        return true
      }
    }
  }
  return false
}

/**
 * Get a smart context window from DOM centered around expected content.
 * If the expected element/text is found, centers the window around it.
 *
 * @param dom - Full DOM string
 * @param expectedContent - Content to search for (selector or text)
 * @param windowSize - Size of context window (default 8000 chars)
 * @returns DOM context string
 */
export function getSmartDomContext(
  dom: string,
  expectedContent?: string,
  windowSize = 8000
): string {
  const cleanedDom = cleanDomForVerification(dom)

  // If DOM is small enough, return it all
  if (cleanedDom.length <= windowSize) {
    return cleanedDom
  }

  // If we have expected content, try to window around it
  if (expectedContent) {
    const lowerDom = cleanedDom.toLowerCase()
    const lowerExpected = expectedContent.toLowerCase()
    const index = lowerDom.indexOf(lowerExpected)

    if (index > 0) {
      // Center the window around the found content
      const halfWindow = Math.floor(windowSize / 2)
      const start = Math.max(0, index - halfWindow)
      const end = Math.min(cleanedDom.length, start + windowSize)

      let context = cleanedDom.substring(start, end)
      if (start > 0) context = "..." + context
      if (end < cleanedDom.length) context = context + "..."

      return context
    }
  }

  // Fallback: return first windowSize chars
  return cleanedDom.substring(0, windowSize) + "..."
}

/**
 * Extract the main content area from DOM (skip header, nav, footer).
 * Useful for getting more relevant context for verification.
 *
 * @param dom - DOM string
 * @returns Main content or original DOM if main not found
 */
export function extractMainContent(dom: string): string {
  // Try to find main content area
  const mainPatterns = [
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["']content["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class=["'][^"']*main-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  ]

  for (const pattern of mainPatterns) {
    const match = dom.match(pattern)
    if (match?.[1] && match[1].length > 500) {
      return match[1]
    }
  }

  // If no main found, try to skip header and footer
  let content = dom

  // Remove header
  content = content.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
  // Remove nav
  content = content.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
  // Remove footer
  content = content.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")

  return content
}

/**
 * Check if URL changed significantly.
 *
 * For SPAs that use query params for routing (e.g., ?tab=spending, ?page=2),
 * query param changes ARE considered significant since they represent navigation.
 *
 * Only hash-only changes (#section) are considered non-significant.
 *
 * @param previousUrl - URL before action
 * @param currentUrl - URL after action
 * @returns Whether the URL changed significantly
 */
export function hasSignificantUrlChange(previousUrl: string, currentUrl: string): boolean {
  // Quick equality check
  if (previousUrl === currentUrl) return false

  try {
    const prev = new URL(previousUrl)
    const curr = new URL(currentUrl)

    // Domain changed = significant
    if (prev.hostname !== curr.hostname) return true

    // Path changed = significant
    if (prev.pathname !== curr.pathname) return true

    // Query params changed = significant (SPAs use these for routing/tabs)
    if (prev.search !== curr.search) return true

    // Only hash changed = NOT significant (same-page anchor links)
    // If we get here, only the hash is different
    return false
  } catch {
    // If URL parsing fails, do string comparison
    return previousUrl !== currentUrl
  }
}

/**
 * Normalize URL for comparison (remove trailing slashes, lowercase).
 *
 * @param url - URL to normalize
 * @returns Normalized URL
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // Remove trailing slash from pathname
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/"
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase()
    return parsed.toString()
  } catch {
    return url.toLowerCase().replace(/\/+$/, "")
  }
}

/**
 * Check if navigation crossed domain boundaries.
 * Cross-domain = different hostname (e.g., example.com → google.com).
 *
 * Used by Tiered Verification (Phase 5) for deterministic success checks.
 *
 * @param beforeUrl - URL before action
 * @param afterUrl - URL after action
 * @returns true if hostnames differ
 */
export function isCrossDomainNavigation(beforeUrl: string, afterUrl: string): boolean {
  try {
    const before = new URL(beforeUrl)
    const after = new URL(afterUrl)
    return before.hostname.toLowerCase() !== after.hostname.toLowerCase()
  } catch {
    // If URL parsing fails, assume not cross-domain
    return false
  }
}

/**
 * Extract hostname safely for logging/comparison.
 *
 * @param url - URL to extract hostname from
 * @returns hostname or original URL on parse failure
 */
export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return url
  }
}
