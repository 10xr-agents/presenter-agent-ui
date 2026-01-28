/**
 * Semantic verification via LLM: full-DOM path and observation-only path.
 * @see docs/VERIFICATION_PROCESS.md
 */

import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import { getTracedOpenAIWithConfig } from "@/lib/observability"
import {
  extractTextContent,
  getSmartDomContext,
  hasSignificantUrlChange,
} from "@/lib/utils/dom-helpers"
import { logger } from "@/lib/utils/logger"
import type { ActualState, VerificationContext } from "./types"

/**
 * Semantic verification result with confidence
 */
export interface SemanticVerificationResult {
  match: boolean
  reason: string
  confidence: number
}

/**
 * Perform semantic verification using LLM with smart context windowing (full DOM).
 */
export async function performSemanticVerification(
  expectedOutcome: ExpectedOutcome,
  actualState: ActualState,
  previousUrl?: string,
  context?: VerificationContext
): Promise<SemanticVerificationResult> {
  const log = logger.child({
    process: "Verification",
    sessionId: context?.sessionId,
    taskId: context?.taskId ?? "",
  })
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  const openai = getTracedOpenAIWithConfig({
    generationName: "semantic_verification",
    sessionId: context?.sessionId,
    userId: context?.userId,
    tags: ["verification"],
    metadata: { expectedDescription: expectedOutcome.description },
  })

  const model = process.env.VERIFICATION_MODEL || "gpt-4o-mini"
  const startTime = Date.now()

  const systemPrompt = `You are a verification AI that checks if an action achieved its expected outcome.

Your job is to analyze:
1. What was expected to happen (expected outcome)
2. The URL change (did it navigate as expected?)
3. The current page content
4. Determine if the expected outcome was achieved

**CRITICAL: Use user-friendly, non-technical language in the "reason" field.**

Respond with a JSON object:
{
  "match": true/false,
  "confidence": 0.0-1.0,
  "reason": "User-friendly explanation of why it matches or doesn't match"
}

**Verification Guidelines:**
- If URL changed and expected outcome mentions navigation, that's a strong positive signal
- Ignore minor ID/class mismatches if the visual content matches
- Focus on semantic meaning, not exact HTML structure
- If the page content clearly shows the expected state, return match: true

**Language Guidelines:**
- ❌ AVOID: "Verification failed", "Element not found", "DOM structure mismatch"
- ✅ USE: "The page navigated to the overview section", "The form is now visible", "The menu opened successfully"`

  const expectedDescription = expectedOutcome.description || "No specific description provided"
  const searchTarget =
    expectedOutcome.domChanges?.elementShouldExist ||
    expectedOutcome.domChanges?.elementShouldHaveText?.text ||
    expectedDescription.substring(0, 50)

  const domContext = getSmartDomContext(actualState.domSnapshot, searchTarget, 8000)
  const textContent = extractTextContent(actualState.domSnapshot, 1500)
  const urlChanged = previousUrl ? hasSignificantUrlChange(previousUrl, actualState.url) : false
  const urlChangeInfo = previousUrl
    ? `- URL Changed: ${urlChanged ? "Yes" : "No"} (${previousUrl} → ${actualState.url})`
    : `- Current URL: ${actualState.url}`

  const userPrompt = `**Expected Outcome:**
${expectedDescription}

**URL Status:**
${urlChangeInfo}

**Current Page State:**
- Visible Text Content: ${textContent || "Not extracted"}

**Page Structure (cleaned HTML):**
${domContext}

**Task:** Determine if the expected outcome was achieved based on:
1. Did the URL change as expected (if navigation was expected)?
2. Does the page content match what was expected?
3. Is the expected element/section visible?

Remember: Focus on whether the user would see the expected result. Ignore technical details like exact element IDs.`

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
    })

    const durationMs = Date.now() - startTime
    const content = response.choices[0]?.message?.content

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
        metadata: { expectedDescription: expectedOutcome.description },
      }).catch((err: unknown) => {
        log.error("Cost tracking error", err)
      })
    }

    if (!content) {
      return { match: false, reason: "Empty LLM response", confidence: 0 }
    }

    try {
      const result = JSON.parse(content) as { match?: boolean; reason?: string; confidence?: number }
      return {
        match: result.match ?? false,
        reason: result.reason || "No reason provided",
        confidence: result.confidence ?? (result.match ? 1.0 : 0.0),
      }
    } catch {
      const match = content.toLowerCase().includes("match") && content.toLowerCase().includes("true")
      return {
        match,
        reason: content.substring(0, 200),
        confidence: match ? 0.7 : 0.3,
      }
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    return {
      match: false,
      reason: error instanceof Error ? error.message : "Verification error",
      confidence: 0,
    }
  }
}

/**
 * Semantic verdict from LLM using only observation list (no full DOM).
 */
export async function performSemanticVerificationOnObservations(
  userGoal: string,
  action: string,
  observations: string[],
  context?: VerificationContext
): Promise<SemanticVerificationResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { match: false, reason: "OpenAI API key not configured", confidence: 0 }
  }

  const openai = getTracedOpenAIWithConfig({
    generationName: "verification_observation",
    sessionId: context?.sessionId,
    userId: context?.userId,
    tags: ["verification", "observation"],
  })

  const model = process.env.VERIFICATION_MODEL || "gpt-4o-mini"
  const prompt = `You are a verification AI. The user wanted to achieve a goal. An action was executed. We observed specific changes. Decide if the action succeeded.

**User goal:** ${userGoal}

**Action executed:** ${action}

**Observed changes (facts):**
${observations.map((o) => `- ${o}`).join("\n")}

**Task:** Did these observed changes indicate that the user's goal was achieved? Answer with JSON only:
{"match": true/false, "confidence": 0.0-1.0, "reason": "Brief explanation"}

Guidelines:
- If URL changed and the goal was navigation (e.g. "go to overview"), that's a strong success signal.
- If page content updated and the goal was to see new content, that's a success signal.
- If nothing changed (URL same, DOM same, no network), the action likely failed.
- Be decisive: high confidence when observations clearly support success or failure.`

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
    })
    const content = response.choices[0]?.message?.content
    if (!content) {
      return { match: false, reason: "Empty response", confidence: 0 }
    }
    const parsed = JSON.parse(content) as { match?: boolean; reason?: string; confidence?: number }
    return {
      match: parsed.match ?? false,
      reason: parsed.reason ?? "No reason",
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
    }
  } catch (err: unknown) {
    Sentry.captureException(err)
    return { match: false, reason: "Verification error", confidence: 0 }
  }
}
