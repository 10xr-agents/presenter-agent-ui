/**
 * Usage Service - Dual-Write Cost Tracking
 *
 * Centralized service for tracking LLM token usage.
 * Dual-writes to MongoDB (billing) and LangFuse (observability).
 *
 * Key design decisions:
 * 1. Non-blocking writes via Promise.allSettled
 * 2. MongoDB is source of truth for billing
 * 3. LangFuse failures don't affect billing records
 * 4. Centralized pricing via pricing.ts
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 1 Task 3
 */

import * as Sentry from "@sentry/nextjs"
import { connectDB } from "@/lib/db/mongoose"
import {
  type CreateTokenUsageLogInput,
  type LLMActionType,
  type LLMProviderType,
  TokenUsageLog,
  type TokenUsageLogFilters,
  type TokenUsageSummary,
} from "@/lib/models/token-usage-log"
import { addScore, isLangfuseEnabled } from "@/lib/observability"
import { calculateTokenCost, type TokenUsage } from "./pricing"

// =============================================================================
// Types
// =============================================================================

/**
 * Input for recording LLM usage
 */
export interface RecordUsageInput {
  // Context
  tenantId: string
  userId: string
  sessionId?: string
  messageId?: string
  taskId?: string

  // LLM details
  provider: string
  model: string
  actionType: LLMActionType

  // Usage data
  inputTokens: number
  outputTokens: number
  cachedTokens?: number

  // Optional
  durationMs?: number
  langfuseTraceId?: string
  metadata?: Record<string, unknown>
}

/**
 * Result from recording usage
 */
export interface RecordUsageResult {
  success: boolean
  logId?: string
  costUSD?: number
  costCents?: number
  errors?: {
    mongodb?: string
    langfuse?: string
  }
}

// =============================================================================
// Usage Recording
// =============================================================================

/**
 * Record LLM usage with dual-write to MongoDB and LangFuse
 *
 * Uses Promise.allSettled for non-blocking writes.
 * MongoDB errors are logged but don't throw.
 * LangFuse errors are logged but don't affect the result.
 *
 * @param input - Usage data to record
 * @returns Result with log ID and cost
 */
export async function recordUsage(
  input: RecordUsageInput
): Promise<RecordUsageResult> {
  const {
    tenantId,
    userId,
    sessionId,
    messageId,
    taskId,
    provider,
    model,
    actionType,
    inputTokens,
    outputTokens,
    cachedTokens,
    durationMs,
    langfuseTraceId,
    metadata,
  } = input

  // Calculate cost
  const usage: TokenUsage = {
    inputTokens,
    outputTokens,
    cachedTokens,
  }

  const cost = calculateTokenCost(provider, model, usage)

  // If no pricing found, use zero cost but still log
  const costUSD = cost?.totalCostUSD ?? 0
  const costCents = cost?.totalCostCents ?? 0

  if (!cost) {
    console.warn(
      `[UsageService] No pricing for ${provider}/${model}, recording with zero cost`
    )
  }

  const totalTokens = inputTokens + outputTokens + (cachedTokens ?? 0)

  // Prepare MongoDB record
  const mongoRecord: CreateTokenUsageLogInput = {
    tenantId,
    userId,
    sessionId,
    messageId,
    taskId,
    langfuseTraceId,
    provider: normalizeProvider(provider),
    model,
    actionType,
    inputTokens,
    outputTokens,
    cachedTokens,
    costUSD,
    costCents,
    durationMs,
    metadata,
  }

  // Dual-write with Promise.allSettled (non-blocking)
  const results = await Promise.allSettled([
    writeToMongoDB(mongoRecord),
    writeToLangFuse(input, costUSD, totalTokens),
  ])

  // Process results
  const [mongoResult, langfuseResult] = results
  const errors: RecordUsageResult["errors"] = {}

  let logId: string | undefined

  if (mongoResult.status === "fulfilled") {
    logId = mongoResult.value
  } else {
    errors.mongodb = mongoResult.reason?.message || "MongoDB write failed"
    console.error("[UsageService] MongoDB write failed:", mongoResult.reason)
    Sentry.captureException(mongoResult.reason, {
      tags: { component: "usage-service", operation: "mongodb-write" },
      extra: { tenantId, provider, model, actionType },
    })
  }

  if (langfuseResult.status === "rejected") {
    errors.langfuse = langfuseResult.reason?.message || "LangFuse write failed"
    // Don't log to Sentry - LangFuse failures are expected when disabled
    if (isLangfuseEnabled()) {
      console.warn("[UsageService] LangFuse write failed:", langfuseResult.reason)
    }
  }

  return {
    success: mongoResult.status === "fulfilled",
    logId,
    costUSD,
    costCents,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  }
}

// =============================================================================
// MongoDB Operations
// =============================================================================

/**
 * Write usage record to MongoDB
 */
async function writeToMongoDB(
  record: CreateTokenUsageLogInput
): Promise<string> {
  await connectDB()

  const doc = await (TokenUsageLog as any).create({
    ...record,
    totalTokens:
      record.inputTokens + record.outputTokens + (record.cachedTokens ?? 0),
    timestamp: new Date(),
  })

  return doc.logId
}

/**
 * Normalize provider name to enum value
 */
function normalizeProvider(provider: string): LLMProviderType {
  const normalized = provider.toLowerCase()
  if (normalized === "google" || normalized === "gemini") return "GOOGLE"
  return "GOOGLE" // Default (Gemini)
}

// =============================================================================
// LangFuse Operations
// =============================================================================

/**
 * Write usage data to LangFuse as a score
 *
 * Note: LLM calls use Gemini via lib/llm/gemini-client.ts.
 * This adds cost metadata as a score for analysis.
 */
async function writeToLangFuse(
  input: RecordUsageInput,
  costUSD: number,
  totalTokens: number
): Promise<void> {
  if (!isLangfuseEnabled()) {
    return
  }

  // Add cost as a score for tracking
  await addScore({
    name: "llm_cost_usd",
    value: costUSD,
    traceId: input.langfuseTraceId,
    comment: `${input.provider}/${input.model} - ${input.actionType} - ${totalTokens} tokens`,
  })

  // Add token count as a score
  await addScore({
    name: "llm_tokens_total",
    value: totalTokens,
    traceId: input.langfuseTraceId,
    comment: `Input: ${input.inputTokens}, Output: ${input.outputTokens}`,
  })
}

// =============================================================================
// Query Operations
// =============================================================================

/**
 * Get usage summary for a tenant
 *
 * @param filters - Query filters
 * @returns Aggregated usage summary
 */
export async function getUsageSummary(
  filters: TokenUsageLogFilters
): Promise<TokenUsageSummary> {
  await connectDB()

  // Build query
  const query: Record<string, unknown> = {}

  if (filters.tenantId) query.tenantId = filters.tenantId
  if (filters.userId) query.userId = filters.userId
  if (filters.sessionId) query.sessionId = filters.sessionId
  if (filters.taskId) query.taskId = filters.taskId
  if (filters.provider) query.provider = filters.provider
  if (filters.model) query.model = filters.model
  if (filters.actionType) query.actionType = filters.actionType

  if (filters.startDate || filters.endDate) {
    query.timestamp = {} as Record<string, Date>
    if (filters.startDate)
      (query.timestamp as Record<string, Date>).$gte = filters.startDate
    if (filters.endDate)
      (query.timestamp as Record<string, Date>).$lte = filters.endDate
  }

  // Fetch records
  const logs = await (TokenUsageLog as any).find(query).lean().exec()

  // Aggregate
  const summary: TokenUsageSummary = {
    totalCostUSD: 0,
    totalCostCents: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    callCount: logs.length,
    breakdown: {
      byProvider: {},
      byModel: {},
      byActionType: {},
    },
  }

  for (const log of logs) {
    summary.totalCostUSD += log.costUSD
    summary.totalCostCents += log.costCents
    summary.totalInputTokens += log.inputTokens
    summary.totalOutputTokens += log.outputTokens
    summary.totalTokens += log.totalTokens

    // By provider
    const providerKey = log.provider as string
    if (!summary.breakdown.byProvider[providerKey]) {
      summary.breakdown.byProvider[providerKey] = { cost: 0, tokens: 0, calls: 0 }
    }
    const providerEntry = summary.breakdown.byProvider[providerKey]!
    providerEntry.cost += log.costUSD
    providerEntry.tokens += log.totalTokens
    providerEntry.calls += 1

    // By model
    const modelKey = log.model as string
    if (!summary.breakdown.byModel[modelKey]) {
      summary.breakdown.byModel[modelKey] = { cost: 0, tokens: 0, calls: 0 }
    }
    const modelEntry = summary.breakdown.byModel[modelKey]!
    modelEntry.cost += log.costUSD
    modelEntry.tokens += log.totalTokens
    modelEntry.calls += 1

    // By action type
    const actionKey = log.actionType as string
    if (!summary.breakdown.byActionType[actionKey]) {
      summary.breakdown.byActionType[actionKey] = { cost: 0, tokens: 0, calls: 0 }
    }
    const actionEntry = summary.breakdown.byActionType[actionKey]!
    actionEntry.cost += log.costUSD
    actionEntry.tokens += log.totalTokens
    actionEntry.calls += 1
  }

  return summary
}

/**
 * Get recent usage logs for a tenant
 *
 * @param tenantId - Tenant ID
 * @param limit - Maximum number of records
 * @returns Recent usage logs
 */
export async function getRecentUsageLogs(
  tenantId: string,
  limit: number = 100
): Promise<Array<{
  logId: string
  model: string
  actionType: string
  totalTokens: number
  costUSD: number
  timestamp: Date
}>> {
  await connectDB()

  const logs = await (TokenUsageLog as any)
    .find({ tenantId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select("logId model actionType totalTokens costUSD timestamp")
    .lean()
    .exec()

  return logs
}

/**
 * Get total cost for a tenant in a date range
 *
 * @param tenantId - Tenant ID
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Total cost in USD
 */
export async function getTenantCost(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<{ totalCostUSD: number; totalCostCents: number }> {
  await connectDB()

  const result = await (TokenUsageLog as any).aggregate([
    {
      $match: {
        tenantId,
        timestamp: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalCostUSD: { $sum: "$costUSD" },
        totalCostCents: { $sum: "$costCents" },
      },
    },
  ])

  return {
    totalCostUSD: result[0]?.totalCostUSD ?? 0,
    totalCostCents: result[0]?.totalCostCents ?? 0,
  }
}
