import * as Sentry from "@sentry/nextjs"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import { classifyActionType, type ActionType } from "./action-type"
import { getTracedOpenAIWithConfig } from "@/lib/observability"
import { recordUsage } from "@/lib/cost"

/**
 * Verification Engine (Task 7)
 *
 * Compares expected vs actual state after each action.
 * Performs DOM-based checks and semantic verification to determine if actions achieved their expected outcomes.
 */

/**
 * Context for cost tracking (optional)
 */
export interface VerificationContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
}

/**
 * Actual state extracted from DOM
 */
export interface ActualState {
  domSnapshot: string // Current DOM
  url: string // Current URL
  extractedText?: string // Key text from page
  elementStates?: Array<{
    selector: string
    exists: boolean
    text?: string
  }>
}

/**
 * DOM-based check results
 */
export interface DOMCheckResults {
  elementExists?: boolean // If elementShouldExist was specified
  elementNotExists?: boolean // If elementShouldNotExist was specified
  elementTextMatches?: boolean // If elementShouldHaveText was specified
  urlChanged?: boolean // If urlShouldChange was specified
  attributeChanged?: boolean // If attributeChanges was specified (for popup elements)
  elementsAppeared?: boolean // If elementsToAppear was specified (for popup verification)
}

/**
 * Phase 3 Task 3: Next-goal verification result
 */
export interface NextGoalCheckResult {
  available: boolean // Whether the next-goal element/state is available
  reason: string // Explanation
  required: boolean // Whether it was required (failure vs warning)
}

/**
 * Verification result
 */
export interface VerificationResult {
  success: boolean // Whether verification passed
  confidence: number // Confidence score (0-1)
  expectedState: ExpectedOutcome
  actualState: ActualState
  comparison: {
    domChecks?: DOMCheckResults
    semanticMatch?: boolean // LLM-based semantic verification result
    overallMatch: boolean // Overall match result
    nextGoalCheck?: NextGoalCheckResult // Phase 3 Task 3: Look-ahead result
  }
  reason: string // Explanation of verification result
}

/**
 * Extract actual state from DOM
 */
function extractActualState(dom: string, url: string): ActualState {
  // Extract key text from DOM (first 500 chars of visible text)
  const textMatch = dom.match(/<[^>]*>([^<]+)<\/[^>]*>/g)
  const extractedText = textMatch
    ? textMatch
        .slice(0, 10)
        .map((match) => match.replace(/<[^>]*>/g, ""))
        .join(" ")
        .substring(0, 500)
    : undefined

  return {
    domSnapshot: dom,
    url,
    extractedText,
  }
}

/**
 * Detect if expected outcome describes a dropdown/popup open (not navigation).
 * For popups we use relaxed verification: url same + aria-expanded + menu-like content.
 */
function isPopupExpectation(domChanges: NonNullable<ExpectedOutcome["domChanges"]>): boolean {
  const urlSame = domChanges.urlShouldChange === false
  const hasExpanded = domChanges.attributeChanges?.some(
    (c) => c.attribute === "aria-expanded" && c.expectedValue === "true"
  )
  const hasMenuHint = (domChanges.elementsToAppear?.length ?? 0) > 0 || hasExpanded
  return Boolean(urlSame && hasMenuHint)
}

/**
 * Perform DOM-based checks
 */
function performDOMChecks(
  expectedOutcome: ExpectedOutcome,
  actualState: ActualState,
  previousUrl?: string,
  actionType?: ActionType
): DOMCheckResults {
  const results: DOMCheckResults = {}
  const dom = actualState.domSnapshot
  const domChanges = expectedOutcome.domChanges
  if (!domChanges) return results

  const isPopupFromOutcome = isPopupExpectation(domChanges)
  const isPopup = isPopupFromOutcome || actionType === "dropdown"

  // For popup/dropdown: only run urlChanged, attributeChanged, elementsToAppear. Skip strict checks.
  if (!isPopup && domChanges.elementShouldExist) {
    const selector = domChanges.elementShouldExist
    const exists =
      dom.includes(`id="${selector}"`) ||
      dom.includes(`id='${selector}'`) ||
      dom.includes(`class="${selector}"`) ||
      dom.includes(`class='${selector}'`) ||
      dom.includes(`<${selector}`)
    results.elementExists = exists
  }

  if (domChanges.elementShouldNotExist && !isPopup) {
    const selector = domChanges.elementShouldNotExist
    const notExists =
      !dom.includes(`id="${selector}"`) &&
      !dom.includes(`id='${selector}'`) &&
      !dom.includes(`class="${selector}"`) &&
      !dom.includes(`class='${selector}'`) &&
      !dom.includes(`<${selector}`)
    results.elementNotExists = notExists
  }

  if (domChanges.elementShouldHaveText && !isPopup) {
    const { selector, text } = domChanges.elementShouldHaveText
    const elementRegex = new RegExp(`<[^>]*${selector}[^>]*>([\\s\\S]*?)<\\/[^>]*>`, "i")
    const match = dom.match(elementRegex)
    const elementText = match?.[1] || ""
    results.elementTextMatches = elementText.includes(text)
  }

  // Check if URL should change
  if (domChanges.urlShouldChange !== undefined && previousUrl !== undefined) {
    const urlChanged = actualState.url !== previousUrl
    results.urlChanged = domChanges.urlShouldChange ? urlChanged : !urlChanged
  }

  // CRITICAL FIX: Check attribute changes (for popup/dropdown elements)
  if (domChanges.attributeChanges && domChanges.attributeChanges.length > 0) {
    const expandedChange = domChanges.attributeChanges.find(
      (change) => change.attribute === "aria-expanded" && change.expectedValue === "true"
    )
    if (expandedChange) {
      const hasExpanded = dom.includes('aria-expanded="true"') || dom.includes("aria-expanded='true'")
      results.attributeChanged = hasExpanded
    }
  }

  // CRITICAL FIX: Check if new elements appeared (for popup/dropdown verification)
  // Accept role "list" or "listitem" (common for menus) in addition to "menuitem"
  if (domChanges.elementsToAppear && domChanges.elementsToAppear.length > 0) {
    const hasMenuItems = domChanges.elementsToAppear.some((expected) => {
      if (expected.role) {
        const roleRegex = new RegExp(`role=["']?${expected.role}["']?`, "i")
        if (roleRegex.test(dom)) return true
        // Fallback: menuitem often rendered as list/listitem
        if (expected.role === "menuitem" && (/role=["']?list["']?/i.test(dom) || /role=["']?listitem["']?/i.test(dom)))
          return true
      }
      if (expected.selector) return dom.includes(expected.selector)
      return false
    })
    results.elementsAppeared = hasMenuItems
  }

  return results
}

/**
 * Perform semantic verification using LLM
 */
async function performSemanticVerification(
  expectedOutcome: ExpectedOutcome,
  actualState: ActualState,
  previousUrl?: string,
  context?: VerificationContext
): Promise<{ match: boolean; reason: string }> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  // Use traced OpenAI client for LangFuse observability
  const openai = getTracedOpenAIWithConfig({
    generationName: "semantic_verification",
    sessionId: context?.sessionId,
    userId: context?.userId,
    tags: ["verification"],
    metadata: {
      expectedDescription: expectedOutcome.description,
    },
  })

  // Use lightweight model for semantic verification
  const model = process.env.VERIFICATION_MODEL || "gpt-4o-mini"
  const startTime = Date.now()

  const systemPrompt = `You are a verification AI that checks if an action achieved its expected outcome.

Your job is to analyze:
1. What was expected to happen (expected outcome)
2. What actually happened (current page state)
3. Determine if the expected outcome was achieved

**CRITICAL: Use user-friendly, non-technical language in the "reason" field.**

Respond with a JSON object:
{
  "match": true/false,
  "reason": "User-friendly explanation of why it matches or doesn't match (avoid technical terms like 'verification failed', 'element not found', 'DOM structure', etc.)"
}

**Language Guidelines:**
- ❌ AVOID: "Verification failed", "Element not found", "DOM structure mismatch", "Element ID 123 does not exist"
- ✅ USE: "The button didn't appear", "The form didn't open as expected", "The page loaded successfully", "The text field is now visible"`


  const expectedDescription = expectedOutcome.description || "No specific description provided"
  const domPreview = actualState.domSnapshot.length > 5000
    ? actualState.domSnapshot.substring(0, 5000) + "... [truncated]"
    : actualState.domSnapshot

  const userPrompt = `Expected Outcome:
${expectedDescription}

Current Page State:
- URL: ${actualState.url}
${previousUrl ? `- Previous URL: ${previousUrl}` : ""}
- Key Text: ${actualState.extractedText || "Not extracted"}
- Page Structure Preview: ${domPreview.substring(0, 2000)}

Determine if the expected outcome was achieved based on the current page state.

Remember: Write the "reason" in user-friendly language. If the action didn't work, explain what the user would observe (e.g., "the button didn't appear" instead of "element not found"). If it worked, describe what the user would see (e.g., "the form is now open" instead of "verification successful").`

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent verification
      max_tokens: 500,
      response_format: { type: "json_object" },
    })

    const durationMs = Date.now() - startTime
    const content = response.choices[0]?.message?.content

    // Track cost (dual-write to MongoDB + LangFuse)
    if (context?.tenantId && context?.userId && response.usage) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        provider: "openai",
        model,
        actionType: "VERIFICATION",
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        durationMs,
        metadata: {
          expectedDescription: expectedOutcome.description,
        },
      }).catch((err: unknown) => {
        console.error("[Verification] Cost tracking error:", err)
      })
    }

    if (!content) {
      return { match: false, reason: "Empty LLM response" }
    }

    try {
      const result = JSON.parse(content) as { match?: boolean; reason?: string }
      return {
        match: result.match ?? false,
        reason: result.reason || "No reason provided",
      }
    } catch {
      // If JSON parsing fails, try to extract from text
      const match = content.toLowerCase().includes("match") && content.toLowerCase().includes("true")
      return {
        match,
        reason: content.substring(0, 200),
      }
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    // On error, return neutral result
    return {
      match: false,
      reason: error instanceof Error ? error.message : "Verification error",
    }
  }
}

/**
 * Phase 3 Task 3: Check if next-goal element/state is available
 *
 * Performs look-ahead verification to catch issues before the next step.
 */
function checkNextGoalAvailability(
  nextGoal: NonNullable<ExpectedOutcome["nextGoal"]>,
  dom: string
): NextGoalCheckResult {
  let available = false
  const checkResults: string[] = []
  
  // Check by selector
  if (nextGoal.selector) {
    // Check for ID selector
    if (nextGoal.selector.startsWith("#")) {
      const id = nextGoal.selector.substring(1)
      available = dom.includes(`id="${id}"`) || dom.includes(`id='${id}'`)
      checkResults.push(`selector(${nextGoal.selector}): ${available ? "found" : "not found"}`)
    }
    // Check for class selector
    else if (nextGoal.selector.startsWith(".")) {
      const className = nextGoal.selector.substring(1)
      available = dom.includes(`class="${className}"`) ||
                  dom.includes(`class='${className}'`) ||
                  dom.includes(` ${className} `) ||
                  dom.includes(` ${className}"`) ||
                  dom.includes(` ${className}'`)
      checkResults.push(`selector(${nextGoal.selector}): ${available ? "found" : "not found"}`)
    }
    // Check for tag selector
    else {
      available = dom.toLowerCase().includes(`<${nextGoal.selector.toLowerCase()}`)
      checkResults.push(`selector(${nextGoal.selector}): ${available ? "found" : "not found"}`)
    }
  }
  
  // Check by text content (if not already found)
  if (!available && nextGoal.textContent) {
    available = dom.includes(nextGoal.textContent)
    checkResults.push(`text("${nextGoal.textContent}"): ${available ? "found" : "not found"}`)
  }
  
  // Check by ARIA role (if not already found)
  if (!available && nextGoal.role) {
    const roleRegex = new RegExp(`role=["']?${nextGoal.role}["']?`, "i")
    available = roleRegex.test(dom)
    checkResults.push(`role(${nextGoal.role}): ${available ? "found" : "not found"}`)
  }
  
  // If no specific checks but has description, assume available (can't verify)
  if (checkResults.length === 0 && nextGoal.description) {
    available = true
    checkResults.push("no specific selector/text/role to verify")
  }
  
  const reason = available
    ? `Next-goal available: ${nextGoal.description} (${checkResults.join(", ")})`
    : `Next-goal NOT available: ${nextGoal.description} (${checkResults.join(", ")})`
  
  return {
    available,
    reason,
    required: nextGoal.required,
  }
}

/**
 * Calculate confidence score
 *
 * Weighted: DOM checks 40%, Semantic verification 60%
 */
function calculateConfidence(
  domChecks: DOMCheckResults,
  semanticMatch: boolean
): number {
  let domScore = 0
  let domCount = 0

  // Calculate DOM check score
  if (domChecks.elementExists !== undefined) {
    domScore += domChecks.elementExists ? 1 : 0
    domCount++
  }
  if (domChecks.elementNotExists !== undefined) {
    domScore += domChecks.elementNotExists ? 1 : 0
    domCount++
  }
  if (domChecks.elementTextMatches !== undefined) {
    domScore += domChecks.elementTextMatches ? 1 : 0
    domCount++
  }
  if (domChecks.urlChanged !== undefined) {
    domScore += domChecks.urlChanged ? 1 : 0
    domCount++
  }
  // CRITICAL FIX: Include popup/dropdown verification in score
  if (domChecks.attributeChanged !== undefined) {
    domScore += domChecks.attributeChanged ? 1 : 0
    domCount++
  }
  if (domChecks.elementsAppeared !== undefined) {
    domScore += domChecks.elementsAppeared ? 1 : 0
    domCount++
  }

  const domAverage = domCount > 0 ? domScore / domCount : 0.5 // Default to neutral if no DOM checks
  const semanticScore = semanticMatch ? 1 : 0

  // Weighted average: DOM 40%, Semantic 60%
  const confidence = domAverage * 0.4 + semanticScore * 0.6

  return Math.max(0, Math.min(1, confidence)) // Clamp to [0, 1]
}

/**
 * Verify if action achieved expected outcome
 *
 * @param expectedOutcome - What was expected to happen
 * @param currentDom - Current DOM after action
 * @param currentUrl - Current URL after action
 * @param previousUrl - Previous URL before action (optional, for URL change check)
 * @param previousAction - The action that was executed (e.g. "click(68)") for action-type-aware verification
 * @param context - Cost tracking context (optional)
 * @returns Verification result
 */
export async function verifyAction(
  expectedOutcome: ExpectedOutcome,
  currentDom: string,
  currentUrl: string,
  previousUrl?: string,
  previousAction?: string,
  context?: VerificationContext
): Promise<VerificationResult> {
  const actualState = extractActualState(currentDom, currentUrl)
  const actionType =
    previousAction !== undefined ? classifyActionType(previousAction, currentDom) : undefined

  const domChecks = performDOMChecks(expectedOutcome, actualState, previousUrl, actionType)

  const domChanges = expectedOutcome.domChanges
  const isPopupFromOutcome = domChanges ? isPopupExpectation(domChanges) : false
  const isDropdown = isPopupFromOutcome || actionType === "dropdown"

  // Skip LLM semantic verification for dropdown; use DOM-only. Saves cost and avoids false negatives.
  const semanticResult = isDropdown
    ? { match: true, reason: "Skipped (dropdown); DOM checks only." }
    : await performSemanticVerification(expectedOutcome, actualState, previousUrl, context)

  // Calculate confidence score
  let confidence = calculateConfidence(domChecks, semanticResult.match)

  // Popup override: dropdown opened = url same + aria-expanded. Don't fail on strict element checks.
  const isPopup = isDropdown
  const urlSame =
    domChanges?.urlShouldChange === false &&
    (previousUrl !== undefined ? domChecks.urlChanged === true : true)
  const expandedOk = domChecks.attributeChanged === true
  if (isPopup && urlSame && expandedOk) {
    confidence = Math.max(confidence, 0.75)
  }

  // Determine success (confidence >= 0.7 threshold)
  const success = confidence >= 0.7

  // Phase 3 Task 3: Check next-goal availability (look-ahead verification)
  let nextGoalCheck: NextGoalCheckResult | undefined
  if (expectedOutcome.nextGoal) {
    nextGoalCheck = checkNextGoalAvailability(expectedOutcome.nextGoal, actualState.domSnapshot)
    
    // If next-goal is required and not available, reduce confidence significantly
    if (!nextGoalCheck.available && nextGoalCheck.required) {
      confidence = Math.min(confidence, 0.5) // Cap confidence at 50% if next-goal missing
    }
  }

  // Re-evaluate success after next-goal check
  // Success requires both: previous action verified (confidence >= 0.7) AND next-goal available (if required)
  const nextGoalOk = !nextGoalCheck || nextGoalCheck.available || !nextGoalCheck.required
  const finalSuccess = confidence >= 0.7 && nextGoalOk

  // Build comparison object
  const comparison = {
    domChecks,
    semanticMatch: semanticResult.match,
    overallMatch: finalSuccess,
    nextGoalCheck,
  }

  // Build reason
  const reasonParts: string[] = []
  if (domChecks.elementExists !== undefined) {
    reasonParts.push(`Element existence: ${domChecks.elementExists ? "✓" : "✗"}`)
  }
  if (domChecks.elementNotExists !== undefined) {
    reasonParts.push(`Element not present: ${domChecks.elementNotExists ? "✓" : "✗"}`)
  }
  if (domChecks.elementTextMatches !== undefined) {
    reasonParts.push(`Element text match: ${domChecks.elementTextMatches ? "✓" : "✗"}`)
  }
  if (domChecks.urlChanged !== undefined) {
    reasonParts.push(`URL changed: ${domChecks.urlChanged ? "✓" : "✗"}`)
  }
  if (domChecks.attributeChanged !== undefined) {
    reasonParts.push(`Attribute changed (popup): ${domChecks.attributeChanged ? "✓" : "✗"}`)
  }
  if (domChecks.elementsAppeared !== undefined) {
    reasonParts.push(`Menu items appeared: ${domChecks.elementsAppeared ? "✓" : "✗"}`)
  }
  reasonParts.push(`Semantic match: ${semanticResult.match ? "✓" : "✗"}`)
  
  // Add next-goal check result
  if (nextGoalCheck) {
    const nextGoalStatus = nextGoalCheck.available ? "✓" : (nextGoalCheck.required ? "✗" : "⚠")
    reasonParts.push(`Next-goal: ${nextGoalStatus}`)
  }
  
  reasonParts.push(`Confidence: ${(confidence * 100).toFixed(1)}%`)
  reasonParts.push(`Overall: ${semanticResult.reason}`)

  const reason = reasonParts.join(" | ")

  return {
    success: finalSuccess,
    confidence,
    expectedState: expectedOutcome,
    actualState,
    comparison,
    reason,
  }
}
