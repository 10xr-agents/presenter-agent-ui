/**
 * Step Refinement Node
 *
 * Refines the current plan step into a concrete DOM action.
 * Uses the Step Refinement Engine to translate high-level steps
 * into specific actions like click(id), setValue(id, "text"), etc.
 */

import * as Sentry from "@sentry/nextjs"
import { refineStep } from "@/lib/agent/step-refinement-engine"
import type { InteractGraphState } from "../types"

/**
 * Step refinement node - refines plan step to concrete action
 *
 * @param state - Current graph state
 * @returns Updated state with refined action or fallback indicator
 */
export async function stepRefinementNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { plan, currentStepIndex, dom, url, previousActions, ragChunks, hasOrgKnowledge } = state

  if (!plan || currentStepIndex >= plan.steps.length) {
    console.log(`[Graph:step_refinement] No plan or step index out of bounds, falling back to LLM`)
    return {
      // Signal to use action_generation instead
      status: "executing",
    }
  }

  const currentStep = plan.steps[currentStepIndex]
  if (!currentStep) {
    console.log(`[Graph:step_refinement] Current step is undefined, falling back to LLM`)
    return {
      status: "executing",
    }
  }

  console.log(`[Graph:step_refinement] Refining step ${currentStepIndex}: "${currentStep.description}"`)

  try {
    const refinedAction = await refineStep(
      currentStep,
      dom,
      url,
      previousActions,
      ragChunks,
      hasOrgKnowledge,
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
      }
    )

    if (refinedAction) {
      // Check if it's a SERVER tool (not implemented yet)
      if (refinedAction.toolType === "SERVER") {
        console.log(`[Graph:step_refinement] SERVER tool detected, falling back to LLM`)
        return {
          status: "executing",
        }
      }

      console.log(`[Graph:step_refinement] Refined to action: ${refinedAction.action}`)
      return {
        actionResult: {
          thought: `Refined from plan step: ${currentStep.description}`,
          action: refinedAction.action,
          toolAction: {
            toolName: refinedAction.toolName,
            toolType: refinedAction.toolType,
            parameters: refinedAction.parameters,
          },
        },
        status: "executing",
      }
    }

    // Refinement returned null - fall back to LLM
    console.log(`[Graph:step_refinement] Refinement returned null, falling back to LLM`)
    return {
      status: "executing",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-step-refinement" },
      extra: { stepIndex: currentStepIndex, stepDescription: currentStep.description },
    })
    console.error(`[Graph:step_refinement] Refinement error:`, error)

    // Fall back to LLM action generation
    return {
      status: "executing",
    }
  }
}

/**
 * Router function after step refinement
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterStepRefinement(
  state: InteractGraphState
): "outcome_prediction" | "action_generation" {
  // If we have an action result, proceed to outcome prediction
  if (state.actionResult) {
    console.log(`[Graph:router] Routing to outcome_prediction (has refined action)`)
    return "outcome_prediction"
  }

  // Otherwise, fall back to LLM action generation
  console.log(`[Graph:router] Routing to action_generation (refinement failed)`)
  return "action_generation"
}
