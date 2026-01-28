/**
 * Planning Node
 *
 * Generates or loads the task plan (step-by-step breakdown).
 * Uses the Planning Engine to create a plan based on:
 * - User query
 * - Current page context
 * - RAG knowledge
 * - Web search results (if available)
 */

import * as Sentry from "@sentry/nextjs"
import { generatePlan } from "@/lib/agent/planning-engine"
import type { TaskPlan } from "@/lib/models/task"
import type { InteractGraphState } from "../types"

/**
 * Planning node - generates or manages task plan
 *
 * @param state - Current graph state
 * @returns Updated state with plan
 */
export async function planningNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { query, url, dom, ragChunks, hasOrgKnowledge, webSearchResult, plan } = state

  // If plan already exists (loaded from task), use it
  if (plan) {
    console.log(`[Graph:planning] Using existing plan with ${plan.steps.length} steps, currentIndex=${plan.currentStepIndex}`)
    return {
      currentStepIndex: plan.currentStepIndex || 0,
      status: "executing",
    }
  }

  console.log(`[Graph:planning] Generating new plan for query: "${query.substring(0, 50)}..."`)

  try {
    const generatedPlan = await generatePlan(
      query,
      url,
      dom,
      ragChunks,
      hasOrgKnowledge,
      webSearchResult || undefined,
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
      }
    )

    if (generatedPlan) {
      console.log(`[Graph:planning] Plan generated with ${generatedPlan.steps.length} steps`)

      // Mark first step as active
      if (generatedPlan.steps.length > 0 && generatedPlan.steps[0]) {
        generatedPlan.steps[0] = {
          ...generatedPlan.steps[0],
          status: "active",
        }
      }

      return {
        plan: generatedPlan,
        currentStepIndex: 0,
        status: "executing",
      }
    }

    // Planning failed - continue without plan (fallback to direct LLM action)
    console.warn(`[Graph:planning] Planning returned null, continuing without plan`)
    return {
      plan: undefined,
      status: "executing",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-planning" },
      extra: { query, url },
    })
    console.error(`[Graph:planning] Planning error:`, error)

    // Continue without plan (backward compatibility)
    return {
      plan: undefined,
      status: "executing",
    }
  }
}

/**
 * Router function after planning
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterPlanning(
  state: InteractGraphState
): "step_refinement" | "action_generation" {
  if (state.plan && state.plan.steps.length > 0) {
    console.log(`[Graph:router] Routing to step_refinement (has plan)`)
    return "step_refinement"
  }

  console.log(`[Graph:router] Routing to action_generation (no plan)`)
  return "action_generation"
}
