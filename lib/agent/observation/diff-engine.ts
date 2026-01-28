/**
 * Semantic Observation Engine (DOM Diff)
 *
 * Extracts a "semantic skeleton" of the page (interactive elements, alerts)
 * and diffs before/after skeletons to produce granular observations for the LLM.
 * Reduces false positives from hash-only comparison (e.g. ticking clocks, ads).
 *
 * Stack: cheerio (parse) + microdiff (JSON diff).
 *
 * @see docs/VERIFICATION_PROCESS.md
 */

import * as cheerio from "cheerio"
import diff from "microdiff"

/** Serializable descriptor for a single interactive element */
export interface ElementDescriptor {
  tag: string
  text?: string
  value?: string
  disabled?: boolean
  ariaExpanded?: string
  href?: string
  role?: string
}

/** Semantic skeleton: map of element key -> descriptor or string (for alerts) */
export type SemanticSkeleton = Record<string, ElementDescriptor | string>

const MAX_TEXT_LENGTH = 50
const INTERACTIVE_SELECTOR =
  "button, a[href], input, select, textarea, [role='button'], [role='link'], [role='menuitem']"
const ALERT_SELECTOR = "[role='alert'], .toast, .error, .success, .alert, [data-toast]"

/**
 * Extract a lightweight JSON representation of the "meaningful" DOM.
 * Only interactive elements and alerts — not every div.
 */
export function extractSemanticSkeleton(html: string): SemanticSkeleton {
  const skeleton: SemanticSkeleton = {}
  const $ = cheerio.load(html)

  // 1. Interactive elements (buttons, links, inputs, etc.)
  $(INTERACTIVE_SELECTOR).each((i, el) => {
    const $el = $(el)
    const id = $el.attr("id") ?? $el.attr("name") ?? $el.attr("aria-label") ?? `el-${i}`
    const tag = el.tagName?.toLowerCase() ?? "unknown"
    let text = $el.text().trim().replace(/\s+/g, " ").substring(0, MAX_TEXT_LENGTH)
    if (!text && tag === "input") {
      text = ($el.attr("placeholder") ?? "").substring(0, MAX_TEXT_LENGTH)
    }
    const value = $el.attr("value") ?? undefined
    const disabled = $el.attr("disabled") !== undefined
    const ariaExpanded = $el.attr("aria-expanded") ?? undefined
    const href = $el.attr("href") ?? undefined
    const role = $el.attr("role") ?? undefined

    skeleton[id] = {
      tag,
      ...(text && { text }),
      ...(value !== undefined && { value }),
      ...(disabled && { disabled: true }),
      ...(ariaExpanded && { ariaExpanded }),
      ...(href && { href: href.substring(0, 80) }),
      ...(role && { role }),
    }
  })

  // 2. Alerts / toasts / messages
  $(ALERT_SELECTOR).each((i, el) => {
    const $el = $(el)
    const text = $el.text().trim().replace(/\s+/g, " ").substring(0, MAX_TEXT_LENGTH)
    if (text) {
      skeleton[`alert-${i}`] = text
    }
  })

  return skeleton
}

/** One change from microdiff (type-safe) */
interface DiffItem {
  type: "CHANGE" | "CREATE" | "REMOVE"
  path: (string | number)[]
  oldValue?: unknown
  value?: unknown
}

/**
 * Compare before and after skeletons and return human-readable observations.
 * Used to tell the LLM exactly what changed (e.g. "Element 'submit-btn' text: Save -> Saved").
 */
export function getGranularObservation(
  beforeSkeleton: SemanticSkeleton,
  afterSkeleton: SemanticSkeleton
): string[] {
  const changes = diff(beforeSkeleton, afterSkeleton) as DiffItem[]
  const observations: string[] = []

  for (const c of changes) {
    const elementKey = c.path[0]
    const keyStr = typeof elementKey === "string" ? elementKey : String(elementKey)

    if (c.type === "CREATE") {
      const val = c.value
      if (typeof val === "string") {
        observations.push(`New message/alert appeared: "${val}"`)
      } else if (val && typeof val === "object" && "text" in (val as object)) {
        const t = (val as ElementDescriptor).text
        observations.push(`New element appeared: ${keyStr}${t ? ` ("${t}")` : ""}`)
      } else {
        observations.push(`New element appeared: ${keyStr}`)
      }
      continue
    }

    if (c.type === "REMOVE") {
      observations.push(`Element disappeared: ${keyStr}`)
      continue
    }

    if (c.type === "CHANGE") {
      const attribute = c.path.length > 1 ? c.path[1] : "content"
      const attrStr = typeof attribute === "string" ? attribute : String(attribute)
      const oldVal = c.oldValue !== undefined ? String(c.oldValue) : "?"
      const newVal = c.value !== undefined ? String(c.value) : "?"
      observations.push(`Element '${keyStr}' changed '${attrStr}' from '${oldVal}' to '${newVal}'`)
    }
  }

  return observations
}
