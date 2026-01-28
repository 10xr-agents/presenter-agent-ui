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

/**
 * Parse LLM JSON response into SemanticVerificationResult.
 * Supports new schema (action_succeeded, task_completed) and legacy (match only).
 * Used by performSemanticVerification and performSemanticVerificationOnObservations.
 */
export function parseSemanticVerificationResponse(
  content: string,
  expectSubTaskCompleted?: boolean
): SemanticVerificationResult {
  const obj = JSON.parse(content) as {
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
      return {
        action_succeeded: false,
        task_completed: false,
        match: false,
        reason: "Empty LLM response",
        confidence: 0,
      }
    }

    try {
      const parsed = parseSemanticVerificationResponse(content)
      const confidence = parsed.confidence ?? (parsed.match ? 1.0 : 0.0)
      return { ...parsed, confidence }
    } catch {
      // Deterministic: do not infer from free text. Default to false so routing never
      // treats malformed LLM response as goal achieved.
      return {
        action_succeeded: false,
        task_completed: false,
        match: false,
        reason: content.substring(0, 200),
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
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return {
      action_succeeded: false,
      task_completed: false,
      match: false,
      reason: "OpenAI API key not configured",
      confidence: 0,
    }
  }

  const openai = getTracedOpenAIWithConfig({
    generationName: "verification_observation",
    sessionId: context?.sessionId,
    userId: context?.userId,
    tags: ["verification", "observation"],
  })

  const model = process.env.VERIFICATION_MODEL || "gpt-4o-mini"
  const subTaskBlock =
    subTaskObjective != null
      ? `

**Current sub-task objective (Phase 4):** ${subTaskObjective}
- **sub_task_completed**: true only when this sub-task objective is achieved (e.g. form opened for "Open patient form", patient saved for "Save patient"). Set false until that sub-task is done.`
      : ""

  const jsonFields =
    subTaskObjective != null
      ? '{"action_succeeded": true/false, "task_completed": true/false, "sub_task_completed": true/false, "confidence": 0.0-1.0, "reason": "Brief explanation"}'
      : '{"action_succeeded": true/false, "task_completed": true/false, "confidence": 0.0-1.0, "reason": "Brief explanation"}'

  const prompt = `You are a verification AI. The user wanted to achieve a goal. An action was executed. We observed specific changes. Decide two things: (1) did this action do something useful? (2) is the entire user goal done?${subTaskObjective != null ? " (3) Is the current sub-task objective achieved?" : ""}

**User goal:** ${userGoal}

**Action executed:** ${action}

**Observed changes (facts):**
${observations.map((o) => `- ${o}`).join("\n")}
${subTaskBlock}

**Task:** Answer with JSON only:
${jsonFields}

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
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
      response_format: { type: "json_object" },
    })
    const content = response.choices[0]?.message?.content
    if (!content) {
      return {
        action_succeeded: false,
        task_completed: false,
        match: false,
        reason: "Empty response",
        confidence: 0,
      }
    }
    try {
      return parseSemanticVerificationResponse(content, subTaskObjective != null)
    } catch {
      return {
        action_succeeded: false,
        task_completed: false,
        match: false,
        reason: content.substring(0, 200),
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
