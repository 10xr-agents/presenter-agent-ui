/**
 * Critic Engine (Phase 4 Task 1)
 *
 * Pre-execution reflection layer that validates action intent before
 * sending to the client. Catches logic errors server-side to avoid
 * wasted round-trips.
 *
 * Triggers:
 * - When action confidence < 0.9
 * - For high-risk actions (finish, fail)
 * - When verification failure context is present
 *
 * Flow:
 * 1. Receive generated action + context
 * 2. Fast LLM check: "Does this action make sense for this goal?"
 * 3. If No → return rejection with reason
 * 4. If Yes → pass through
 */

import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import { getTracedOpenAIWithConfig } from "@/lib/observability"

/**
 * Context for critic evaluation
 */
export interface CriticContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
}

/**
 * Input for critic evaluation
 */
export interface CriticInput {
  /** The goal/query the user wants to achieve */
  goal: string
  /** Current plan step description (if available) */
  planStep?: string
  /** The generated action (e.g., "click(123)") */
  action: string
  /** LLM reasoning/thought for the action */
  thought: string
  /** Target element description from DOM (if available) */
  elementDescription?: string
  /** Previous verification failure (if any) */
  previousFailure?: string
  /** Action confidence from generator (0-1) */
  confidence?: number
}

/**
 * Result of critic evaluation
 */
export interface CriticResult {
  /** Whether the action passed the critic check */
  approved: boolean
  /** Reason for rejection (if not approved) */
  reason?: string
  /** Suggested alternative approach (if not approved) */
  suggestion?: string
  /** Confidence in the critic's assessment (0-1) */
  confidence: number
  /** Time taken for critic evaluation */
  durationMs: number
}

/**
 * High-risk action names that always trigger critic (lowercase)
 */
const HIGH_RISK_ACTIONS = ["finish", "fail", "setvalue"]

/**
 * Confidence threshold below which critic is triggered
 */
const CONFIDENCE_THRESHOLD = 0.85

/**
 * Determine if critic should be triggered for this action
 *
 * @param action - The generated action string
 * @param confidence - Action confidence from generator (0-1)
 * @param hasVerificationFailure - Whether there was a previous failure
 * @returns Whether to run critic evaluation
 */
export function shouldTriggerCritic(
  action: string,
  confidence?: number,
  hasVerificationFailure?: boolean
): boolean {
  // Always trigger for high-risk actions
  const actionName = action.match(/^(\w+)\(/)?.[1]?.toLowerCase() || ""
  if (HIGH_RISK_ACTIONS.includes(actionName)) {
    return true
  }

  // Trigger if confidence is below threshold
  if (confidence !== undefined && confidence < CONFIDENCE_THRESHOLD) {
    return true
  }

  // Trigger if there was a recent verification failure
  if (hasVerificationFailure) {
    return true
  }

  return false
}

/**
 * Evaluate an action using the Critic model
 *
 * Uses a lightweight, fast model to validate that the generated action
 * makes semantic sense for the given goal and context.
 *
 * @param input - Critic input with action and context
 * @param context - Cost tracking context
 * @returns Critic evaluation result
 */
export async function evaluateAction(
  input: CriticInput,
  context?: CriticContext
): Promise<CriticResult> {
  const startTime = Date.now()
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    // Fail open - don't block action if API key missing
    return {
      approved: true,
      confidence: 0,
      durationMs: Date.now() - startTime,
      reason: "Critic skipped: API key not configured",
    }
  }

  // Use traced OpenAI client for LangFuse observability
  const openai = getTracedOpenAIWithConfig({
    generationName: "critic_evaluation",
    sessionId: context?.sessionId,
    userId: context?.userId,
    tags: ["critic", "validation"],
    metadata: {
      goal: input.goal,
      action: input.action,
      hasFailure: !!input.previousFailure,
    },
  })

  // Use lightweight model for fast evaluation
  const model = process.env.CRITIC_MODEL || "gpt-4o-mini"

  const systemPrompt = `You are a Critic AI that validates web automation actions before execution.

Your job is to check if a generated action MAKES SENSE for the user's goal.
You are NOT checking syntax - assume syntax is valid.
You are checking INTENT and LOGIC.

Common errors to catch:
1. Wrong field type (e.g., entering a date in a name field)
2. Wrong element (e.g., clicking "Cancel" when trying to submit)
3. Premature completion (e.g., calling finish() before all steps done)
4. Missing required actions (e.g., not filling required fields)
5. Out of order actions (e.g., clicking submit before filling form)

Respond in this exact format:
<Approved>YES|NO</Approved>
<Confidence>0.0-1.0</Confidence>
<Reason>Brief explanation if NO</Reason>
<Suggestion>Alternative approach if NO</Suggestion>

Be LENIENT - only reject if there's a clear logic error.
When uncertain, approve with lower confidence.`

  const userParts: string[] = [
    `User Goal: ${input.goal}`,
    "",
    `Generated Action: ${input.action}`,
    `LLM Reasoning: ${input.thought}`,
  ]

  if (input.planStep) {
    userParts.push(`Current Plan Step: ${input.planStep}`)
  }

  if (input.elementDescription) {
    userParts.push(`Target Element: ${input.elementDescription}`)
  }

  if (input.previousFailure) {
    userParts.push(`Previous Failure: ${input.previousFailure}`)
  }

  userParts.push("")
  userParts.push("Does this action make sense for the goal? Check for logic errors.")

  const userPrompt = userParts.join("\n")

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Low temperature for consistent evaluation
      max_tokens: 300,
    })

    const durationMs = Date.now() - startTime
    const content = response.choices[0]?.message?.content || ""

    // Parse response first (deterministic: approved from <Approved>YES|NO</Approved> only)
    const result = parseCriticResponse(content)
    result.durationMs = durationMs

    // Track cost
    if (context?.tenantId && context?.userId && response.usage) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        provider: "openai",
        model,
        actionType: "CRITIC",
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        durationMs,
        metadata: {
          goal: input.goal,
          action: input.action,
          approved: result.approved,
        },
      }).catch((err: unknown) => {
        console.error("[Critic] Cost tracking error:", err)
      })
    }

    if (!result.approved) {
      console.log(
        `[Critic] Action rejected: ${input.action} | Reason: ${result.reason} | Suggestion: ${result.suggestion}`
      )
    }

    return result
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "critic-engine" },
      extra: { goal: input.goal, action: input.action },
    })

    // Fail open - don't block action on error
    return {
      approved: true,
      confidence: 0,
      durationMs: Date.now() - startTime,
      reason: "Critic error - failing open",
    }
  }
}

/**
 * Parse critic LLM response.
 * Deterministic: approved is set only from <Approved>YES</Approved> or <Approved>NO</Approved>.
 * No fallback to free-text (e.g. "APPROVED>YES"); routing uses this boolean only.
 */
function parseCriticResponse(content: string): CriticResult {
  const approvedMatch = content.match(/<Approved>\s*(YES|NO)\s*<\/Approved>/i)
  const approved = approvedMatch?.[1]?.toUpperCase() === "YES"

  const confidenceMatch = content.match(/<Confidence>([\d.]+)<\/Confidence>/i)
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1] || "0.5") : 0.5

  const reasonMatch = content.match(/<Reason>([\s\S]*?)<\/Reason>/i)
  const reason = reasonMatch?.[1]?.trim() || undefined

  const suggestionMatch = content.match(/<Suggestion>([\s\S]*?)<\/Suggestion>/i)
  const suggestion = suggestionMatch?.[1]?.trim() || undefined

  return {
    approved,
    confidence: Math.min(1, Math.max(0, confidence)),
    reason: approved ? undefined : reason,
    suggestion: approved ? undefined : suggestion,
    durationMs: 0,
  }
}

/**
 * Run critic loop with retry on rejection
 *
 * If critic rejects the action, this function returns the rejection
 * so the caller can regenerate with the feedback.
 *
 * @param input - Critic input
 * @param context - Cost tracking context
 * @returns Critic result
 */
export async function runCriticLoop(
  input: CriticInput,
  context?: CriticContext
): Promise<CriticResult> {
  // Check if we should trigger critic
  if (!shouldTriggerCritic(input.action, input.confidence, !!input.previousFailure)) {
    return {
      approved: true,
      confidence: 1,
      durationMs: 0,
    }
  }

  console.log(`[Critic] Evaluating action: ${input.action}`)
  return evaluateAction(input, context)
}
