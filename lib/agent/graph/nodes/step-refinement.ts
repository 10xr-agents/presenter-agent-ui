/**
 * Step Refinement Node
 *
 * Refines the current plan step into a concrete DOM action.
 * Uses the Step Refinement Engine to translate high-level steps
 * into specific actions like click(id), setValue(id, "text"), etc.
 */

import * as Sentry from "@sentry/nextjs"
import { parseFinishMessage } from "@/lib/agent/action-parser"
import { refineStep } from "@/lib/agent/step-refinement-engine"
import { logger } from "@/lib/utils/logger"
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
  const {
    plan,
    currentStepIndex,
    dom,
    url,
    previousActions,
    previousActionsSummary,
    ragChunks,
    hasOrgKnowledge,
    verificationResult,
  } = state
  const log = logger.child({
    process: "Graph:step_refinement",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })

  if (!plan || currentStepIndex >= plan.steps.length) {
    // Plan exhausted: all steps completed but task wasn't marked complete by verification
    // Signal to action generation that plan is done so it can check goal completion
    const planExhausted = plan && currentStepIndex >= plan.steps.length
    log.info(
      planExhausted
        ? `Plan exhausted (${plan.steps.length} steps done), falling back to LLM for goal check`
        : "No plan, falling back to LLM"
    )
    return {
      // Signal to use action_generation instead
      // Pass planExhausted flag so action generation knows all plan steps are complete
      planExhausted,
      status: "executing",
    }
  }

  const currentStep = plan.steps[currentStepIndex]
  if (!currentStep) {
    log.info("Current step is undefined, falling back to LLM")
    return {
      status: "executing",
    }
  }

  log.info(`Refining step ${currentStepIndex}: "${currentStep.description}"`)

  // Log DOM size for debugging analysis steps
  const isAnalysisStep =
    currentStep.description.toLowerCase().includes("analyze") ||
    currentStep.description.toLowerCase().includes("figure out") ||
    currentStep.description.toLowerCase().includes("find") ||
    currentStep.description.toLowerCase().includes("identify")
  if (isAnalysisStep) {
    log.debug(`Analysis step detected, DOM size: ${dom.length} chars`)
  }

  const verificationSummary =
    verificationResult != null
      ? {
          action_succeeded: verificationResult.action_succeeded,
          task_completed: verificationResult.task_completed,
        }
      : undefined

  try {
    const refinedAction = await refineStep(
      currentStep,
      dom,
      url,
      previousActions,
      ragChunks,
      hasOrgKnowledge,
      verificationSummary,
      previousActionsSummary,
      {
        tenantId: state.tenantId,
        userId: state.userId,
        sessionId: state.sessionId,
        taskId: state.taskId,
        langfuseTraceId: state.langfuseTraceId,
      }
    )

    if (refinedAction) {
      // Check if it's a SERVER tool (not implemented yet)
      if (refinedAction.toolType === "SERVER") {
        log.info("SERVER tool detected, falling back to LLM")
        return {
          status: "executing",
        }
      }

      // Extract finishMessage if this is a finish action (deterministic parsing, no regex)
      const finishMessage = parseFinishMessage(refinedAction.action)

      log.info(`Refined to action: ${refinedAction.action}`, {
        hasFinishMessage: !!finishMessage,
      })
      return {
        actionResult: {
          thought: `Refined from plan step: ${currentStep.description}`,
          action: refinedAction.action,
          ...(finishMessage && { finishMessage }),
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
    log.info("Refinement returned null, falling back to LLM")
    return {
      status: "executing",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "graph-step-refinement" },
      extra: { stepIndex: currentStepIndex, stepDescription: currentStep.description },
    })
    log.error("Refinement error", error)

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
  const log = logger.child({
    process: "Graph:router",
    sessionId: state.sessionId,
    taskId: state.taskId ?? "",
  })
  // If we have an action result, proceed to outcome prediction
  if (state.actionResult) {
    log.info("Routing to outcome_prediction (has refined action)")
    return "outcome_prediction"
  }

  // Otherwise, fall back to LLM action generation
  log.info("Routing to action_generation (refinement failed)")
  return "action_generation"
}
