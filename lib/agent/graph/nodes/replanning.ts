/**
 * Re-Planning Node (Phase 3 Task 2)
 *
 * Validates plan health when URL or DOM changes significantly.
 * Triggers re-planning if needed.
 *
 * Triggers:
 * - URL path changed
 * - DOM similarity < 70%
 * - Major structural changes detected
 *
 * On valid plan: Continue to next action
 * On invalid plan: Regenerate plan
 */

import * as Sentry from "@sentry/nextjs"
import { validatePlanHealth, applyPlanModifications, determineReplanAction } from "@/lib/agent/replanning-engine"
import { generatePlan } from "@/lib/agent/planning-engine"
import type { InteractGraphState, ReplanningResult } from "../types"

/**
 * Re-planning node - checks plan validity after DOM/URL changes
 *
 * @param state - Current graph state
 * @returns Updated state with re-planning result
 */
export async function replanningNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { plan, dom, url, previousUrl, previousDom, query, ragChunks, hasOrgKnowledge } = state

  // If no plan exists or no previous DOM, skip re-planning check
  if (!plan || !previousDom) {
    console.log(`[Graph:replanning] No plan or previous DOM, skipping re-planning check`)
    return {
      replanningResult: undefined,
      status: "executing",
    }
  }

  // If this is a new task (no previous URL), skip re-planning
  if (!previousUrl) {
    console.log(`[Graph:replanning] New task, skipping re-planning check`)
    return {
      replanningResult: undefined,
      status: "executing",
    }
  }

  console.log(`[Graph:replanning] Checking plan health after navigation`)

  try {
    // Validate plan health
    const validationResult = await validatePlanHealth(
      {
        currentDom: dom,
        currentUrl: url,
        previousDom: previousDom,
        previousUrl: previousUrl,
        plan: plan,
        originalQuery: query,
        similarityThreshold: 0.7,
      },
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
      }
    )

    // Build re-planning result
    const replanningResult: ReplanningResult = {
      triggered: validationResult.validationTriggered,
      planValid: validationResult.planValid,
      reason: validationResult.reason,
      triggerReasons: validationResult.triggerReasons,
      domSimilarity: validationResult.domSimilarity?.similarity,
      urlChanged: validationResult.domSimilarity ? false : (previousUrl !== url),
      suggestedChanges: validationResult.suggestedChanges,
    }

    console.log(
      `[Graph:replanning] Validation triggered=${replanningResult.triggered}, ` +
      `planValid=${replanningResult.planValid}, ` +
      `domSimilarity=${replanningResult.domSimilarity?.toFixed(2) || "N/A"}, ` +
      `reason=${replanningResult.reason}`
    )

    // If validation wasn't triggered or plan is valid, continue
    if (!validationResult.validationTriggered || validationResult.planValid) {
      return {
        replanningResult,
        status: "executing",
      }
    }

    // Determine action: continue, modify, or regenerate
    const action = determineReplanAction(validationResult)
    console.log(`[Graph:replanning] Re-planning action: ${action}`)

    if (action === "continue") {
      return {
        replanningResult,
        status: "executing",
      }
    }

    if (action === "modify" && validationResult.suggestedChanges) {
      // Try to apply modifications to existing plan
      const modifiedPlan = applyPlanModifications(plan, validationResult.suggestedChanges)
      
      if (modifiedPlan) {
        console.log(`[Graph:replanning] Applied modifications to plan`)
        return {
          plan: modifiedPlan,
          replanningResult: {
            ...replanningResult,
            reason: `Plan modified: ${validationResult.suggestedChanges.join("; ")}`,
          },
          status: "executing",
        }
      }
    }

    // Need to regenerate plan
    console.log(`[Graph:replanning] Regenerating plan`)
    
    const newPlan = await generatePlan(
      query,
      url,
      dom,
      ragChunks,
      hasOrgKnowledge,
      state.webSearchResult ?? undefined,
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
      }
    )

    if (!newPlan) {
      console.error(`[Graph:replanning] Failed to regenerate plan`)
      return {
        replanningResult: {
          ...replanningResult,
          reason: "Failed to regenerate plan",
        },
        status: "failed",
        error: "Re-planning failed: could not generate new plan",
      }
    }

    console.log(`[Graph:replanning] New plan generated with ${newPlan.steps.length} steps`)

    return {
      plan: newPlan,
      currentStepIndex: 0, // Reset to start of new plan
      replanningResult: {
        ...replanningResult,
        reason: `Plan regenerated (${newPlan.steps.length} steps)`,
      },
      status: "executing",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-replanning" },
      extra: { url, previousUrl },
    })
    console.error(`[Graph:replanning] Error:`, error)

    // On error, continue with existing plan (conservative)
    return {
      replanningResult: {
        triggered: true,
        planValid: true,
        reason: "Re-planning error, continuing with existing plan",
        triggerReasons: ["error"],
        urlChanged: previousUrl !== url,
      },
      status: "executing",
    }
  }
}

/**
 * Router function after re-planning
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterReplanning(
  state: InteractGraphState
): "planning" | "step_refinement" | "finalize" {
  const { replanningResult, status } = state

  // If re-planning failed, finalize
  if (status === "failed") {
    console.log(`[Graph:router] Routing to finalize (re-planning failed)`)
    return "finalize"
  }

  // If plan was regenerated (currentStepIndex reset to 0), go to planning to start fresh
  if (replanningResult?.reason.includes("regenerated") && state.currentStepIndex === 0) {
    console.log(`[Graph:router] Routing to planning (plan regenerated)`)
    return "planning"
  }

  // Otherwise continue to step refinement
  console.log(`[Graph:router] Routing to step_refinement (plan valid or modified)`)
  return "step_refinement"
}
