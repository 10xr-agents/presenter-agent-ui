/**
 * DOM Similarity Algorithm (Phase 3 - Task 2 Dependency)
 *
 * Calculates structural similarity between two DOM snapshots to detect
 * significant page changes that may require re-planning.
 *
 * Algorithm: Jaccard similarity on element signatures with weighted
 * interactive element scoring.
 */

import * as Sentry from "@sentry/nextjs"

/**
 * Result of DOM similarity calculation
 */
export interface DomSimilarityResult {
  /** Overall similarity score (0.0 to 1.0) */
  similarity: number
  /** Raw structural similarity (Jaccard) */
  structuralSimilarity: number
  /** Interactive elements similarity */
  interactiveSimilarity: number
  /** Detected structural changes */
  structuralChanges: string[]
  /** Whether re-planning should be triggered */
  shouldReplan: boolean
  /** Element count comparison */
  elementCounts: {
    previous: number
    current: number
    intersection: number
    union: number
  }
  /** Interactive element counts */
  interactiveCounts: {
    previous: number
    current: number
    retained: number
  }
}

/**
 * Element signature for comparison
 */
interface ElementSignature {
  tag: string
  id?: string
  classes: string[]
  role?: string
  ariaLabel?: string
  type?: string
  name?: string
  /** Normalized signature string for comparison */
  signature: string
}

/**
 * Tags that indicate interactive elements (weighted higher in similarity)
 */
const INTERACTIVE_TAGS = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "details",
  "summary",
])

/**
 * Roles that indicate interactive elements
 */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "listbox",
  "menu",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "tabpanel",
  "searchbox",
])

/**
 * Extract element signatures from DOM string
 *
 * Uses regex-based extraction for speed (no full DOM parsing).
 * Extracts tag, id, class, role, aria-label, type, name.
 */
function extractElementSignatures(dom: string): ElementSignature[] {
  const signatures: ElementSignature[] = []
  
  // Match opening tags with attributes
  // This regex captures: <tag attr1="val1" attr2="val2" ...>
  const tagRegex = /<(\w+)([^>]*)>/gi
  let match: RegExpExecArray | null
  
  while ((match = tagRegex.exec(dom)) !== null) {
    const tag = (match[1] || "").toLowerCase()
    const attrs = match[2] || ""
    
    // Skip script, style, meta, and other non-content tags
    if (["script", "style", "meta", "link", "head", "!doctype", "html"].includes(tag)) {
      continue
    }
    
    // Extract attributes
    const idMatch = attrs.match(/\bid=["']([^"']+)["']/i)
    const classMatch = attrs.match(/\bclass=["']([^"']+)["']/i)
    const roleMatch = attrs.match(/\brole=["']([^"']+)["']/i)
    const ariaLabelMatch = attrs.match(/\baria-label=["']([^"']+)["']/i)
    const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i)
    const nameMatch = attrs.match(/\bname=["']([^"']+)["']/i)
    
    const id = idMatch?.[1]
    const classStr = classMatch?.[1] || ""
    const classes = classStr.split(/\s+/).filter((c) => c.length > 0)
    const role = roleMatch?.[1]?.toLowerCase()
    const ariaLabel = ariaLabelMatch?.[1]
    const type = typeMatch?.[1]?.toLowerCase()
    const name = nameMatch?.[1]
    
    // Build signature string
    const signatureParts: string[] = [tag]
    
    if (id) {
      signatureParts.push(`#${id}`)
    }
    
    // Include first 3 classes for signature (avoid noise from utility classes)
    const significantClasses = classes
      .filter((c) => !c.match(/^(p-|m-|w-|h-|flex|grid|text-|bg-|border-)/))
      .slice(0, 3)
    if (significantClasses.length > 0) {
      signatureParts.push(`.${significantClasses.join(".")}`)
    }
    
    if (role) {
      signatureParts.push(`[role=${role}]`)
    }
    
    if (type && tag === "input") {
      signatureParts.push(`[type=${type}]`)
    }
    
    if (name) {
      signatureParts.push(`[name=${name}]`)
    }
    
    const signature = signatureParts.join("")
    
    signatures.push({
      tag,
      id,
      classes,
      role,
      ariaLabel,
      type,
      name,
      signature,
    })
  }
  
  return signatures
}

/**
 * Check if an element signature represents an interactive element
 */
function isInteractive(sig: ElementSignature): boolean {
  if (INTERACTIVE_TAGS.has(sig.tag)) {
    return true
  }
  
  if (sig.role && INTERACTIVE_ROLES.has(sig.role)) {
    return true
  }
  
  // Links with href
  if (sig.tag === "a") {
    return true
  }
  
  // Clickable elements (button role or onclick hint)
  if (sig.classes.some((c) => c.includes("btn") || c.includes("button") || c.includes("clickable"))) {
    return true
  }
  
  return false
}

/**
 * Detect major structural changes between DOMs
 */
function detectStructuralChanges(
  prevSigs: ElementSignature[],
  currSigs: ElementSignature[],
  prevInteractive: ElementSignature[],
  currInteractive: ElementSignature[]
): string[] {
  const changes: string[] = []
  
  // Check for form changes
  const prevForms = prevSigs.filter((s) => s.tag === "form")
  const currForms = currSigs.filter((s) => s.tag === "form")
  
  if (prevForms.length > 0 && currForms.length === 0) {
    changes.push("form removed")
  } else if (prevForms.length === 0 && currForms.length > 0) {
    changes.push("form added")
  } else if (prevForms.length !== currForms.length) {
    changes.push(`form count changed: ${prevForms.length} → ${currForms.length}`)
  }
  
  // Check for navigation changes
  const prevNav = prevSigs.filter((s) => s.tag === "nav" || s.role === "navigation")
  const currNav = currSigs.filter((s) => s.tag === "nav" || s.role === "navigation")
  
  if (prevNav.length !== currNav.length) {
    changes.push(`navigation changed: ${prevNav.length} → ${currNav.length}`)
  }
  
  // Check for modal/dialog changes
  const prevDialogs = prevSigs.filter((s) => s.tag === "dialog" || s.role === "dialog" || s.role === "alertdialog")
  const currDialogs = currSigs.filter((s) => s.tag === "dialog" || s.role === "dialog" || s.role === "alertdialog")
  
  if (prevDialogs.length === 0 && currDialogs.length > 0) {
    changes.push("dialog/modal opened")
  } else if (prevDialogs.length > 0 && currDialogs.length === 0) {
    changes.push("dialog/modal closed")
  }
  
  // Check for significant interactive element changes
  const interactiveRetained = currInteractive.filter((c) =>
    prevInteractive.some((p) => p.signature === c.signature)
  ).length
  
  const interactiveRetentionRate = prevInteractive.length > 0
    ? interactiveRetained / prevInteractive.length
    : 1.0
  
  if (interactiveRetentionRate < 0.5) {
    changes.push(`major interactive element change (${(interactiveRetentionRate * 100).toFixed(0)}% retained)`)
  }
  
  // Check for table changes
  const prevTables = prevSigs.filter((s) => s.tag === "table" || s.role === "grid" || s.role === "table")
  const currTables = currSigs.filter((s) => s.tag === "table" || s.role === "grid" || s.role === "table")
  
  if (prevTables.length !== currTables.length) {
    changes.push(`table/grid count changed: ${prevTables.length} → ${currTables.length}`)
  }
  
  // Check for main content changes
  const prevMain = prevSigs.filter((s) => s.tag === "main" || s.role === "main")
  const currMain = currSigs.filter((s) => s.tag === "main" || s.role === "main")
  
  if (prevMain.length !== currMain.length) {
    changes.push("main content area changed")
  }
  
  return changes
}

/**
 * Calculate DOM similarity using structural comparison
 *
 * Algorithm:
 * 1. Extract element signatures from both DOMs
 * 2. Calculate Jaccard similarity: |A ∩ B| / |A ∪ B|
 * 3. Weight interactive elements higher (60% structural + 40% interactive)
 * 4. Detect major structural changes
 *
 * @param previousDom - Previous DOM snapshot
 * @param currentDom - Current DOM snapshot
 * @param threshold - Similarity threshold below which re-planning is suggested (default: 0.7)
 * @returns DOM similarity result
 */
export function calculateDomSimilarity(
  previousDom: string,
  currentDom: string,
  threshold = 0.7
): DomSimilarityResult {
  try {
    // Extract signatures
    const prevSigs = extractElementSignatures(previousDom)
    const currSigs = extractElementSignatures(currentDom)
    
    // Extract signature strings for set operations
    const prevSet = new Set(prevSigs.map((s) => s.signature))
    const currSet = new Set(currSigs.map((s) => s.signature))
    
    // Calculate Jaccard similarity
    const intersection = Array.from(prevSet).filter((s) => currSet.has(s))
    const union = new Set(Array.from(prevSet).concat(Array.from(currSet)))
    
    const structuralSimilarity = union.size > 0
      ? intersection.length / union.size
      : 1.0 // Both empty = identical
    
    // Calculate interactive element similarity
    const prevInteractive = prevSigs.filter(isInteractive)
    const currInteractive = currSigs.filter(isInteractive)
    
    const prevInteractiveSet = new Set(prevInteractive.map((s) => s.signature))
    const currInteractiveSet = new Set(currInteractive.map((s) => s.signature))
    
    const interactiveIntersection = Array.from(prevInteractiveSet).filter((s) => currInteractiveSet.has(s))
    
    const interactiveSimilarity = prevInteractiveSet.size > 0
      ? interactiveIntersection.length / prevInteractiveSet.size
      : 1.0
    
    // Combined score: 60% structural + 40% interactive
    const similarity = (structuralSimilarity * 0.6) + (interactiveSimilarity * 0.4)
    
    // Detect structural changes
    const structuralChanges = detectStructuralChanges(prevSigs, currSigs, prevInteractive, currInteractive)
    
    // Determine if re-planning is needed
    const shouldReplan = similarity < threshold || structuralChanges.length > 0
    
    return {
      similarity,
      structuralSimilarity,
      interactiveSimilarity,
      structuralChanges,
      shouldReplan,
      elementCounts: {
        previous: prevSigs.length,
        current: currSigs.length,
        intersection: intersection.length,
        union: union.size,
      },
      interactiveCounts: {
        previous: prevInteractive.length,
        current: currInteractive.length,
        retained: interactiveIntersection.length,
      },
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    
    // On error, return a conservative result suggesting re-planning
    return {
      similarity: 0.5,
      structuralSimilarity: 0.5,
      interactiveSimilarity: 0.5,
      structuralChanges: ["error calculating similarity"],
      shouldReplan: true,
      elementCounts: {
        previous: 0,
        current: 0,
        intersection: 0,
        union: 0,
      },
      interactiveCounts: {
        previous: 0,
        current: 0,
        retained: 0,
      },
    }
  }
}

/**
 * Quick check if URL has changed significantly
 *
 * Returns true if:
 * - Domain changed
 * - Path changed (ignoring query params and hash)
 *
 * @param previousUrl - Previous URL
 * @param currentUrl - Current URL
 * @returns Whether URL change is significant
 */
export function hasSignificantUrlChange(previousUrl: string, currentUrl: string): boolean {
  try {
    const prev = new URL(previousUrl)
    const curr = new URL(currentUrl)
    
    // Check if domain changed
    if (prev.hostname !== curr.hostname) {
      return true
    }
    
    // Check if path changed (main indicator of navigation)
    if (prev.pathname !== curr.pathname) {
      return true
    }
    
    return false
  } catch {
    // If URL parsing fails, consider it a significant change
    return previousUrl !== currentUrl
  }
}

/**
 * Determine if re-planning is needed based on DOM and URL changes
 *
 * Triggers re-planning if:
 * 1. URL path changed
 * 2. DOM similarity < threshold (default 0.7)
 * 3. Major structural changes detected
 *
 * @param previousDom - Previous DOM snapshot
 * @param currentDom - Current DOM snapshot
 * @param previousUrl - Previous URL
 * @param currentUrl - Current URL
 * @param similarityThreshold - DOM similarity threshold (default: 0.7)
 * @returns Object with shouldReplan flag and reasons
 */
export function shouldTriggerReplanning(
  previousDom: string,
  currentDom: string,
  previousUrl: string,
  currentUrl: string,
  similarityThreshold = 0.7
): {
  shouldReplan: boolean
  reasons: string[]
  urlChanged: boolean
  domSimilarity: DomSimilarityResult
} {
  const reasons: string[] = []
  
  // Check URL change
  const urlChanged = hasSignificantUrlChange(previousUrl, currentUrl)
  if (urlChanged) {
    reasons.push(`URL path changed: ${new URL(previousUrl).pathname} → ${new URL(currentUrl).pathname}`)
  }
  
  // Calculate DOM similarity
  const domSimilarity = calculateDomSimilarity(previousDom, currentDom, similarityThreshold)
  
  if (domSimilarity.similarity < similarityThreshold) {
    reasons.push(`DOM similarity below threshold: ${(domSimilarity.similarity * 100).toFixed(1)}% < ${(similarityThreshold * 100).toFixed(0)}%`)
  }
  
  if (domSimilarity.structuralChanges.length > 0) {
    reasons.push(`Structural changes: ${domSimilarity.structuralChanges.join(", ")}`)
  }
  
  // Re-plan if any trigger condition met
  const shouldReplan = urlChanged || domSimilarity.shouldReplan
  
  return {
    shouldReplan,
    reasons,
    urlChanged,
    domSimilarity,
  }
}
