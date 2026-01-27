import { OpenAI } from "openai"
import * as Sentry from "@sentry/nextjs"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import { classifyActionType, type ActionType } from "./action-type"

/**
 * Verification Engine (Task 7)
 *
 * Compares expected vs actual state after each action.
 * Performs DOM-based checks and semantic verification to determine if actions achieved their expected outcomes.
 */

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
  previousUrl?: string
): Promise<{ match: boolean; reason: string }> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  const openai = new OpenAI({
    apiKey,
  })

  // Use lightweight model for semantic verification
  const model = process.env.VERIFICATION_MODEL || "gpt-4o-mini"

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

    const content = response.choices[0]?.message?.content

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
 * @returns Verification result
 */
export async function verifyAction(
  expectedOutcome: ExpectedOutcome,
  currentDom: string,
  currentUrl: string,
  previousUrl?: string,
  previousAction?: string
): Promise<VerificationResult> {
  const actualState = extractActualState(currentDom, currentUrl)
  const actionType =
    previousAction !== undefined ? classifyActionType(previousAction, currentDom) : undefined

  const domChecks = performDOMChecks(expectedOutcome, actualState, previousUrl, actionType)

  // Perform semantic verification
  const semanticResult = await performSemanticVerification(
    expectedOutcome,
    actualState,
    previousUrl
  )

  // Calculate confidence score
  let confidence = calculateConfidence(domChecks, semanticResult.match)

  // Popup override: dropdown opened = url same + aria-expanded. Don't fail on strict element checks.
  const domChanges = expectedOutcome.domChanges
  const isPopupFromOutcome = domChanges ? isPopupExpectation(domChanges) : false
  const isPopup = isPopupFromOutcome || actionType === "dropdown"
  const urlSame =
    domChanges?.urlShouldChange === false &&
    (previousUrl !== undefined ? domChecks.urlChanged === true : true)
  const expandedOk = domChecks.attributeChanged === true
  if (isPopup && urlSame && expandedOk) {
    confidence = Math.max(confidence, 0.75)
  }

  // Determine success (confidence >= 0.7 threshold)
  const success = confidence >= 0.7

  // Build comparison object
  const comparison = {
    domChecks,
    semanticMatch: semanticResult.match,
    overallMatch: success,
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
  reasonParts.push(`Confidence: ${(confidence * 100).toFixed(1)}%`)
  reasonParts.push(`Overall: ${semanticResult.reason}`)

  const reason = reasonParts.join(" | ")

  return {
    success,
    confidence,
    expectedState: expectedOutcome,
    actualState,
    comparison,
    reason,
  }
}
