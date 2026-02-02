/**
 * Persist graph results (TaskAction, Task, VerificationRecord, CorrectionRecord).
 * @see INTERACT_FLOW_WALKTHROUGH.md
 */

import * as Sentry from "@sentry/nextjs"
import { CorrectionRecord, Task, TaskAction, VerificationRecord } from "@/lib/models"
import { logger } from "@/lib/utils/logger"
import type { ExecuteGraphResult } from "../executor"

/**
 * Save graph results to the database.
 *
 * @param url - Current URL when action was generated (for verification tracking)
 * @param dom - Current DOM when action was generated (for observation-based verification v3.0)
 */
export async function saveGraphResults(
  tenantId: string,
  taskId: string,
  result: ExecuteGraphResult,
  sessionId?: string,
  userId?: string,
  url?: string,
  dom?: string
): Promise<void> {
  if (result.actionResult && userId) {
    const stepIndex = result.currentStepIndex
    const log = logger.child({ process: "RouteIntegration", sessionId, taskId })
    const action = result.actionResult.action
    const isFinish = action.startsWith("finish(")
    const isFail = action.startsWith("fail(")

    // finish()/fail() are terminal sentinels — no new step. Only persist real actions (click, setValue, etc.).
    if (isFinish || isFail) {
      log.info(
        `saveGraphResults: terminal action (${isFinish ? "finish" : "fail"}) — no new TaskAction; existing step(s) represent the only action(s)`
      )
    } else {
      log.info(
        `saveGraphResults: creating TaskAction taskId=${taskId}, stepIndex=${stepIndex}, action=${action}, urlAtAction=${url}`
      )

      let beforeState:
        | { url: string; domHash: string; activeElement?: string; semanticSkeleton?: Record<string, unknown> }
        | undefined
      if (url && dom) {
        const { computeDomHash } = await import("@/lib/utils/dom-helpers")
        const { extractSemanticSkeleton } = await import("@/lib/agent/observation/diff-engine")
        beforeState = {
          url,
          domHash: computeDomHash(dom),
        }
        try {
          const skeleton = extractSemanticSkeleton(dom)
          beforeState.semanticSkeleton = skeleton as Record<string, unknown>
        } catch (err: unknown) {
          logger.child({ process: "RouteIntegration", taskId }).warn("extractSemanticSkeleton failed", {
            err: err instanceof Error ? err.message : String(err),
          })
        }
      }

      try {
        await (TaskAction as any).create({
          tenantId,
          taskId,
          userId,
          stepIndex,
          thought: result.actionResult.thought || "",
          action,
          expectedOutcome: result.expectedOutcome ?? undefined,
          urlAtAction: url,
          beforeState,
          metrics: result.llmDuration
            ? { requestDuration: 0, llmDuration: result.llmDuration, tokenUsage: result.llmUsage }
            : undefined,
        })
      } catch (err: unknown) {
        log.error(`saveGraphResults: TaskAction.create failed for taskId=${taskId}`, err)
        Sentry.captureException(err, {
          extra: { taskId, stepIndex, action, tenantId },
        })
      }
    }
  }

  if (result.plan || result.hierarchicalPlan !== undefined) {
    const update: Record<string, unknown> = {
      status: result.status === "needs_user_input" ? "active" : "executing",
    }
    if (result.plan) {
      update.plan = result.plan
    }
    if (result.hierarchicalPlan !== undefined) {
      update.hierarchicalPlan = result.hierarchicalPlan
    }
    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        { $set: update }
      )
      .exec()
  }

  // Persist terminal task status so the task record reflects completion or failure
  // Also clear task memory on completion/failure to prevent stale data accumulation
  if (result.status === "completed" || result.status === "failed") {
    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        {
          $set: { status: result.status },
          $unset: { memory: 1 }, // Clear task memory on completion
        }
      )
      .exec()
  }

  // Persist awaiting_user status with blocker context when a blocker is detected
  if (result.status === "awaiting_user" && result.blockerResult?.detected) {
    const log = logger.child({ process: "RouteIntegration", sessionId, taskId })
    log.info(
      `saveGraphResults: blocker detected, pausing task taskId=${taskId}, blockerType=${result.blockerResult.type}`
    )

    const blockerContext = {
      type: result.blockerResult.type,
      description: result.blockerResult.description ?? `Blocker: ${result.blockerResult.type}`,
      userMessage: result.blockerResult.userMessage,
      resolutionMethods: result.blockerResult.resolutionMethods ?? [],
      requiredFields: result.blockerResult.requiredFields,
      matchedPattern: result.blockerResult.matchedPattern,
      confidence: result.blockerResult.confidence,
      retryAfterSeconds: result.blockerResult.retryAfterSeconds,
      pausedAtStep: result.currentStepIndex,
      pausedAtUrl: url,
    }

    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        {
          $set: {
            status: "awaiting_user",
            pausedAt: new Date(),
            blockerContext,
          },
        }
      )
      .exec()
  }

  if (result.verificationResult) {
    await (VerificationRecord as any).create({
      tenantId,
      taskId,
      stepIndex: result.currentStepIndex,
      success: result.verificationResult.success,
      confidence: result.verificationResult.confidence,
      reason: result.verificationResult.reason,
      expectedState: result.verificationResult.expectedState,
      actualState: result.verificationResult.actualState,
      comparison: result.verificationResult.comparison,
      timestamp: new Date(),
    })

    if (result.verificationResult.success) {
      const update: Record<string, unknown> = {
        consecutiveFailures: 0,
        consecutiveSuccessWithoutTaskComplete: result.consecutiveSuccessWithoutTaskComplete ?? 0,
      }
      await (Task as any)
        .findOneAndUpdate({ taskId, tenantId }, { $set: update })
        .exec()
    }
  }

  if (result.correctionResult) {
    const attemptNumber = result.correctionAttempts + 1
    const originalStep = {
      description: result.verificationResult?.reason ?? "Action failed verification",
      action: result.lastAction ?? undefined,
    }
    const correctedStep = result.correctionResult.correctedStep
      ? {
          description: result.correctionResult.correctedStep.description,
          action: result.correctionResult.retryAction,
          expectedOutcome: result.correctionResult.correctedStep.expectedOutcome,
        }
      : {
          description: `Correction: ${result.correctionResult.reason}`,
          action: result.correctionResult.retryAction,
        }
    await (CorrectionRecord as any).create({
      tenantId,
      taskId,
      stepIndex: result.currentStepIndex,
      originalStep,
      correctedStep,
      strategy: result.correctionResult.strategy,
      reason: result.correctionResult.reason,
      attemptNumber,
      timestamp: new Date(),
    })

    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        {
          $set: {
            status: "correcting",
            consecutiveFailures: result.consecutiveFailures,
          },
        }
      )
      .exec()

    if (result.plan && result.correctionResult.correctedStep) {
      const stepIndex = result.currentStepIndex
      if (stepIndex < result.plan.steps.length) {
        result.plan.steps[stepIndex] = result.correctionResult.correctedStep
        await (Task as any)
          .findOneAndUpdate(
            { taskId, tenantId },
            { $set: { "plan.steps": result.plan.steps } }
          )
          .exec()
      }
    }
  }

  if (result.webSearchResult) {
    await (Task as any)
      .findOneAndUpdate(
        { taskId, tenantId },
        { $set: { webSearchResult: result.webSearchResult } }
      )
      .exec()
  }
}
