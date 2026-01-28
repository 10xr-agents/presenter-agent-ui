/**
 * Observation list builder for observation-based verification (v3.0).
 * Compares beforeState vs after; uses semantic skeleton diff when available.
 * Task 3: skeleton-primary — meaningfulContentChange is true only when skeleton diff has items,
 * or (when no skeleton) when domHash changed; when skeleton diff empty but hash changed, false.
 * @see docs/VERIFICATION_PROCESS.md
 */

import {
  extractSemanticSkeleton,
  getGranularObservation,
  type SemanticSkeleton,
} from "@/lib/agent/observation/diff-engine"
import type { BeforeState, ClientObservations } from "./types"

export interface ObservationListResult {
  observations: string[]
  /** True when page content meaningfully changed: skeleton diff had items, or (no skeleton) domHash changed. When skeleton diff empty but hash changed (e.g. tickers), false. */
  meaningfulContentChange: boolean
}

/**
 * Build a list of observed changes (URL, page content, focus, client witness).
 * When beforeState.semanticSkeleton and currentDom exist, uses granular diff as primary;
 * otherwise uses domHash comparison. Returns meaningfulContentChange for Task 3 (state drift).
 */
export function buildObservationList(
  beforeState: BeforeState,
  afterUrl: string,
  afterDomHash: string,
  afterActiveElement: string | undefined,
  clientObservations?: ClientObservations,
  currentDom?: string
): ObservationListResult {
  const observations: string[] = []
  let meaningfulContentChange = false

  if (beforeState.url !== afterUrl) {
    observations.push(`Navigation occurred: URL changed from ${beforeState.url} to ${afterUrl}`)
  } else {
    observations.push("URL did not change")
  }

  if (beforeState.semanticSkeleton && currentDom) {
    try {
      const afterSkeleton = extractSemanticSkeleton(currentDom) as SemanticSkeleton
      const beforeSkeleton = beforeState.semanticSkeleton as SemanticSkeleton
      const granular = getGranularObservation(beforeSkeleton, afterSkeleton)
      if (granular.length > 0) {
        observations.push(...granular)
        meaningfulContentChange = true
      } else if (beforeState.domHash !== afterDomHash) {
        observations.push("Page content updated (DOM changed; no interactive element changes detected)")
        // Task 3: skeleton diff empty but hash changed → no meaningful content change (e.g. tickers/ads)
        meaningfulContentChange = false
      } else {
        observations.push("Page content did not change (no interactive element or alert changes)")
      }
    } catch {
      if (beforeState.domHash !== afterDomHash) {
        observations.push("Page content updated (DOM changed)")
        meaningfulContentChange = true
      } else {
        observations.push("Page content did not change (DOM hash identical)")
      }
    }
  } else {
    if (beforeState.domHash !== afterDomHash) {
      observations.push("Page content updated (DOM changed)")
      meaningfulContentChange = true
    } else {
      observations.push("Page content did not change (DOM hash identical)")
    }
  }

  if (beforeState.activeElement !== undefined || afterActiveElement !== undefined) {
    if (beforeState.activeElement !== afterActiveElement) {
      observations.push(
        `Focus/active element changed from "${beforeState.activeElement ?? "none"}" to "${afterActiveElement ?? "none"}"`
      )
    }
  }

  if (clientObservations?.didNetworkOccur) {
    observations.push("Background network activity detected (extension witnessed)")
  }
  if (clientObservations?.didDomMutate) {
    observations.push("DOM was mutated (extension witnessed)")
  }
  if (clientObservations?.didUrlChange !== undefined) {
    observations.push(`Extension reported URL changed: ${clientObservations.didUrlChange}`)
  }

  return { observations, meaningfulContentChange }
}
