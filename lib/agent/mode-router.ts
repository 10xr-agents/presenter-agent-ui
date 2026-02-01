/**
 * DOM Processing Mode Router
 *
 * Determines the optimal DOM processing mode (skeleton, full, or hybrid)
 * based on query analysis and page context. Part of the hybrid vision +
 * skeleton pipeline for token-efficient LLM processing.
 *
 * Mode Selection:
 * - skeleton: Simple text-based actions (fastest, lowest tokens)
 * - hybrid: Visual/spatial queries (screenshot + skeleton)
 * - full: Fallback when skeleton is insufficient
 */

import type { DomMode } from "./schemas"

/**
 * Query analysis result for mode routing
 */
export interface QueryAnalysis {
  /** Detected query type */
  queryType: "action" | "visual" | "analysis" | "navigation"
  /** Whether query contains visual/spatial references */
  hasVisualReferences: boolean
  /** Whether query contains position words */
  hasPositionWords: boolean
  /** Whether query is asking a question */
  isQuestion: boolean
  /** Keywords that influenced the decision */
  matchedKeywords: string[]
  /** Recommended mode */
  recommendedMode: DomMode
  /** Confidence in recommendation (0-1) */
  confidence: number
}

/**
 * Page context for mode routing
 */
export interface PageContext {
  /** Number of interactive elements on the page */
  interactiveElementCount?: number
  /** Whether the page has complex visual layout */
  hasComplexLayout?: boolean
  /** Whether screenshot is available */
  hasScreenshot?: boolean
  /** Client-provided mode hint */
  clientModeHint?: DomMode
}

/**
 * Keywords that indicate visual/spatial reasoning is needed
 */
const VISUAL_KEYWORDS = [
  // Visual descriptors
  "icon",
  "image",
  "logo",
  "picture",
  "photo",
  "avatar",
  "thumbnail",
  "banner",
  // Appearance
  "looks like",
  "appears",
  "color",
  "colour",
  "shape",
  "size",
  // Visual identification
  "what is",
  "what does",
  "what's",
  "identify",
  "recognize",
  "find the",
]

/**
 * Keywords that indicate position/spatial context
 */
const POSITION_KEYWORDS = [
  // Absolute positions
  "top",
  "bottom",
  "left",
  "right",
  "corner",
  "center",
  "middle",
  // Relative positions
  "next to",
  "above",
  "below",
  "beside",
  "near",
  "between",
  "under",
  "over",
  // Ordinal
  "first",
  "second",
  "third",
  "last",
  "nth",
]

/**
 * Keywords that indicate simple actions (skeleton-only)
 */
const SIMPLE_ACTION_KEYWORDS = [
  "click",
  "tap",
  "press",
  "type",
  "fill",
  "enter",
  "select",
  "choose",
  "submit",
  "login",
  "sign in",
  "log in",
  "search for",
  "go to",
  "navigate to",
  "open",
]

/**
 * Keywords that indicate analysis/questions
 */
const ANALYSIS_KEYWORDS = [
  "how much",
  "how many",
  "what is the price",
  "total",
  "cost",
  "amount",
  "count",
  "list",
  "show me",
  "tell me",
  "find out",
  "figure out",
  "analyze",
  "compare",
  "which",
  "who",
  "where",
  "when",
]

/**
 * Analyze a query to determine optimal processing mode.
 *
 * @param query - User query string
 * @param context - Optional page context
 * @returns Query analysis with recommended mode
 */
export function analyzeQuery(query: string, context?: PageContext): QueryAnalysis {
  const lowerQuery = query.toLowerCase()
  const matchedKeywords: string[] = []

  // Check for visual references
  const hasVisualReferences = VISUAL_KEYWORDS.some((kw) => {
    if (lowerQuery.includes(kw)) {
      matchedKeywords.push(kw)
      return true
    }
    return false
  })

  // Check for position words
  const hasPositionWords = POSITION_KEYWORDS.some((kw) => {
    if (lowerQuery.includes(kw)) {
      matchedKeywords.push(kw)
      return true
    }
    return false
  })

  // Check for simple actions
  const hasSimpleAction = SIMPLE_ACTION_KEYWORDS.some((kw) => {
    if (lowerQuery.includes(kw)) {
      matchedKeywords.push(kw)
      return true
    }
    return false
  })

  // Check for analysis/questions
  const hasAnalysis = ANALYSIS_KEYWORDS.some((kw) => {
    if (lowerQuery.includes(kw)) {
      matchedKeywords.push(kw)
      return true
    }
    return false
  })

  // Determine query type
  let queryType: QueryAnalysis["queryType"] = "action"
  if (hasVisualReferences) {
    queryType = "visual"
  } else if (hasAnalysis) {
    queryType = "analysis"
  } else if (lowerQuery.includes("go to") || lowerQuery.includes("navigate")) {
    queryType = "navigation"
  }

  const isQuestion =
    lowerQuery.startsWith("what") ||
    lowerQuery.startsWith("how") ||
    lowerQuery.startsWith("which") ||
    lowerQuery.startsWith("who") ||
    lowerQuery.startsWith("where") ||
    lowerQuery.includes("?")

  // Determine recommended mode
  let recommendedMode: DomMode = "skeleton"
  let confidence = 0.8

  // Client hint takes priority if provided
  if (context?.clientModeHint) {
    recommendedMode = context.clientModeHint
    confidence = 0.95
  }
  // Visual references or position words → hybrid mode
  else if (hasVisualReferences || hasPositionWords) {
    recommendedMode = context?.hasScreenshot ? "hybrid" : "full"
    confidence = hasVisualReferences && hasPositionWords ? 0.95 : 0.85
  }
  // Analysis questions often benefit from visual context
  else if (hasAnalysis && isQuestion) {
    recommendedMode = context?.hasScreenshot ? "hybrid" : "skeleton"
    confidence = 0.75
  }
  // Simple actions → skeleton only
  else if (hasSimpleAction && !hasPositionWords) {
    recommendedMode = "skeleton"
    confidence = 0.9
  }
  // Complex pages benefit from hybrid mode
  else if (context?.interactiveElementCount && context.interactiveElementCount > 50) {
    recommendedMode = context?.hasScreenshot ? "hybrid" : "skeleton"
    confidence = 0.7
  }

  return {
    queryType,
    hasVisualReferences,
    hasPositionWords,
    isQuestion,
    matchedKeywords,
    recommendedMode,
    confidence,
  }
}

/**
 * Determine the effective DOM mode to use.
 * Considers client-provided mode, query analysis, and context.
 *
 * @param query - User query string
 * @param clientMode - Mode provided by client (optional)
 * @param context - Page context (optional)
 * @returns Effective mode to use
 */
export function determineEffectiveMode(
  query: string,
  clientMode?: DomMode,
  context?: PageContext
): DomMode {
  // If client explicitly set a mode, respect it
  if (clientMode) {
    return clientMode
  }

  // Analyze query and determine mode
  const analysis = analyzeQuery(query, context)
  return analysis.recommendedMode
}

/**
 * Check if visual mode (hybrid) should be used for a query.
 * Convenience function for quick checks.
 *
 * @param query - User query string
 * @param hasScreenshot - Whether screenshot is available
 * @returns True if visual/hybrid mode is recommended
 */
export function shouldUseVisualMode(query: string, hasScreenshot: boolean): boolean {
  if (!hasScreenshot) return false

  const analysis = analyzeQuery(query, { hasScreenshot })
  return analysis.recommendedMode === "hybrid"
}

/**
 * Check if skeleton-only mode is sufficient for a query.
 *
 * @param query - User query string
 * @returns True if skeleton mode is sufficient
 */
export function isSkeletonSufficient(query: string): boolean {
  const analysis = analyzeQuery(query)
  return analysis.recommendedMode === "skeleton" && analysis.confidence >= 0.8
}

/**
 * Get a human-readable explanation of the mode selection.
 *
 * @param analysis - Query analysis result
 * @returns Explanation string
 */
export function explainModeSelection(analysis: QueryAnalysis): string {
  const parts: string[] = []

  if (analysis.hasVisualReferences) {
    parts.push("visual references detected")
  }
  if (analysis.hasPositionWords) {
    parts.push("position/spatial words detected")
  }
  if (analysis.isQuestion) {
    parts.push("question query")
  }
  if (analysis.matchedKeywords.length > 0) {
    parts.push(`keywords: ${analysis.matchedKeywords.slice(0, 3).join(", ")}`)
  }

  const modeDescription =
    analysis.recommendedMode === "skeleton"
      ? "skeleton-only (fast, low tokens)"
      : analysis.recommendedMode === "hybrid"
        ? "hybrid (visual + skeleton)"
        : "full DOM (fallback)"

  return `Mode: ${modeDescription} (${Math.round(analysis.confidence * 100)}% confident). ${parts.join("; ")}`
}
