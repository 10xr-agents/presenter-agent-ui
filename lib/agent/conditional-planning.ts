/**
 * Conditional Planning (Phase 4 Task 7)
 *
 * Tree of Thoughts planning with contingencies. Instead of linear step lists,
 * the planner anticipates branching paths for common web scenarios:
 * - Popups and modals
 * - A/B test variations
 * - Error states
 * - Missing elements
 *
 * Flow:
 * 1. Planner generates main path + contingencies
 * 2. On verification failure, check contingency map BEFORE calling Correction LLM
 * 3. If contingency matches, apply it (skip expensive correction call)
 * 4. If no match, fall back to full correction
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 4 Task 7
 */

import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { CONTINGENCY_RESPONSE_SCHEMA } from "@/lib/llm/response-schemas"
import type { PlanStep, TaskPlan } from "@/lib/models/task"

/**
 * Internal Plan type that extends TaskPlan for consistency
 */
type Plan = TaskPlan

// =============================================================================
// Types
// =============================================================================

/**
 * A contingency action for handling specific failure scenarios
 */
export interface Contingency {
  /** Unique identifier for this contingency */
  id: string
  /** Condition that triggers this contingency */
  condition: ContingencyCondition
  /** Actions to take when condition is met */
  actions: ContingencyAction[]
  /** Priority (higher = check first) */
  priority: number
}

/**
 * Condition that triggers a contingency
 */
export interface ContingencyCondition {
  /** Type of condition */
  type:
    | "ELEMENT_MISSING" // Expected element not found
    | "POPUP_DETECTED" // Modal/popup appeared
    | "ERROR_DISPLAYED" // Error message visible
    | "URL_CHANGED" // Unexpected navigation
    | "FORM_VALIDATION" // Form validation error
    | "CUSTOM" // Custom condition
  /** Pattern to match (regex or exact) */
  pattern?: string
  /** Element selector to check (for ELEMENT_MISSING, POPUP_DETECTED) */
  selector?: string
  /** Text to look for */
  textMatch?: string
  /** Description of when this applies */
  description: string
}

/**
 * Action to take when contingency condition is met
 */
export interface ContingencyAction {
  /** Action type */
  type: "CLICK" | "WAIT" | "SCROLL" | "NAVIGATE" | "SKIP_STEP" | "RESUME_MAIN"
  /** Target element description */
  target?: string
  /** Additional parameters */
  params?: Record<string, unknown>
  /** Description of this action */
  description: string
}

/**
 * Extended plan with contingencies
 */
export interface ConditionalPlan extends Plan {
  /** Contingency handlers for common failure scenarios */
  contingencies: Contingency[]
  /** Whether this plan has conditional logic */
  hasContingencies: boolean
}

/**
 * Context for contingency generation
 */
export interface ContingencyGenerationContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
  langfuseTraceId?: string
}

/**
 * Result of checking contingencies
 */
export interface ContingencyCheckResult {
  /** Whether a contingency matched */
  matched: boolean
  /** The matching contingency (if any) */
  contingency?: Contingency
  /** Suggested actions to take */
  suggestedActions?: ContingencyAction[]
  /** Reason for match or no-match */
  reason: string
}

// =============================================================================
// Contingency Generation
// =============================================================================

/**
 * Generate contingencies for a plan
 *
 * Analyzes the plan steps and generates likely contingency scenarios
 * based on common web interaction patterns.
 *
 * @param plan - The base plan to enhance
 * @param goal - The goal for this plan
 * @param dom - Current DOM for context
 * @param url - Current URL
 * @param context - Tracking context
 * @returns Plan enhanced with contingencies
 */
export async function generateContingencies(
  plan: Plan,
  goal: string,
  dom: string,
  url: string,
  context: ContingencyGenerationContext
): Promise<ConditionalPlan> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return {
      ...plan,
      contingencies: [],
      hasContingencies: false,
    }
  }

  const startTime = Date.now()
  const model = DEFAULT_PLANNING_MODEL

  try {

    const systemPrompt = `You are a web automation expert that anticipates failure scenarios.

Given a plan with steps, generate CONTINGENCY handlers for common failure cases:

1. POPUP_DETECTED: Modal, cookie banner, survey, login prompt appears
2. ELEMENT_MISSING: Expected element not found (menu didn't expand, page not loaded)
3. ERROR_DISPLAYED: Form validation error, permission denied, timeout
4. FORM_VALIDATION: Required field missing, invalid format
5. URL_CHANGED: Unexpected navigation (redirect, session expired)

For each step that could fail, think:
- What popup might appear here?
- What if the element isn't visible?
- What error might occur?

Respond with JSON array of contingencies. Be specific to the domain and steps.`

    const userPrompt = `Plan Goal: ${goal}
URL: ${url}

Steps:
${plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join("\n")}

DOM Preview (for context):
${dom.substring(0, 3000)}

Generate contingencies for likely failure scenarios. Focus on:
- Popup/modal handlers (cookie banners, surveys, login prompts)
- Missing element fallbacks
- Error recovery actions

Respond with JSON:
{
  "contingencies": [
    {
      "id": "string",
      "condition": {
        "type": "POPUP_DETECTED" | "ELEMENT_MISSING" | "ERROR_DISPLAYED" | "FORM_VALIDATION" | "URL_CHANGED",
        "pattern": "regex or text to match",
        "selector": "element selector if relevant",
        "textMatch": "text to look for",
        "description": "when this applies"
      },
      "actions": [
        {
          "type": "CLICK" | "WAIT" | "SCROLL" | "SKIP_STEP" | "RESUME_MAIN",
          "target": "element description",
          "description": "what this does"
        }
      ],
      "priority": 1-10
    }
  ]
}`

    const result = await generateWithGemini(systemPrompt, userPrompt, {
      model,
      temperature: 0.5,
      maxOutputTokens: 1500,
      thinkingLevel: "high",
      responseJsonSchema: CONTINGENCY_RESPONSE_SCHEMA,
      generationName: "contingency_generation",
      sessionId: context.sessionId,
      userId: context.userId,
      tags: ["planning", "contingency"],
      metadata: { goal, stepCount: plan.steps.length },
    })

    const durationMs = Date.now() - startTime
    const content = result?.content

    if (result?.promptTokens != null) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        langfuseTraceId: context.langfuseTraceId,
        provider: "google",
        model,
        actionType: "CONTINGENCY_CHECK",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        durationMs,
        metadata: { goal, stepCount: plan.steps.length },
      }).catch(console.error)
    }

    if (!content) {
      return { ...plan, contingencies: [], hasContingencies: false }
    }

    const parsed = JSON.parse(content) as { contingencies: Contingency[] }
    const contingencies = validateContingencies(parsed.contingencies || [])

    console.log(
      `[ConditionalPlanning] Generated ${contingencies.length} contingencies for plan "${goal}" (${durationMs}ms)`
    )

    return {
      ...plan,
      contingencies,
      hasContingencies: contingencies.length > 0,
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "conditional-planning", operation: "generateContingencies" },
      extra: { goal },
    })
    console.error("[ConditionalPlanning] Error generating contingencies:", error)

    // Return plan without contingencies on error
    return { ...plan, contingencies: [], hasContingencies: false }
  }
}

// =============================================================================
// Contingency Matching
// =============================================================================

/**
 * Check if any contingency matches the current failure state
 *
 * @param contingencies - Available contingencies
 * @param failureContext - Current failure context
 * @returns Match result
 */
export function checkContingencies(
  contingencies: Contingency[],
  failureContext: {
    errorMessage?: string
    errorType?: string
    dom: string
    url: string
    expectedElement?: string
  }
): ContingencyCheckResult {
  if (contingencies.length === 0) {
    return { matched: false, reason: "No contingencies defined" }
  }

  // Sort by priority (highest first)
  const sorted = [...contingencies].sort((a, b) => b.priority - a.priority)

  for (const contingency of sorted) {
    const { condition } = contingency

    // Check condition based on type
    let matched = false

    switch (condition.type) {
      case "POPUP_DETECTED":
        matched = checkPopupCondition(condition, failureContext.dom)
        break

      case "ELEMENT_MISSING":
        matched = checkElementMissingCondition(
          condition,
          failureContext.dom,
          failureContext.expectedElement
        )
        break

      case "ERROR_DISPLAYED":
        matched = checkErrorCondition(
          condition,
          failureContext.errorMessage,
          failureContext.dom
        )
        break

      case "FORM_VALIDATION":
        matched = checkFormValidationCondition(condition, failureContext.dom)
        break

      case "URL_CHANGED":
        matched = checkUrlCondition(condition, failureContext.url)
        break

      case "CUSTOM":
        matched = checkCustomCondition(condition, failureContext)
        break
    }

    if (matched) {
      console.log(
        `[ConditionalPlanning] Contingency matched: ${contingency.id} (${condition.description})`
      )
      return {
        matched: true,
        contingency,
        suggestedActions: contingency.actions,
        reason: condition.description,
      }
    }
  }

  return {
    matched: false,
    reason: "No contingency conditions matched current state",
  }
}

// =============================================================================
// Condition Checkers
// =============================================================================

function checkPopupCondition(condition: ContingencyCondition, dom: string): boolean {
  // Common popup indicators
  const popupPatterns = [
    /role="dialog"/i,
    /class="[^"]*modal[^"]*"/i,
    /class="[^"]*popup[^"]*"/i,
    /class="[^"]*overlay[^"]*"/i,
    /aria-modal="true"/i,
  ]

  // Check if popup pattern exists
  const hasPopup = popupPatterns.some((p) => p.test(dom))
  if (!hasPopup) return false

  // If specific pattern provided, check for it
  if (condition.pattern) {
    try {
      const regex = new RegExp(condition.pattern, "i")
      return regex.test(dom)
    } catch {
      return dom.toLowerCase().includes(condition.pattern.toLowerCase())
    }
  }

  // If text match provided
  if (condition.textMatch) {
    return dom.toLowerCase().includes(condition.textMatch.toLowerCase())
  }

  return hasPopup
}

function checkElementMissingCondition(
  condition: ContingencyCondition,
  dom: string,
  expectedElement?: string
): boolean {
  const target = condition.selector || condition.textMatch || expectedElement
  if (!target) return false

  // Check if element is NOT in DOM
  const isPresent = dom.toLowerCase().includes(target.toLowerCase())
  return !isPresent
}

function checkErrorCondition(
  condition: ContingencyCondition,
  errorMessage?: string,
  dom?: string
): boolean {
  const target = condition.textMatch || condition.pattern

  if (errorMessage && target) {
    if (errorMessage.toLowerCase().includes(target.toLowerCase())) {
      return true
    }
  }

  if (dom && target) {
    // Check for error indicators in DOM
    const errorPatterns = [
      /class="[^"]*error[^"]*"/i,
      /class="[^"]*alert[^"]*"/i,
      /role="alert"/i,
    ]
    const hasError = errorPatterns.some((p) => p.test(dom))
    if (hasError && dom.toLowerCase().includes(target.toLowerCase())) {
      return true
    }
  }

  return false
}

function checkFormValidationCondition(condition: ContingencyCondition, dom: string): boolean {
  // Check for validation error indicators
  const validationPatterns = [
    /aria-invalid="true"/i,
    /class="[^"]*invalid[^"]*"/i,
    /class="[^"]*validation[^"]*error/i,
    /:invalid/i,
  ]

  const hasValidationError = validationPatterns.some((p) => p.test(dom))

  if (condition.textMatch) {
    return hasValidationError && dom.toLowerCase().includes(condition.textMatch.toLowerCase())
  }

  return hasValidationError
}

function checkUrlCondition(condition: ContingencyCondition, url: string): boolean {
  if (condition.pattern) {
    try {
      const regex = new RegExp(condition.pattern, "i")
      return regex.test(url)
    } catch {
      return url.toLowerCase().includes(condition.pattern.toLowerCase())
    }
  }
  return false
}

function checkCustomCondition(
  condition: ContingencyCondition,
  context: { dom: string; url: string; errorMessage?: string }
): boolean {
  // Custom conditions check all fields
  if (condition.pattern) {
    try {
      const regex = new RegExp(condition.pattern, "i")
      return regex.test(context.dom) || regex.test(context.url)
    } catch {
      return false
    }
  }
  return false
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Validate and sanitize contingencies from LLM
 */
function validateContingencies(contingencies: unknown[]): Contingency[] {
  if (!Array.isArray(contingencies)) return []

  return contingencies
    .filter((c): c is Contingency => {
      if (!c || typeof c !== "object") return false
      const cont = c as Contingency
      return (
        typeof cont.id === "string" &&
        cont.condition &&
        typeof cont.condition.type === "string" &&
        Array.isArray(cont.actions)
      )
    })
    .map((c, i) => ({
      ...c,
      id: c.id || `contingency_${i}`,
      priority: typeof c.priority === "number" ? c.priority : 5,
      actions: c.actions.map((a) => ({
        type: a.type || "CLICK",
        target: a.target,
        params: a.params,
        description: a.description || "",
      })),
    }))
}

/**
 * Convert contingency actions to executable action strings
 *
 * @param actions - Contingency actions
 * @param dom - Current DOM for element resolution
 * @returns Executable action strings
 */
export function convertContingencyActionsToExecutable(
  actions: ContingencyAction[],
  dom: string
): string[] {
  return actions
    .filter((a) => a.type !== "SKIP_STEP" && a.type !== "RESUME_MAIN")
    .map((action) => {
      switch (action.type) {
        case "CLICK":
          // Try to find element ID from description
          const clickMatch = findElementIdByDescription(action.target || "", dom)
          return clickMatch ? `click(${clickMatch})` : null

        case "WAIT":
          return `wait(${action.params?.duration || 1000})`

        case "SCROLL":
          const scrollMatch = findElementIdByDescription(action.target || "", dom)
          return scrollMatch ? `scrollTo(${scrollMatch})` : null

        default:
          return null
      }
    })
    .filter((a): a is string => a !== null)
}

/**
 * Find element ID by description in DOM
 */
function findElementIdByDescription(description: string, dom: string): string | null {
  if (!description) return null

  const normalized = description.toLowerCase()

  // Try to find element with matching text content or aria-label
  // This is a simplified version - in production, you'd want more robust matching
  const patterns = [
    new RegExp(`\\[(\\d+)\\][^\\[]*${escapeRegex(normalized)}`, "i"),
    new RegExp(`aria-label="[^"]*${escapeRegex(normalized)}[^"]*"[^>]*\\[(\\d+)\\]`, "i"),
  ]

  for (const pattern of patterns) {
    const match = dom.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
