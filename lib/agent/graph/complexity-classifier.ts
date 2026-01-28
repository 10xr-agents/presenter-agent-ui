/**
 * Complexity Classifier
 *
 * Classifies tasks as SIMPLE or COMPLEX for routing through the graph.
 * SIMPLE tasks skip planning and go directly to action generation.
 * COMPLEX tasks go through the full reasoning → planning → execution flow.
 *
 * This is implemented as a fast heuristic (no LLM) to minimize latency.
 */

import type { ComplexityLevel } from "./types"

/**
 * Classification result
 */
export interface ComplexityClassification {
  complexity: ComplexityLevel
  reason: string
  confidence: number
}

/**
 * Action verbs that indicate single-action tasks (SIMPLE)
 */
const SIMPLE_ACTION_VERBS = [
  "click",
  "press",
  "tap",
  "select",
  "check",
  "uncheck",
  "toggle",
  "open",
  "close",
  "expand",
  "collapse",
  "scroll",
  "hover",
  "focus",
  "logout",
  "log out",
  "sign out",
  "signout",
  "refresh",
  "reload",
  "go back",
  "back",
  "forward",
  "dismiss",
  "cancel",
  "clear",
]

/**
 * Keywords that indicate multi-step tasks (COMPLEX)
 */
const COMPLEX_KEYWORDS = [
  "add",
  "create",
  "new",
  "edit",
  "update",
  "modify",
  "delete",
  "remove",
  "fill",
  "form",
  "submit",
  "save",
  "register",
  "sign up",
  "signup",
  "login",
  "log in",
  "signin",
  "sign in",
  "search for",
  "find and",
  "navigate to",
  "go to the",
  "configure",
  "set up",
  "setup",
  "schedule",
  "book",
  "order",
  "purchase",
  "buy",
  "checkout",
  "check out",
  "complete",
  "finish",
  "upload",
  "download",
  "export",
  "import",
  "transfer",
  "copy",
  "move",
  "rename",
  "change",
  "manage",
  "organize",
  "filter",
  "sort",
]

/**
 * Patterns that indicate form filling or multi-field input (COMPLEX)
 */
const MULTI_FIELD_PATTERNS = [
  /with (?:name|email|phone|address|date|time|id|number)/i,
  /\bname\s*['":]?\s*\w+/i, // "name 'John'" or "name: John"
  /\bdob\b|\bdate of birth\b/i,
  /\bemail\b.*@/i,
  /multiple|several|all|every|each/i,
  /step\s*\d+|first|then|after|next|finally/i,
  /and\s+(?:then|also|additionally)/i,
]

/**
 * Patterns that indicate single-element targeting (SIMPLE)
 */
const SINGLE_TARGET_PATTERNS = [
  /^click\s+(?:the\s+)?(?:on\s+)?["']?[\w\s]+["']?\s*(?:button|link|tab|menu|icon)?$/i,
  /^(?:press|tap|select)\s+(?:the\s+)?["']?[\w\s]+["']?$/i,
  /^(?:open|close|expand|collapse)\s+(?:the\s+)?["']?[\w\s]+["']?$/i,
  /^(?:log\s*out|sign\s*out|logout|signout)$/i,
  /^(?:go\s+)?back$/i,
  /^refresh(?:\s+(?:the\s+)?page)?$/i,
]

/**
 * Classify task complexity using fast heuristics (no LLM)
 *
 * @param query - User's task query
 * @param dom - Current page DOM (for element count heuristics)
 * @returns Classification result
 */
export function classifyComplexity(
  query: string,
  dom?: string
): ComplexityClassification {
  const normalizedQuery = query.toLowerCase().trim()
  const words = normalizedQuery.split(/\s+/)
  const wordCount = words.length

  // Rule 1: Very short queries with action verbs → SIMPLE
  if (wordCount <= 4) {
    for (const verb of SIMPLE_ACTION_VERBS) {
      if (normalizedQuery.startsWith(verb) || normalizedQuery.includes(` ${verb}`)) {
        return {
          complexity: "SIMPLE",
          reason: `Short query (${wordCount} words) with simple action verb "${verb}"`,
          confidence: 0.9,
        }
      }
    }
  }

  // Rule 2: Single-target patterns → SIMPLE
  for (const pattern of SINGLE_TARGET_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return {
        complexity: "SIMPLE",
        reason: `Query matches single-target pattern`,
        confidence: 0.95,
      }
    }
  }

  // Rule 3: Multi-field patterns → COMPLEX
  for (const pattern of MULTI_FIELD_PATTERNS) {
    if (pattern.test(normalizedQuery)) {
      return {
        complexity: "COMPLEX",
        reason: `Query contains multi-field pattern: ${pattern.source}`,
        confidence: 0.85,
      }
    }
  }

  // Rule 4: Complex keywords → COMPLEX
  for (const keyword of COMPLEX_KEYWORDS) {
    if (normalizedQuery.includes(keyword)) {
      return {
        complexity: "COMPLEX",
        reason: `Query contains complex keyword "${keyword}"`,
        confidence: 0.8,
      }
    }
  }

  // Rule 5: Word count heuristic
  // Short queries (≤5 words) without complex keywords → SIMPLE
  if (wordCount <= 5) {
    return {
      complexity: "SIMPLE",
      reason: `Short query (${wordCount} words) without complex indicators`,
      confidence: 0.7,
    }
  }

  // Rule 6: Long queries → COMPLEX (more likely to be multi-step)
  if (wordCount >= 10) {
    return {
      complexity: "COMPLEX",
      reason: `Long query (${wordCount} words) likely requires multiple steps`,
      confidence: 0.75,
    }
  }

  // Rule 7: Contains "and" connecting actions → COMPLEX
  if (/\band\b.*\b(click|press|fill|select|type|enter|submit)/i.test(normalizedQuery)) {
    return {
      complexity: "COMPLEX",
      reason: `Query contains multiple actions connected with "and"`,
      confidence: 0.8,
    }
  }

  // Default: Medium-length queries without clear indicators → COMPLEX (safer)
  return {
    complexity: "COMPLEX",
    reason: `Medium-length query (${wordCount} words) defaulting to COMPLEX for safety`,
    confidence: 0.6,
  }
}

/**
 * Quick check if a query is definitely SIMPLE (high confidence)
 * Used for early bailout in performance-critical paths
 *
 * @param query - User's task query
 * @returns true if definitely SIMPLE
 */
export function isDefinitelySimple(query: string): boolean {
  const classification = classifyComplexity(query)
  return classification.complexity === "SIMPLE" && classification.confidence >= 0.85
}

/**
 * Quick check if a query is definitely COMPLEX (high confidence)
 *
 * @param query - User's task query
 * @returns true if definitely COMPLEX
 */
export function isDefinitelyComplex(query: string): boolean {
  const classification = classifyComplexity(query)
  return classification.complexity === "COMPLEX" && classification.confidence >= 0.85
}
