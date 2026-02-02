/**
 * Plan Preview Message Helper
 *
 * Creates and broadcasts system messages showing the generated plan to users
 * before execution begins. This provides transparency into what the agent
 * intends to do.
 */

import { randomUUID } from "crypto"
import { Message } from "@/lib/models/message"
import { triggerNewMessage } from "@/lib/pusher/server"
import type { TaskPlan } from "@/lib/models/task"
import { logger } from "@/lib/utils/logger"

const log = logger.child({ process: "PlanMessage" })

/**
 * Format plan steps into a readable message content
 */
function formatPlanContent(plan: TaskPlan): string {
  const header = `Here's my plan to complete this task:\n\n`
  const steps = plan.steps.map((step, i) => `${i + 1}. ${step.description}`).join("\n")
  return header + steps
}

/**
 * Format plan update message content
 */
function formatPlanUpdateContent(plan: TaskPlan, reason?: string): string {
  const header = reason ? `I've updated the plan: ${reason}\n\n` : `I've updated the plan:\n\n`
  const steps = plan.steps.map((step, i) => `${i + 1}. ${step.description}`).join("\n")
  return header + steps
}

/**
 * Build the plan metadata structure for the message
 */
function buildPlanMetadata(
  plan: TaskPlan,
  messageType: "plan_preview" | "plan_update",
  taskId?: string
) {
  return {
    messageType,
    taskId,
    plan: {
      steps: plan.steps.map((s) => ({
        index: s.index,
        description: s.description,
        status: s.status,
      })),
      totalSteps: plan.steps.length,
      currentStepIndex: plan.currentStepIndex,
    },
  }
}

/**
 * Create and broadcast a plan preview system message
 */
export async function createPlanPreviewMessage(params: {
  sessionId: string
  tenantId: string
  userId: string
  plan: TaskPlan
  taskId?: string
}): Promise<string> {
  const { sessionId, tenantId, userId, plan, taskId } = params

  // Get next sequence number
  const lastMessage = await (Message as any)
    .findOne({ sessionId })
    .sort({ sequenceNumber: -1 })
    .select("sequenceNumber")
    .lean()
  const nextSeq = ((lastMessage?.sequenceNumber as number | undefined) ?? -1) + 1

  const messageId = randomUUID()
  const timestamp = new Date()
  const content = formatPlanContent(plan)
  const metadata = buildPlanMetadata(plan, "plan_preview", taskId)

  // Create the message
  await (Message as any).create({
    messageId,
    sessionId,
    userId,
    tenantId,
    role: "system",
    content,
    sequenceNumber: nextSeq,
    timestamp,
    metadata,
  })

  log.info(`Created plan preview message: messageId=${messageId}, steps=${plan.steps.length}`, {
    sessionId,
    taskId,
  })

  // Broadcast via Pusher
  await triggerNewMessage(sessionId, {
    messageId,
    role: "system",
    content,
    sequenceNumber: nextSeq,
    timestamp: timestamp.toISOString(),
    metadata,
  })

  return messageId
}

/**
 * Create and broadcast a plan update system message (when plan is modified/regenerated)
 */
export async function createPlanUpdateMessage(params: {
  sessionId: string
  tenantId: string
  userId: string
  plan: TaskPlan
  taskId?: string
  reason?: string
}): Promise<string> {
  const { sessionId, tenantId, userId, plan, taskId, reason } = params

  // Get next sequence number
  const lastMessage = await (Message as any)
    .findOne({ sessionId })
    .sort({ sequenceNumber: -1 })
    .select("sequenceNumber")
    .lean()
  const nextSeq = ((lastMessage?.sequenceNumber as number | undefined) ?? -1) + 1

  const messageId = randomUUID()
  const timestamp = new Date()
  const content = formatPlanUpdateContent(plan, reason)
  const metadata = buildPlanMetadata(plan, "plan_update", taskId)

  // Create the message
  await (Message as any).create({
    messageId,
    sessionId,
    userId,
    tenantId,
    role: "system",
    content,
    sequenceNumber: nextSeq,
    timestamp,
    metadata,
  })

  log.info(
    `Created plan update message: messageId=${messageId}, steps=${plan.steps.length}, reason=${reason || "none"}`,
    { sessionId, taskId }
  )

  // Broadcast via Pusher
  await triggerNewMessage(sessionId, {
    messageId,
    role: "system",
    content,
    sequenceNumber: nextSeq,
    timestamp: timestamp.toISOString(),
    metadata,
  })

  return messageId
}
