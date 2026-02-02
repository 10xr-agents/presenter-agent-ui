/**
 * Atomic Action Validator
 *
 * Validates that plan steps represent exactly ONE Chrome action.
 * If a step contains compound actions (e.g., "type and click submit"),
 * it splits them into separate atomic steps.
 *
 * This ensures alignment with CHROME_TAB_ACTIONS.md - each step
 * maps to exactly one executable action on the Chrome extension.
 *
 * @see docs/CHROME_TAB_ACTIONS.md - Chrome action reference
 */

import type { PlanStep, TaskPlan } from "@/lib/models/task"

/**
 * Patterns that indicate compound actions in a step description
 * These patterns suggest the step contains multiple actions
 */
const COMPOUND_ACTION_PATTERNS = [
  // "and" patterns
  /\band\s+(?:click|press|tap|hit|submit|type|enter)/i,
  /(?:type|enter|input|fill)\s+.+?\s+and\s+(?:click|press|submit)/i,
  /(?:click|press|select)\s+.+?\s+and\s+(?:type|enter|input)/i,

  // "then" patterns
  /\bthen\s+(?:click|press|tap|hit|submit|type|enter)/i,

  // Sequential action indicators
  /(?:type|enter)\s+.+?\s+(?:press|hit)\s+enter/i,
  /(?:fill|enter)\s+.+?\s+(?:submit|confirm)/i,

  // Common compound patterns
  /(?:fill|complete)\s+(?:the\s+)?form\s+and/i,
  /(?:enter|type)\s+.+?\s+(?:and|,)\s+(?:enter|type)/i,
]

/**
 * Keywords that indicate typing/input actions
 */
const INPUT_KEYWORDS = [
  "type", "enter", "input", "fill", "write", "put",
]

/**
 * Keywords that indicate submission/click actions
 */
const SUBMIT_KEYWORDS = [
  "click", "press", "tap", "hit", "submit", "confirm",
  "send", "save", "ok", "button",
]

/**
 * Keywords that indicate navigation actions
 */
const NAVIGATION_KEYWORDS = [
  "navigate", "go to", "open", "visit",
]

/**
 * Result of analyzing a step for atomicity
 */
export interface AtomicAnalysisResult {
  /** Whether the step is atomic (single action) */
  isAtomic: boolean
  /** If not atomic, the detected compound pattern */
  compoundPattern?: string
  /** Suggested split into atomic steps */
  suggestedSplit?: string[]
}

/**
 * Check if a step description contains compound actions
 */
export function isCompoundAction(description: string): boolean {
  const normalizedDesc = description.toLowerCase()
  return COMPOUND_ACTION_PATTERNS.some((pattern) => pattern.test(normalizedDesc))
}

/**
 * Analyze a step description for atomicity
 *
 * @param description - The step description to analyze
 * @returns Analysis result with atomicity status and suggested split
 */
export function analyzeStepAtomicity(description: string): AtomicAnalysisResult {
  const normalizedDesc = description.toLowerCase()

  // Check each compound pattern
  for (const pattern of COMPOUND_ACTION_PATTERNS) {
    if (pattern.test(normalizedDesc)) {
      const suggestedSplit = splitCompoundAction(description)
      return {
        isAtomic: false,
        compoundPattern: pattern.source,
        suggestedSplit,
      }
    }
  }

  return { isAtomic: true }
}

/**
 * Split a compound action description into atomic steps
 *
 * @param description - The compound action description
 * @returns Array of atomic step descriptions
 */
export function splitCompoundAction(description: string): string[] {
  const normalizedDesc = description.toLowerCase()
  const steps: string[] = []

  // Pattern: "Type X and press Enter" or "Enter X and click Submit"
  const typeAndSubmitMatch = normalizedDesc.match(
    /(?:type|enter|input|fill)\s+(?:'[^']*'|"[^"]*"|[^"']+?)\s+(?:and|then|,)\s+(?:press|click|hit|submit|tap)/i
  )
  if (typeAndSubmitMatch) {
    // Extract the value being typed
    const valueMatch = description.match(/(?:type|enter|input|fill)\s+(?:('|")[^'"]*\1|[^'"]+?)(?:\s+(?:and|then|,)|$)/i)
    const value = valueMatch ? valueMatch[0].replace(/\s+(?:and|then|,).*$/i, "") : ""

    // Extract what to press/click
    const submitMatch = description.match(/(?:press|click|hit|submit|tap)\s+(?:on\s+)?(?:the\s+)?(.+?)(?:\s+button)?$/i)
    const submitTarget = submitMatch ? submitMatch[1]?.trim() : "Submit"

    steps.push(value.trim())
    if (submitTarget?.toLowerCase() === "enter") {
      steps.push("Press Enter")
    } else {
      steps.push(`Click ${submitTarget}`)
    }
    return steps
  }

  // Pattern: "Fill in X and Y" (multiple inputs)
  const multipleInputMatch = normalizedDesc.match(
    /(?:fill|enter|type)\s+(?:in\s+)?(.+?)\s+and\s+(.+)/i
  )
  if (multipleInputMatch && multipleInputMatch[1] && multipleInputMatch[2]) {
    // Check if both parts are inputs (not input + submit)
    const secondPart = multipleInputMatch[2].toLowerCase()
    const isSecondPartInput = INPUT_KEYWORDS.some((k) => secondPart.includes(k)) ||
      !SUBMIT_KEYWORDS.some((k) => secondPart.includes(k))

    if (isSecondPartInput) {
      steps.push(`Enter ${multipleInputMatch[1].trim()}`)
      steps.push(`Enter ${multipleInputMatch[2].trim()}`)
      return steps
    }
  }

  // Pattern: "Click X and then Y"
  const clickAndMatch = normalizedDesc.match(
    /click\s+(?:on\s+)?(?:the\s+)?(.+?)\s+(?:and|then)\s+(.+)/i
  )
  if (clickAndMatch && clickAndMatch[1] && clickAndMatch[2]) {
    steps.push(`Click ${clickAndMatch[1].trim()}`)

    const secondAction = clickAndMatch[2].trim()
    if (INPUT_KEYWORDS.some((k) => secondAction.toLowerCase().includes(k))) {
      steps.push(secondAction.charAt(0).toUpperCase() + secondAction.slice(1))
    } else {
      steps.push(`Click ${secondAction}`)
    }
    return steps
  }

  // Fallback: Split on "and" or "then" with basic heuristics
  const parts = description.split(/\s+(?:and|then|,)\s+/i).filter((p) => p.trim())
  if (parts.length > 1) {
    return parts.map((part) => {
      const trimmed = part.trim()
      // Ensure each part has a verb
      const hasVerb = [...INPUT_KEYWORDS, ...SUBMIT_KEYWORDS, ...NAVIGATION_KEYWORDS]
        .some((v) => trimmed.toLowerCase().startsWith(v))
      if (!hasVerb) {
        // Try to infer the action type
        if (SUBMIT_KEYWORDS.some((s) => trimmed.toLowerCase().includes(s))) {
          return `Click ${trimmed}`
        }
        return trimmed
      }
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
    })
  }

  // Can't split, return as-is
  return [description]
}

/**
 * Validate and potentially split compound steps in a plan
 *
 * @param plan - The task plan to validate
 * @returns A new plan with compound steps split into atomic steps
 */
export function validateAndSplitPlan(plan: TaskPlan): TaskPlan {
  const newSteps: PlanStep[] = []
  let currentIndex = 0

  for (const step of plan.steps) {
    const analysis = analyzeStepAtomicity(step.description)

    if (analysis.isAtomic) {
      // Step is atomic, keep as-is with updated index
      newSteps.push({
        ...step,
        index: currentIndex,
      })
      currentIndex++
    } else if (analysis.suggestedSplit && analysis.suggestedSplit.length > 1) {
      // Split compound step into atomic steps
      for (const splitDescription of analysis.suggestedSplit) {
        newSteps.push({
          index: currentIndex,
          description: splitDescription,
          reasoning: step.reasoning
            ? `Split from: "${step.description}" - ${step.reasoning}`
            : `Split from: "${step.description}"`,
          toolType: step.toolType,
          status: "pending",
          expectedOutcome: step.expectedOutcome,
        })
        currentIndex++
      }
    } else {
      // Couldn't split but marked as compound - keep original
      newSteps.push({
        ...step,
        index: currentIndex,
      })
      currentIndex++
    }
  }

  return {
    ...plan,
    steps: newSteps,
  }
}

/**
 * Get atomic action guidelines for LLM prompts
 *
 * @returns String to include in LLM prompts for atomic action enforcement
 */
export function getAtomicActionGuidelines(): string {
  return `
**ATOMIC ACTION RULES (CRITICAL):**
Each plan step MUST represent exactly ONE browser action. The Chrome extension can only execute one action at a time.

Valid atomic actions (one per step):
- click(elementId) - Click on one element
- setValue(elementId, "text") - Enter text in one field
- press("Enter") - Press one key
- check(elementId) - Check one checkbox
- select(elementId, "option") - Select one dropdown option
- navigate("url") - Navigate to one URL
- scroll(direction) - Scroll the page
- hover(elementId) - Hover over one element

INVALID compound actions (NEVER combine):
- ❌ "Type email and click Submit" → Split into: 1. "Type email", 2. "Click Submit"
- ❌ "Fill in username and password" → Split into: 1. "Enter username", 2. "Enter password"
- ❌ "Enter search term and press Enter" → Split into: 1. "Enter search term", 2. "Press Enter"
- ❌ "Click dropdown and select option" → Split into: 1. "Click dropdown", 2. "Select option"

Why this matters:
1. Chrome extension executes ONE action per request
2. Verification happens AFTER each action
3. Compound steps cannot be executed atomically
`
}
