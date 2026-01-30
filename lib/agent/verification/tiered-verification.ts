/**
 * Tiered Verification Engine (Phase 5)
 *
 * Implements three-tier verification to reduce token usage:
 * - Tier 1 (Deterministic): Zero LLM tokens for unambiguous outcomes
 * - Tier 2 (Lightweight): ~50-100 tokens for simple final steps
 * - Tier 3 (Full LLM): Current implementation for complex cases
 *
 * Key insight: intermediate steps don't need semantic verification -
 * if we're on step 1 of 5, task_completed is FALSE by definition.
 *
 * @see docs/VERIFICATION_PROCESS.md - Phase 5
 */

import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import {
  parseStructuredResponse,
  isParseSuccess,
  getField,
} from "@/lib/llm/parse-structured-response"
import { VERIFICATION_RESPONSE_SCHEMA } from "@/lib/llm/response-schemas"
import type { HierarchicalPlan } from "@/lib/agent/hierarchical-planning"
import { getCurrentSubTask } from "@/lib/agent/hierarchical-planning"
import type { ActionType } from "@/lib/agent/action-type"
import type { ComplexityLevel } from "@/lib/agent/graph/types"
import type { TaskPlan } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import {
  hasSignificantUrlChange,
  isCrossDomainNavigation,
  getHostname,
} from "@/lib/utils/dom-helpers"
import { logger } from "@/lib/utils/logger"
import type { BeforeState, NextGoalCheckResult, VerificationContext } from "./types"

// =============================================================================
// Types
// =============================================================================

/** Verification tier used (for observability and cost tracking) */
export type VerificationTier = "deterministic" | "lightweight" | "full"

/**
 * Result from Tier 1 (deterministic) verification.
 * Returns null if no deterministic verdict is possible (fall through to Tier 2/3).
 */
export interface HeuristicResult {
  action_succeeded: boolean
  task_completed: boolean
  confidence: number
  reason: string
  tier: "deterministic"
  /** When true, bypass Tier 2/3 and route directly to Correction (hard failures) */
  routeToCorrection?: boolean
}

/**
 * Result from Tier 2 (lightweight LLM) verification.
 */
export interface LightweightResult {
  action_succeeded: boolean
  task_completed: boolean
  confidence: number
  reason: string
  tier: "lightweight"
}

/**
 * Options for tiered verification
 */
export interface TieredVerificationOptions {
  /** URL before action */
  beforeUrl: string
  /** URL after action */
  afterUrl: string
  /** The action that was executed */
  action: string
  /** Classified action type */
  actionType: ActionType
  /** Whether we're on the last step of the plan */
  isLastStep: boolean
  /** Whether DOM content changed meaningfully */
  meaningfulContentChange: boolean
  /** Task complexity classification */
  complexity: ComplexityLevel
  /** Look-ahead check result for next step element */
  nextGoalCheck?: NextGoalCheckResult
  /** Current plan (for step info) */
  plan?: TaskPlan
  /** Hierarchical plan if active */
  hierarchicalPlan?: HierarchicalPlan
  /** Expected outcome from planner */
  expectedOutcome?: ExpectedOutcome
  /** User's original goal */
  userGoal: string
  /** Observations from before/after comparison */
  observations: string[]
  /** Verification context for tracking */
  context?: VerificationContext
}

/** Expected shape from VERIFICATION_RESPONSE_SCHEMA structured output */
interface VerificationLLMResponse {
  action_succeeded?: boolean
  task_completed?: boolean
  confidence?: number
  reason?: string
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute isLastStep with hierarchical plan awareness.
 *
 * When hierarchical plan is active, checks if we're on the last step
 * of the current sub-task (not just the main plan).
 *
 * @param plan - Main task plan
 * @param hierarchicalPlan - Optional hierarchical plan
 * @returns true if on the last step of the current context
 */
export function computeIsLastStep(
  plan: TaskPlan | undefined,
  hierarchicalPlan?: HierarchicalPlan
): boolean {
  // If no plan at all, assume last step (conservative)
  if (!plan) return true

  // Check hierarchical plan first
  if (hierarchicalPlan) {
    const currentSubTask = getCurrentSubTask(hierarchicalPlan)
    if (currentSubTask) {
      // Within a sub-task: we use plan.currentStepIndex vs currentSubTask.estimatedSteps
      // Note: estimatedSteps is the expected count, not actual steps executed
      // For safety, we also check the main plan
      const mainPlanLastStep = plan.currentStepIndex >= plan.steps.length - 1
      // Sub-task awareness: if estimated steps is known, check against it
      // But we can't know the exact sub-task step index without additional tracking
      // For now, fall back to main plan's isLastStep
      return mainPlanLastStep
    }
  }

  // No hierarchy: check main plan
  return plan.currentStepIndex >= plan.steps.length - 1
}

// =============================================================================
// Tier 1: Deterministic Heuristics
// =============================================================================

/**
 * Tier 1: Try to verify action deterministically without any LLM call.
 *
 * Returns a result if the outcome is unambiguous:
 * - Intermediate navigation: action_succeeded=true, task_completed=false
 * - Intermediate DOM change: action_succeeded=true, task_completed=false
 * - Look-ahead failure: action_succeeded=false, routeToCorrection=true
 * - Look-ahead success: action_succeeded=true, task_completed=false
 * - SIMPLE navigation: action_succeeded=true, task_completed=true
 *
 * Returns null if no deterministic verdict is possible → fall through to Tier 2/3.
 *
 * @param options - Tiered verification options
 * @returns HeuristicResult or null
 */
export function tryDeterministicVerification(
  options: TieredVerificationOptions
): HeuristicResult | null {
  const {
    beforeUrl,
    afterUrl,
    actionType,
    isLastStep,
    meaningfulContentChange,
    complexity,
    nextGoalCheck,
  } = options

  const log = logger.child({
    process: "Verification:Tier1",
    sessionId: options.context?.sessionId,
    taskId: options.context?.taskId,
  })

  const urlChanged = hasSignificantUrlChange(beforeUrl, afterUrl)
  const crossDomain = isCrossDomainNavigation(beforeUrl, afterUrl)

  // CHECK 1.1: Intermediate Navigation Success
  // If we're NOT on the last step and navigation succeeded, we KNOW task_completed=false
  if (actionType === "navigation" && urlChanged && !isLastStep) {
    log.info(
      `Tier 1 Check 1.1: Intermediate navigation success (${getHostname(beforeUrl)} → ${getHostname(afterUrl)})`
    )
    return {
      action_succeeded: true,
      task_completed: false, // Deterministic: not last step
      confidence: 1.0,
      reason: "Deterministic: Navigation successful for intermediate step.",
      tier: "deterministic",
    }
  }

  // CHECK 1.2: Intermediate DOM Interaction Success
  // Meaningful content change on non-final step = action worked, task not done
  if (meaningfulContentChange && !isLastStep) {
    log.info("Tier 1 Check 1.2: Intermediate DOM change success")
    return {
      action_succeeded: true,
      task_completed: false, // Deterministic: not last step
      confidence: 0.95,
      reason: "Deterministic: Content changed as expected for intermediate step.",
      tier: "deterministic",
    }
  }

  // CHECK 1.3: Cross-Domain Navigation (any non-final step)
  // User is now on a completely different site
  if (crossDomain && !isLastStep) {
    log.info(
      `Tier 1 Check 1.3: Cross-domain navigation (${getHostname(beforeUrl)} → ${getHostname(afterUrl)})`
    )
    return {
      action_succeeded: true,
      task_completed: false,
      confidence: 1.0,
      reason: `Deterministic: Cross-domain navigation (${getHostname(beforeUrl)} → ${getHostname(afterUrl)}).`,
      tier: "deterministic",
    }
  }

  // CHECK 1.4: Look-Ahead Failure (Fast Fail → DIRECT to Correction)
  // If we expected an element for the next step and it's missing, fail fast
  // This is a HARD FAILURE that bypasses Tier 2/3
  if (nextGoalCheck && !nextGoalCheck.available && nextGoalCheck.required) {
    log.info(`Tier 1 Check 1.4: Look-ahead failure - ${nextGoalCheck.reason}`)
    return {
      action_succeeded: false,
      task_completed: false,
      confidence: 0.8,
      reason: `Deterministic failure: Expected element for next step not found. ${nextGoalCheck.reason}`,
      tier: "deterministic",
      routeToCorrection: true, // Bypass Tier 2/3, go direct to Correction
    }
  }

  // CHECK 1.5: Look-Ahead Success (Next Element Available)
  // If the element for the next step IS available, strong signal action succeeded
  if (nextGoalCheck?.available && !isLastStep) {
    log.info("Tier 1 Check 1.5: Look-ahead success - next element available")
    return {
      action_succeeded: true,
      task_completed: false,
      confidence: 0.95,
      reason: "Deterministic: Next step element is available (look-ahead success).",
      tier: "deterministic",
    }
  }

  // CHECK 1.6: SIMPLE Navigation (Single-Step Plan - Avoids "One-Step Trap")
  // For SIMPLE complexity tasks where navigation is the entire goal
  if (complexity === "SIMPLE" && actionType === "navigation" && urlChanged) {
    log.info("Tier 1 Check 1.6: SIMPLE navigation task completed")
    return {
      action_succeeded: true,
      task_completed: true, // SIMPLE task fully completed
      confidence: 1.0,
      reason: "Deterministic: SIMPLE navigation task completed (single-step plan).",
      tier: "deterministic",
    }
  }

  // No deterministic verdict possible → fall through to Tier 2 or 3
  log.debug("Tier 1: No deterministic verdict, falling through to Tier 2/3")
  return null
}

// =============================================================================
// Tier 2: Lightweight LLM
// =============================================================================

/**
 * Tier 2: Lightweight LLM verification for final steps or simple cases.
 *
 * Uses reduced configuration:
 * - thinkingLevel: "low" (vs "high")
 * - useGoogleSearchGrounding: false
 * - maxOutputTokens: 100 (vs 300)
 *
 * SAFETY GATE: Can only return task_completed=true for:
 * - complexity === "SIMPLE"
 * - OR actionType === "navigation" && expectedOutcome.urlShouldChange
 *
 * Returns null if safety gate blocks task_completed → fall through to Tier 3.
 *
 * @param options - Tiered verification options
 * @returns LightweightResult or null
 */
export async function performLightweightVerification(
  options: TieredVerificationOptions
): Promise<LightweightResult | null> {
  const {
    userGoal,
    action,
    observations,
    complexity,
    actionType,
    expectedOutcome,
    context,
  } = options

  const log = logger.child({
    process: "Verification:Tier2",
    sessionId: context?.sessionId,
    taskId: context?.taskId,
  })

  // SAFETY GATE: Determine if Tier 2 is allowed to return task_completed=true
  const tier2AllowedForTaskComplete =
    complexity === "SIMPLE" ||
    (actionType === "navigation" &&
      expectedOutcome?.domChanges?.urlShouldChange === true)

  // Simplified prompt for final-step confirmation
  const prompt = `You are a verification AI. Quick check only.

User goal: ${userGoal}
Action: ${action}
Observations:
${observations.map((o) => `- ${o}`).join("\n")}

Is the user's goal fully achieved? Reply JSON only:
{"action_succeeded": true/false, "task_completed": true/false, "confidence": 0.0-1.0, "reason": "brief"}`

  const model = DEFAULT_PLANNING_MODEL
  const startTime = Date.now()

  try {
    const result = await generateWithGemini("", prompt, {
      model,
      temperature: 0,
      maxOutputTokens: 100, // Reduced from 300
      thinkingLevel: "low", // Reduced from "high"
      useGoogleSearchGrounding: false, // Disabled (not needed for verification)
      responseJsonSchema: VERIFICATION_RESPONSE_SCHEMA,
      generationName: "verification_lightweight",
      sessionId: context?.sessionId,
      userId: context?.userId,
      tags: ["verification", "lightweight", "tier2"],
    })

    const durationMs = Date.now() - startTime

    // Record usage
    if (context?.tenantId && context?.userId && result?.promptTokens != null) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        langfuseTraceId: context.langfuseTraceId,
        provider: "google",
        model,
        actionType: "VERIFICATION_LIGHTWEIGHT",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        durationMs,
        metadata: { tier: "lightweight" },
      }).catch((err: unknown) => {
        log.error("Cost tracking error", err)
      })
    }

    // Parse result using safe parser
    const parseResult = parseStructuredResponse<VerificationLLMResponse>(
      result?.content,
      {
        schemaName: "VERIFICATION_RESPONSE_SCHEMA",
        generationName: "verification_lightweight",
        sessionId: context?.sessionId,
        taskId: context?.taskId,
      }
    )

    if (!isParseSuccess(parseResult)) {
      log.warn("Tier 2 parse failed, falling through to Tier 3")
      return null // Fall through to Tier 3
    }

    const verificationResult = parseResult.data
    const action_succeeded = getField(verificationResult, "action_succeeded", false)
    const task_completed = getField(verificationResult, "task_completed", false)
    const confidence = Math.max(
      0,
      Math.min(1, getField(verificationResult, "confidence", 0.7))
    )
    const reason = getField(verificationResult, "reason", "Lightweight verification")

    // SAFETY CHECK: If Tier 2 returned task_completed=true but not allowed, reject
    if (task_completed && !tier2AllowedForTaskComplete) {
      log.warn(
        `Tier 2 returned task_completed=true for non-SIMPLE goal (complexity=${complexity}); falling through to Tier 3`,
        { actionType, hasExpectedOutcome: !!expectedOutcome }
      )
      return null // Fall through to Tier 3 for proper verification
    }

    log.info(
      `Tier 2 result: action_succeeded=${action_succeeded}, task_completed=${task_completed}, confidence=${confidence.toFixed(2)}`
    )

    return {
      action_succeeded,
      task_completed,
      confidence,
      reason,
      tier: "lightweight",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "tiered-verification", tier: "lightweight" },
    })
    log.error("Tier 2 verification error, falling through to Tier 3", error)
    return null // Fall through to Tier 3
  }
}

// =============================================================================
// Tier Orchestration
// =============================================================================

/**
 * Orchestrate tiered verification: Tier 1 → Tier 2 → Tier 3.
 *
 * This function is called by the main verification engine to determine
 * which tier should handle verification.
 *
 * @param options - Tiered verification options
 * @returns Tier result with tier indicator, or null to proceed to Tier 3 (full LLM)
 */
export async function runTieredVerification(
  options: TieredVerificationOptions
): Promise<(HeuristicResult | LightweightResult) | null> {
  const log = logger.child({
    process: "Verification:Tiered",
    sessionId: options.context?.sessionId,
    taskId: options.context?.taskId,
  })

  // TIER 1: Deterministic heuristics (zero tokens)
  const tier1Result = tryDeterministicVerification(options)
  if (tier1Result !== null) {
    log.info(`Tiered verification: Tier 1 (deterministic) - ${tier1Result.reason}`)
    return tier1Result
  }

  // TIER 2: Lightweight LLM (only for final steps)
  if (options.isLastStep) {
    const tier2Result = await performLightweightVerification(options)
    if (tier2Result !== null) {
      log.info(
        `Tiered verification: Tier 2 (lightweight) - ${tier2Result.reason}`
      )
      return tier2Result
    }
  }

  // Fall through to Tier 3 (full LLM) - handled by caller
  log.info("Tiered verification: Falling through to Tier 3 (full LLM)")
  return null
}

/**
 * Estimate tokens saved by using tiered verification.
 *
 * Used for cost tracking and ROI measurement.
 *
 * @param tier - The tier that was used
 * @returns Estimated tokens saved vs full LLM
 */
export function estimateTokensSaved(tier: VerificationTier): number {
  // Average full LLM verification uses ~400 tokens
  const FULL_LLM_TOKENS = 400

  switch (tier) {
    case "deterministic":
      return FULL_LLM_TOKENS // 100% savings
    case "lightweight":
      return FULL_LLM_TOKENS - 100 // ~75% savings (100 tokens used)
    case "full":
      return 0 // No savings
  }
}
