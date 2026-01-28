/**
 * Re-Planning Engine (Phase 3 - Task 2)
 *
 * Validates plan health when URL or DOM changes significantly.
 * Uses a fast "Plan Validator" LLM call to determine if remaining
 * steps can still be executed, and regenerates the plan if needed.
 */

import * as Sentry from "@sentry/nextjs"
import type { TaskPlan, PlanStep } from "@/lib/models/task"
import { getTracedOpenAIWithConfig } from "@/lib/observability"
import { recordUsage } from "@/lib/cost"
import { shouldTriggerReplanning, type DomSimilarityResult } from "./dom-similarity"

/**
 * Context for cost tracking
 */
export interface ReplanningContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
}

/**
 * Input for plan validation
 */
export interface PlanValidationInput {
  /** Current DOM snapshot */
  currentDom: string
  /** Current URL */
  currentUrl: string
  /** Previous DOM snapshot (before action) */
  previousDom: string
  /** Previous URL (before action) */
  previousUrl: string
  /** Current task plan */
  plan: TaskPlan
  /** Original user query */
  originalQuery: string
  /** DOM similarity threshold (default: 0.7) */
  similarityThreshold?: number
}

/**
 * Plan validation result
 */
export interface PlanValidationResult {
  /** Whether validation was triggered */
  validationTriggered: boolean
  /** Whether current plan is still valid */
  planValid: boolean
  /** Reason for validation result */
  reason: string
  /** Suggested modifications to plan steps */
  suggestedChanges?: string[]
  /** New plan if regeneration is needed */
  newPlan?: TaskPlan
  /** Whether re-planning occurred */
  rePlanning: boolean
  /** Trigger reasons (URL change, DOM similarity, etc.) */
  triggerReasons: string[]
  /** DOM similarity result (if calculated) */
  domSimilarity?: DomSimilarityResult
}

/**
 * LLM response schema for plan validation
 */
interface PlanValidatorResponse {
  valid: boolean
  reason: string
  suggestedChanges?: string[]
  needsFullReplan?: boolean
}

/**
 * Get remaining steps from current plan
 */
function getRemainingSteps(plan: TaskPlan): PlanStep[] {
  return plan.steps.filter((step) => step.index >= plan.currentStepIndex)
}

/**
 * Summarize DOM for prompt (extract key elements)
 */
function summarizeDom(dom: string, maxLength = 3000): string {
  // Extract forms
  const formMatches = dom.match(/<form[^>]*>[\s\S]*?<\/form>/gi) || []
  const formSummary = formMatches.length > 0
    ? `Forms (${formMatches.length}): ${formMatches.map((f) => {
        const idMatch = f.match(/id=["']([^"']+)["']/i)
        const nameMatch = f.match(/name=["']([^"']+)["']/i)
        return idMatch?.[1] || nameMatch?.[1] || "unnamed"
      }).join(", ")}`
    : "No forms"
  
  // Extract buttons
  const buttonMatches = dom.match(/<button[^>]*>[\s\S]*?<\/button>/gi) || []
  const buttonTexts = buttonMatches.slice(0, 10).map((b) => {
    const text = b.replace(/<[^>]*>/g, "").trim().substring(0, 30)
    return text || "(icon button)"
  })
  const buttonSummary = buttonTexts.length > 0
    ? `Buttons: ${buttonTexts.join(", ")}`
    : "No buttons"
  
  // Extract inputs
  const inputMatches = dom.match(/<input[^>]*>/gi) || []
  const inputTypes = inputMatches.slice(0, 10).map((i) => {
    const typeMatch = i.match(/type=["']([^"']+)["']/i)
    const nameMatch = i.match(/name=["']([^"']+)["']/i)
    const placeholderMatch = i.match(/placeholder=["']([^"']+)["']/i)
    return `${typeMatch?.[1] || "text"}:${nameMatch?.[1] || placeholderMatch?.[1] || "unnamed"}`
  })
  const inputSummary = inputTypes.length > 0
    ? `Inputs: ${inputTypes.join(", ")}`
    : "No inputs"
  
  // Extract links
  const linkMatches = dom.match(/<a[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || []
  const linkTexts = linkMatches.slice(0, 10).map((l) => {
    const text = l.replace(/<[^>]*>/g, "").trim().substring(0, 30)
    return text || "(icon link)"
  })
  const linkSummary = linkTexts.length > 0
    ? `Links: ${linkTexts.join(", ")}`
    : "No links"
  
  // Extract headings
  const headingMatches = dom.match(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi) || []
  const headingTexts = headingMatches.slice(0, 5).map((h) => {
    return h.replace(/<[^>]*>/g, "").trim().substring(0, 50)
  })
  const headingSummary = headingTexts.length > 0
    ? `Headings: ${headingTexts.join(", ")}`
    : "No headings"
  
  const summary = [
    headingSummary,
    formSummary,
    buttonSummary,
    inputSummary,
    linkSummary,
  ].join("\n")
  
  return summary.substring(0, maxLength)
}

/**
 * Validate plan against current page state using fast LLM call
 */
async function validatePlanWithLLM(
  remainingSteps: PlanStep[],
  domSummary: string,
  currentUrl: string,
  previousUrl: string,
  triggerReasons: string[],
  context?: ReplanningContext
): Promise<PlanValidatorResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  
  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }
  
  // Use traced OpenAI client
  const openai = getTracedOpenAIWithConfig({
    generationName: "plan_validation",
    sessionId: context?.sessionId,
    userId: context?.userId,
    tags: ["replanning", "validation"],
    metadata: {
      previousUrl,
      currentUrl,
      triggerReasons,
      stepCount: remainingSteps.length,
    },
  })
  
  // Use fast model for plan validation
  const model = process.env.PLAN_VALIDATOR_MODEL || "gpt-4o-mini"
  const startTime = Date.now()
  
  const systemPrompt = `You are a plan validator that checks if an action plan can still be executed on the current page.

Your job is to:
1. Review the remaining steps in the plan
2. Check if the current page state supports these steps
3. Determine if the plan is still valid or needs modification

Respond with JSON:
{
  "valid": true/false,
  "reason": "Brief explanation of why the plan is valid or invalid",
  "suggestedChanges": ["Change step 2 to...", "Skip step 3 because..."],  // optional
  "needsFullReplan": true/false  // Set true if plan cannot be salvaged with modifications
}

Guidelines:
- A plan is VALID if the current page still has the elements/forms/buttons needed for the remaining steps
- A plan is INVALID if critical elements are missing or the page has changed to a different state
- Use "suggestedChanges" for minor adjustments that can save the plan
- Use "needsFullReplan" only if the page has changed so much that starting over is better`

  const userPrompt = `Re-planning Triggers:
${triggerReasons.map((r) => `- ${r}`).join("\n")}

URL Change:
- Previous: ${previousUrl}
- Current: ${currentUrl}

Current Page State:
${domSummary}

Remaining Plan Steps:
${remainingSteps.map((s, i) => `${i + 1}. [${s.status}] ${s.description}`).join("\n")}

Can these remaining steps still be executed on the current page?`

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
    
    // Track cost
    if (context?.tenantId && context?.userId && response.usage) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        provider: "openai",
        model,
        actionType: "PLAN_VALIDATION",
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        durationMs,
        metadata: {
          triggerReasons,
          stepCount: remainingSteps.length,
        },
      }).catch((err: unknown) => {
        console.error("[ReplanningEngine] Cost tracking error:", err)
      })
    }
    
    if (!content) {
      return {
        valid: false,
        reason: "Empty LLM response",
        needsFullReplan: true,
      }
    }
    
    const result = JSON.parse(content) as PlanValidatorResponse
    return result
  } catch (error: unknown) {
    Sentry.captureException(error)
    return {
      valid: false,
      reason: error instanceof Error ? error.message : "Validation error",
      needsFullReplan: true,
    }
  }
}

/**
 * Check if plan validation should be triggered and validate if needed
 *
 * @param input - Plan validation input
 * @param context - Cost tracking context
 * @returns Plan validation result
 */
export async function validatePlanHealth(
  input: PlanValidationInput,
  context?: ReplanningContext
): Promise<PlanValidationResult> {
  const threshold = input.similarityThreshold ?? 0.7
  
  // Check if re-planning should be triggered
  const triggerCheck = shouldTriggerReplanning(
    input.previousDom,
    input.currentDom,
    input.previousUrl,
    input.currentUrl,
    threshold
  )
  
  // If no trigger conditions met, plan is valid
  if (!triggerCheck.shouldReplan) {
    return {
      validationTriggered: false,
      planValid: true,
      reason: "No significant changes detected; plan remains valid",
      rePlanning: false,
      triggerReasons: [],
      domSimilarity: triggerCheck.domSimilarity,
    }
  }
  
  // Get remaining steps
  const remainingSteps = getRemainingSteps(input.plan)
  
  if (remainingSteps.length === 0) {
    return {
      validationTriggered: true,
      planValid: true,
      reason: "No remaining steps to validate",
      rePlanning: false,
      triggerReasons: triggerCheck.reasons,
      domSimilarity: triggerCheck.domSimilarity,
    }
  }
  
  // Summarize current DOM for LLM
  const domSummary = summarizeDom(input.currentDom)
  
  // Validate plan with LLM
  const validationResult = await validatePlanWithLLM(
    remainingSteps,
    domSummary,
    input.currentUrl,
    input.previousUrl,
    triggerCheck.reasons,
    context
  )
  
  return {
    validationTriggered: true,
    planValid: validationResult.valid,
    reason: validationResult.reason,
    suggestedChanges: validationResult.suggestedChanges,
    rePlanning: !validationResult.valid,
    triggerReasons: triggerCheck.reasons,
    domSimilarity: triggerCheck.domSimilarity,
    // If full replan needed, newPlan will be generated by planning engine
    // This is indicated by needsFullReplan flag
    newPlan: validationResult.needsFullReplan ? undefined : undefined,
  }
}

/**
 * Apply suggested changes to plan (if modifications can save it)
 *
 * @param plan - Current plan
 * @param suggestedChanges - LLM-suggested changes
 * @returns Modified plan or null if changes can't be applied
 */
export function applyPlanModifications(
  plan: TaskPlan,
  suggestedChanges: string[]
): TaskPlan | null {
  if (!suggestedChanges || suggestedChanges.length === 0) {
    return null
  }
  
  // Create a copy of the plan
  const modifiedPlan: TaskPlan = {
    ...plan,
    steps: plan.steps.map((step) => ({ ...step })),
  }
  
  // Parse and apply suggested changes
  for (const change of suggestedChanges) {
    const changeLower = change.toLowerCase()
    
    // Handle "skip step N" suggestions
    const skipMatch = changeLower.match(/skip step (\d+)/i)
    if (skipMatch) {
      const stepIndex = parseInt(skipMatch[1] || "0", 10) - 1 // Convert to 0-indexed
      const step = modifiedPlan.steps.find((s) => s.index === stepIndex)
      if (step) {
        step.status = "completed" // Mark as completed to skip
        step.description = `[SKIPPED] ${step.description}`
      }
    }
    
    // Handle "change step N to..." suggestions
    const changeMatch = changeLower.match(/change step (\d+) to (.+)/i)
    if (changeMatch) {
      const stepIndex = parseInt(changeMatch[1] || "0", 10) - 1
      const newDescription = changeMatch[2] || ""
      const step = modifiedPlan.steps.find((s) => s.index === stepIndex)
      if (step && newDescription) {
        step.description = newDescription
        step.reasoning = `Modified: ${change}`
      }
    }
  }
  
  return modifiedPlan
}

/**
 * Determine the appropriate re-planning action
 *
 * @param validationResult - Result from plan validation
 * @returns Action to take: 'continue', 'modify', or 'regenerate'
 */
export function determineReplanAction(
  validationResult: PlanValidationResult
): "continue" | "modify" | "regenerate" {
  if (validationResult.planValid) {
    return "continue"
  }
  
  if (validationResult.suggestedChanges && validationResult.suggestedChanges.length > 0) {
    // Check if modifications are minor enough to apply
    const minorModifications = validationResult.suggestedChanges.every((c) => {
      const lower = c.toLowerCase()
      return lower.includes("skip") || lower.includes("adjust") || lower.includes("change step")
    })
    
    if (minorModifications) {
      return "modify"
    }
  }
  
  return "regenerate"
}
