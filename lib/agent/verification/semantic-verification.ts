/**
 * Semantic verification via LLM: full-DOM path and observation-only path.
 * Task 4: Explicit step-level vs task-level in prompt — contract and example.
 * @see docs/VERIFICATION_PROCESS.md
 */

import * as Sentry from "@sentry/nextjs"

/** Task 4: Explicit step-level vs task-level contract text. Used in both prompts so LLM sets task_completed only when entire goal is done. */
export const STEP_TASK_LEVEL_CONTRACT =
  "task_completed = true ONLY when the entire user request is done; for multi-step tasks, set task_completed = false until the final step is done."

/** Task 4: Example for multi-step — "Add patient" form open = step succeeded but task not complete. */
export const STEP_TASK_LEVEL_EXAMPLE =
  'Example: user goal "Add a patient named Jas" → Step 1 (form opened): action_succeeded = true, task_completed = false. Final step (Save clicked, success): action_succeeded = true, task_completed = true.'

import { recordUsage } from "@/lib/cost"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import {
  getField,
  isParseSuccess,
  parseStructuredResponse,
} from "@/lib/llm/parse-structured-response"
import { VERIFICATION_RESPONSE_SCHEMA } from "@/lib/llm/response-schemas"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import {
  extractTextContent,
  getSmartDomContext,
  hasSignificantUrlChange,
} from "@/lib/utils/dom-helpers"
import { logger } from "@/lib/utils/logger"
import type { ActualState, VerificationContext } from "./types"

/**
 * Semantic verification result with confidence.
 * action_succeeded: did this action do something useful (e.g. form opened)?
 * task_completed: is the entire user goal done (e.g. form submitted)?
 * sub_task_completed: Phase 4 Task 9 — when subTaskObjective provided, did current sub-task objective succeed?
 * match: kept for backward compat; equals task_completed for goal semantics.
 */
export interface SemanticVerificationResult {
  action_succeeded: boolean
  task_completed: boolean
  /** Phase 4 Task 9: present only when subTaskObjective was provided. */
  sub_task_completed?: boolean
  match: boolean
  reason: string
  confidence: number
}

/** Expected shape from VERIFICATION_RESPONSE_SCHEMA structured output. */
interface VerificationLLMResponse {
  action_succeeded?: boolean
  task_completed?: boolean
  sub_task_completed?: boolean
  confidence?: number
  reason?: string
}

/**
 * Extract the last JSON object from content (for responses that include "Thought: ... { } Answer: { }").
 * Balances braces from the last "}" backward so we get the final answer object, not thinking.
 */
function extractLastJsonObject(content: string): string | null {
  const lastClose = content.lastIndexOf("}")
  if (lastClose === -1) return null
  let depth = 1
  let i = lastClose - 1
  while (i >= 0 && depth > 0) {
    const c = content[i]
    if (c === "}") depth++
    else if (c === "{") depth--
    i--
  }
  if (depth !== 0) return null
  const start = i + 1
  return content.slice(start, lastClose + 1)
}

/**
 * Extract a JSON object string from raw LLM content.
 * Handles: raw JSON, markdown code blocks (```json ... ```), and leading/trailing text (e.g. thought summaries).
 * When multiple JSON objects or code blocks exist (e.g. thought then answer), uses the LAST one as the final verdict.
 */
function extractJsonFromVerificationContent(content: string): string {
  const trimmed = content.trim()
  const firstBrace = trimmed.indexOf("{")
  if (firstBrace === -1) {
    throw new Error("No JSON object found in response")
  }
  // When there are multiple code blocks (e.g. thought in first, answer in last), use the last block.
  const allCodeBlocks = trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)
  const blocks = [...allCodeBlocks]
  const lastBlock = blocks.length > 0 ? blocks[blocks.length - 1]?.[1]?.trim() : null
  if (lastBlock && lastBlock.indexOf("{") !== -1) {
    // Single code block may contain two JSON objects (thought + answer); take the last one so we get the verdict.
    const lastInBlock = extractLastJsonObject(lastBlock)
    if (lastInBlock) return lastInBlock
    return lastBlock
  }
  // If content has multiple JSON objects (e.g. thought then answer, no code blocks), use the last one.
  const lastJson = extractLastJsonObject(trimmed)
  if (lastJson) {
    return lastJson
  }
  // Fallback: first { to last } (single object or legacy format).
  const lastBrace = trimmed.lastIndexOf("}")
  if (lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  throw new Error("No JSON object found in response")
}

/**
 * Parse LLM JSON response into SemanticVerificationResult.
 * Supports new schema (action_succeeded, task_completed) and legacy (match only).
 * Extracts JSON from raw content (thought summaries, markdown) before parsing.
 * Used by performSemanticVerification and performSemanticVerificationOnObservations.
 */
export function parseSemanticVerificationResponse(
  content: string,
  expectSubTaskCompleted?: boolean
): SemanticVerificationResult {
  const jsonStr = extractJsonFromVerificationContent(content)
  const obj = JSON.parse(jsonStr) as {
    action_succeeded?: boolean
    task_completed?: boolean
    sub_task_completed?: boolean
    match?: boolean
    reason?: string
    confidence?: number
  }
  const action_succeeded = obj.action_succeeded ?? obj.match ?? false
  const task_completed = obj.task_completed ?? obj.match ?? false
  const sub_task_completed =
    expectSubTaskCompleted === true ? (obj.sub_task_completed ?? false) : undefined
  const confidence = Math.max(0, Math.min(1, obj.confidence ?? 0.5))
  return {
    action_succeeded,
    task_completed,
    sub_task_completed,
    match: task_completed,
    reason: obj.reason ?? "No reason",
    confidence,
  }
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
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("GEMINI_API_KEY not configured"))
    throw new Error("Gemini API key not configured")
  }

  const model = DEFAULT_PLANNING_MODEL
  const startTime = Date.now()

  const systemPrompt = `You are a verification AI that checks if an action achieved its expected outcome.

Your job is to analyze:
1. What was expected to happen (expected outcome)
2. The URL change (did it navigate as expected?)
3. The current page content
4. Two decisions: (1) did this action do something useful? (2) is the entire user goal done?

**CRITICAL: Use user-friendly, non-technical language in the "reason" field.**

Respond with a JSON object:
{
  "action_succeeded": true/false,
  "task_completed": true/false,
  "confidence": 0.0-1.0,
  "reason": "User-friendly explanation"
}

**Contract:**
- **action_succeeded**: true when this action did something useful (e.g. form opened, menu opened, page navigated). false when nothing useful happened.
- **task_completed**: true only when the **entire** user goal is done (e.g. form submitted and saved). For multi-step tasks, set task_completed false until the final step (e.g. form visible = action_succeeded true, task_completed false).

**Step-level vs task-level (Task 4):** ${STEP_TASK_LEVEL_CONTRACT} ${STEP_TASK_LEVEL_EXAMPLE}

**Verification Guidelines:**
- If URL changed and expected outcome mentions navigation → action_succeeded true; task_completed true only if that was the full goal.
- Ignore minor ID/class mismatches if the visual content matches.
- Focus on semantic meaning, not exact HTML structure.

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
    const result = await generateWithGemini(systemPrompt, userPrompt, {
      model,
      temperature: 0.3,
      maxOutputTokens: 500,
      useGoogleSearchGrounding: true,
      thinkingLevel: "high",
      generationName: "semantic_verification",
      sessionId: context?.sessionId,
      userId: context?.userId,
      tags: ["verification"],
      metadata: { expectedDescription: expectedOutcome.description },
      responseJsonSchema: VERIFICATION_RESPONSE_SCHEMA,
    })

    const durationMs = Date.now() - startTime
    const content = result?.content

    if (context?.tenantId && context?.userId && result?.promptTokens != null) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        langfuseTraceId: context.langfuseTraceId,
        provider: "google",
        model,
        actionType: "VERIFICATION",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        durationMs,
        metadata: { expectedDescription: expectedOutcome.description },
      }).catch((err: unknown) => {
        log.error("Cost tracking error", err)
      })
    }

    // Use safe structured response parser (handles edge cases like BOM, markdown fences, truncation)
    const parseResult = parseStructuredResponse<VerificationLLMResponse>(content, {
      generationName: "semantic_verification",
      taskId: context?.taskId,
      sessionId: context?.sessionId,
      schemaName: "VERIFICATION_RESPONSE_SCHEMA",
    })

    if (isParseSuccess(parseResult)) {
      const parsed = parseResult.data
      const action_succeeded = getField(parsed, "action_succeeded", false)
      const task_completed = getField(parsed, "task_completed", false)
      const confidence = getField(parsed, "confidence", task_completed ? 1.0 : 0)
      const reason = getField(parsed, "reason", "No reason")
      return {
        action_succeeded,
        task_completed,
        match: task_completed,
        reason,
        confidence: Math.max(0, Math.min(1, confidence)),
      }
    } else {
      // Parse failed - log diagnostics and return degraded result
      log.warn(
        `Structured output parse failed for semantic_verification: ${parseResult.error}`,
        parseResult.diagnostics
      )
      return {
        action_succeeded: false,
        task_completed: false,
        match: false,
        reason: `Parse error (${parseResult.diagnostics.issueType}): ${parseResult.rawContent.substring(0, 100)}`,
        confidence: 0.3,
      }
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    return {
      action_succeeded: false,
      task_completed: false,
      match: false,
      reason: error instanceof Error ? error.message : "Verification error",
      confidence: 0,
    }
  }
}

/**
 * Semantic verdict from LLM using only observation list (no full DOM).
 * When subTaskObjective is provided (Phase 4 Task 9), also asks for sub_task_completed.
 */
export async function performSemanticVerificationOnObservations(
  userGoal: string,
  action: string,
  observations: string[],
  context?: VerificationContext,
  subTaskObjective?: string
): Promise<SemanticVerificationResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      action_succeeded: false,
      task_completed: false,
      match: false,
      reason: "Gemini API key not configured",
      confidence: 0,
    }
  }

  const model = DEFAULT_PLANNING_MODEL
  const subTaskBlock =
    subTaskObjective != null
      ? `

**Current sub-task objective (Phase 4):** ${subTaskObjective}
- **sub_task_completed**: true only when this sub-task objective is achieved (e.g. form opened for "Open patient form", patient saved for "Save patient"). Set false until that sub-task is done.`
      : ""

  const prompt = `You are a verification AI. The user wanted to achieve a goal. An action was executed. We observed specific changes. Decide two things: (1) did this action do something useful? (2) is the entire user goal done?${subTaskObjective != null ? " (3) Is the current sub-task objective achieved?" : ""}

**User goal:** ${userGoal}

**Action executed:** ${action}

**Observed changes (facts):**
${observations.map((o) => `- ${o}`).join("\n")}
${subTaskBlock}

**Contract:**
- **action_succeeded**: true when this action did something useful (e.g. form opened, menu opened, page navigated). false when nothing useful happened (e.g. no change, wrong click).
- **task_completed**: true only when the **entire** user goal is done (e.g. form submitted and saved, user is on the final screen they asked for). For multi-step tasks (e.g. "Add a patient"), set task_completed false until the final step is done (e.g. form open = action_succeeded true, task_completed false).
- The system uses these fields deterministically for routing—do not rely on wording in "reason".

**Step-level vs task-level (Task 4):** ${STEP_TASK_LEVEL_CONTRACT} ${STEP_TASK_LEVEL_EXAMPLE}

Guidelines:
- If URL changed and the goal was navigation → action_succeeded true; task_completed true only if that was the full goal.
- If page content updated (e.g. form visible) but user goal requires more steps → action_succeeded true, task_completed false.
- If nothing changed → action_succeeded false, task_completed false.
- Be decisive: high confidence when observations clearly support success or failure.`

  try {
    const result = await generateWithGemini("", prompt, {
      model,
      temperature: 0.3,
      maxOutputTokens: 300,
      useGoogleSearchGrounding: true,
      thinkingLevel: "high",
      generationName: "verification_observation",
      sessionId: context?.sessionId,
      userId: context?.userId,
      tags: ["verification", "observation"],
      responseJsonSchema: VERIFICATION_RESPONSE_SCHEMA,
    })
    if (context?.tenantId && context?.userId && result?.promptTokens != null) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        langfuseTraceId: context.langfuseTraceId,
        provider: "google",
        model,
        actionType: "VERIFICATION",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        metadata: { generationName: "verification_observation" },
      }).catch((err: unknown) => {
        console.error("[SemanticVerification] Cost tracking error:", err)
      })
    }
    const content = result?.content

    // Use safe structured response parser (handles edge cases like BOM, markdown fences, truncation)
    const parseResult = parseStructuredResponse<VerificationLLMResponse>(content, {
      generationName: "verification_observation",
      taskId: context?.taskId,
      sessionId: context?.sessionId,
      schemaName: "VERIFICATION_RESPONSE_SCHEMA",
    })

    if (isParseSuccess(parseResult)) {
      const parsed = parseResult.data
      const action_succeeded = getField(parsed, "action_succeeded", false)
      const task_completed = getField(parsed, "task_completed", false)
      const confidence = Math.max(0, Math.min(1, getField(parsed, "confidence", 0.5)))
      const reason = getField(parsed, "reason", "No reason")
      const sub_task_completed =
        subTaskObjective != null ? getField(parsed, "sub_task_completed", false) : undefined
      return {
        action_succeeded,
        task_completed,
        sub_task_completed,
        match: task_completed,
        reason,
        confidence,
      }
    } else {
      // Parse failed - log diagnostics and return degraded result
      const log = logger.child({
        process: "SemanticVerification",
        sessionId: context?.sessionId,
        taskId: context?.taskId,
      })
      log.warn(
        `Structured output parse failed for verification_observation: ${parseResult.error}`,
        parseResult.diagnostics
      )
      return {
        action_succeeded: false,
        task_completed: false,
        match: false,
        reason: `Parse error (${parseResult.diagnostics.issueType}): ${parseResult.rawContent.substring(0, 100)}`,
        confidence: 0.3,
      }
    }
  } catch (err: unknown) {
    Sentry.captureException(err)
    return {
      action_succeeded: false,
      task_completed: false,
      match: false,
      reason: "Verification error",
      confidence: 0,
    }
  }
}
