import { analyzeQuery } from "@/lib/agent/mode-router"
import type { SemanticNodeV3 } from "@/lib/agent/schemas"

export type RequestedDomMode = "skeleton" | "hybrid" | "full"

export interface ContextRequest {
  requestedDomMode: RequestedDomMode
  needsScreenshot?: boolean
  needsSkeletonDom?: boolean
  reason: string
}

function hasUsefulSpatialMetadata(tree: SemanticNodeV3[] | undefined): boolean {
  if (!tree || tree.length === 0) return false
  let withSpatial = 0
  for (const n of tree) {
    if (n.xy || n.box) withSpatial++
  }
  // If at least ~25% of nodes have xy/box, we can often resolve "top/right/second" without a screenshot.
  return withSpatial / tree.length >= 0.25
}

export function looksLikeTextExtractionQuery(query: string): boolean {
  const q = query.toLowerCase()
  // If the user is asking for totals, prices, counts, or comparisons, we generally need
  // non-interactive page text (tables, labels, values). The semantic interactiveTree
  // intentionally omits most of that, so request full DOM (ideally client-filtered via DOM RAG).
  const keywords = [
    "how much",
    "how many",
    "price",
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
  ]
  if (keywords.some((kw) => q.includes(kw))) return true

  // Questions that start with "which/who/where/when" often require reading page content,
  // not just clicking something.
  return (
    q.startsWith("which ") ||
    q.startsWith("who ") ||
    q.startsWith("where ") ||
    q.startsWith("when ")
  )
}

/**
 * Decide whether the backend should request heavier artifacts for action generation.
 *
 * Semantic-first contract:
 * - interactiveTree is always the canonical structure
 * - screenshot + skeletonDom are requested only when semantic is insufficient for visual/spatial grounding
 */
export function computeContextRequestForAction(input: {
  query: string
  dom?: string
  screenshot?: string | null
  skeletonDom?: string
  interactiveTree?: SemanticNodeV3[]
}): ContextRequest | null {
  const analysis = analyzeQuery(input.query, {
    hasScreenshot: Boolean(input.screenshot),
    interactiveElementCount: input.interactiveTree?.length,
  })

  const spatialOk = hasUsefulSpatialMetadata(input.interactiveTree)

  const hasFullDom = typeof input.dom === "string" && input.dom.length > 0

  // If the user is asking to extract/compare values from the page, we need actual page text.
  // Prefer requesting full DOM (or DOM-RAG-filtered DOM) rather than a screenshot.
  if (!hasFullDom && looksLikeTextExtractionQuery(input.query)) {
    return {
      requestedDomMode: "full",
      reason:
        "Query looks like it requires reading non-interactive page content (tables/values/text). Please send full DOM (preferably filtered via DOM RAG).",
    }
  }

  // Visual references generally require a screenshot.
  // NOTE: Don't treat generic question phrases as visual. Require stronger visual cues.
  const q = input.query.toLowerCase()
  const hasStrongVisualCue =
    q.includes("icon") ||
    q.includes("image") ||
    q.includes("logo") ||
    q.includes("picture") ||
    q.includes("photo") ||
    q.includes("avatar") ||
    q.includes("thumbnail") ||
    q.includes("banner") ||
    q.includes("color") ||
    q.includes("colour") ||
    q.includes("shape")

  // Positional language can be handled by xy/box, but request hybrid if we lack spatial metadata.
  const needsVisual = hasStrongVisualCue || (analysis.hasPositionWords && !spatialOk)

  if (needsVisual) {
    const needsScreenshot = !input.screenshot
    const needsSkeletonDom = !input.skeletonDom
    if (needsScreenshot || needsSkeletonDom) {
      return {
        requestedDomMode: "hybrid",
        needsScreenshot: needsScreenshot || undefined,
        needsSkeletonDom: needsSkeletonDom || undefined,
        reason: hasStrongVisualCue
          ? "Query uses visual cues that semantic tree cannot capture reliably (e.g., color/icon/layout)."
          : "Query uses positional/spatial cues but semantic tree lacks enough coordinate metadata (xy/box).",
      }
    }
  }

  return null
}

