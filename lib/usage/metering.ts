import { getOrCreateBillingAccount } from "@/lib/billing/pay-as-you-go"
import { connectDB } from "@/lib/db/mongoose"
import { type IUsageEvent, UsageEvent } from "@/lib/models/usage-event"

export type UsageEventType = "presentation_minute" | "screen_agent_created" | "knowledge_processed"

export interface RecordUsageData {
  organizationId: string
  userId?: string
  screenAgentId?: string
  presentationSessionId?: string
  eventType: UsageEventType
  quantity: number
  unit: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
}

// Map our event types to the existing model's event types
const EVENT_TYPE_MAP: Record<UsageEventType, "session_minutes" | "knowledge_processing" | "storage" | "api_call"> = {
  presentation_minute: "session_minutes",
  screen_agent_created: "api_call",
  knowledge_processed: "knowledge_processing",
}

export interface UsageMetrics {
  totalQuantity: number
  totalCost: number // Cost in dollars (converted from cents)
  eventCount: number
  startDate: Date
  endDate: Date
}

/**
 * Record a usage event and optionally deduct from billing account
 */
export async function recordUsage(data: RecordUsageData): Promise<IUsageEvent> {
  await connectDB()

  // Get billing account for cost calculation
  const billingAccount = await getOrCreateBillingAccount(data.organizationId)
  const unitCostCents = 1 // Default cost per minute in cents ($0.01)
  const totalCostCents = Math.ceil(data.quantity * unitCostCents)

  // Map event type to existing model's event type
  const mappedEventType = EVENT_TYPE_MAP[data.eventType] || "api_call"

  // Create usage event with existing model structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usageEvent = await (UsageEvent as any).create({
    organizationId: data.organizationId,
    userId: data.userId,
    screenAgentId: data.screenAgentId,
    presentationSessionId: data.presentationSessionId,
    eventType: mappedEventType,
    eventTimestamp: new Date(),
    quantity: data.quantity,
    unitCostCents,
    totalCostCents,
    billingAccountId: billingAccount._id.toString(),
    billingStatus: "unbilled",
    metadata: data.metadata || {},
  })

  // Deduct from billing account balance if applicable
  if (totalCostCents > 0) {
    const { deductBalance } = await import("@/lib/billing/pay-as-you-go")
    await deductBalance(data.organizationId, totalCostCents)
  }

  return usageEvent
}

/**
 * Track presentation minutes
 */
export async function trackPresentationMinutes(
  organizationId: string,
  presentationSessionId: string,
  minutes: number,
  screenAgentId?: string
): Promise<IUsageEvent> {
  return recordUsage({
    organizationId,
    screenAgentId,
    presentationSessionId,
    eventType: "presentation_minute",
    quantity: minutes,
    unit: "minute",
  })
}

/**
 * Aggregate usage metrics for an organization
 */
export async function aggregateUsageMetrics(
  organizationId: string,
  startDate?: Date,
  endDate?: Date,
  eventType?: UsageEventType
): Promise<UsageMetrics> {
  await connectDB()

  // Map event type if provided
  const mappedEventType = eventType ? EVENT_TYPE_MAP[eventType] : undefined

  const query: {
    organizationId: string
    eventType?: "session_minutes" | "knowledge_processing" | "storage" | "api_call"
    eventTimestamp?: { $gte?: Date; $lte?: Date }
  } = {
    organizationId,
  }

  if (mappedEventType) {
    query.eventType = mappedEventType
  }

  if (startDate || endDate) {
    query.eventTimestamp = {}
    if (startDate) {
      query.eventTimestamp.$gte = startDate
    }
    if (endDate) {
      query.eventTimestamp.$lte = endDate
    }
  } else {
    // Default to last 30 days if no dates provided
    const defaultEndDate = new Date()
    const defaultStartDate = new Date(defaultEndDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    query.eventTimestamp = {
      $gte: defaultStartDate,
      $lte: defaultEndDate,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = await (UsageEvent as any).find(query)

  const totalQuantity = events.reduce((sum: number, event: IUsageEvent) => sum + (event.quantity || 0), 0)
  const totalCost = events.reduce((sum: number, event: IUsageEvent) => sum + (event.totalCostCents || 0), 0) / 100 // Convert cents to dollars
  const eventCount = events.length

  const metricsStartDate = startDate || (events.length > 0 ? events[events.length - 1]?.eventTimestamp : new Date())
  const metricsEndDate = endDate || (events.length > 0 ? events[0]?.eventTimestamp : new Date())

  return {
    totalQuantity,
    totalCost,
    eventCount,
    startDate: metricsStartDate instanceof Date ? metricsStartDate : new Date(metricsStartDate),
    endDate: metricsEndDate instanceof Date ? metricsEndDate : new Date(metricsEndDate),
  }
}

/**
 * Get usage for a specific presentation session
 */
export async function getSessionUsage(
  presentationSessionId: string
): Promise<IUsageEvent[]> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = await (UsageEvent as any).find({
    presentationSessionId,
  }).sort({ eventTimestamp: -1 })

  return events
}
