/**
 * Token Usage Log Model
 *
 * Immutable log of all LLM token usage for billing and auditing.
 * This is the source of truth for cost tracking - separate from LangFuse
 * which is used for debugging/observability.
 *
 * Dual-write strategy:
 * - This model: For billing, auditing, credit limits (accountants/CFO)
 * - LangFuse: For debugging, prompts, latency (engineers)
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 1 Task 3
 */

import mongoose, { Schema, Types } from "mongoose"

// =============================================================================
// Types
// =============================================================================

/**
 * LLM action types for categorization
 */
export type LLMActionType =
  | "PLANNING"
  | "PLAN_VALIDATION" // Phase 3 Task 2: Re-planning validation
  | "REFINEMENT"
  | "VERIFICATION"
  | "VERIFICATION_LIGHTWEIGHT" // Phase 5: Tier 2 lightweight verification
  | "CONTEXT_ANALYSIS"
  | "SELF_CORRECTION"
  | "ACTION_GENERATION"
  | "OUTCOME_PREDICTION"
  | "DIRECT_ACTION"
  | "CRITIC" // Phase 4 Task 1: Pre-execution reflection
  | "MULTI_SOURCE_SYNTHESIS" // Phase 4 Task 4: Multi-source context
  | "DYNAMIC_INTERRUPT" // Phase 4 Task 5: Mid-flight RAG/ask
  | "SKILLS_RETRIEVAL" // Phase 4 Task 6: Episodic memory
  | "CONTINGENCY_CHECK" // Phase 4 Task 7: Conditional planning
  | "HIERARCHICAL_PLANNING" // Phase 4 Task 8: Sub-task decomposition
  | "GENERAL"

/**
 * Supported LLM providers
 */
export type LLMProviderType = "GOOGLE"

/**
 * Token usage log document interface
 * Note: Using Omit<Document, "model"> to avoid conflict with the `model` property
 */
export interface ITokenUsageLog extends Omit<mongoose.Document, "model"> {
  /** Unique identifier (UUID) */
  logId: string

  /** Tenant ID (userId or organizationId) - primary billing entity */
  tenantId: string

  /** User who made the request */
  userId: string

  /** Session ID for grouping related requests */
  sessionId?: string

  /** Message ID for linking to specific message */
  messageId?: string

  /** Task ID for linking to task execution */
  taskId?: string

  /** LangFuse trace ID for cross-referencing */
  langfuseTraceId?: string

  /** LLM provider */
  provider: LLMProviderType

  /** Model name */
  model: string

  /** Action type for categorization */
  actionType: LLMActionType

  /** Input tokens */
  inputTokens: number

  /** Output tokens */
  outputTokens: number

  /** Total tokens */
  totalTokens: number

  /** Cached tokens (if applicable) */
  cachedTokens?: number

  /** Cost in USD */
  costUSD: number

  /** Cost in cents (for easier integer math) */
  costCents: number

  /** Duration of the LLM call in milliseconds */
  durationMs?: number

  /** Additional metadata */
  metadata?: Record<string, unknown>

  /** When the LLM call occurred */
  timestamp: Date

  /** Immutable - created once, never updated */
  createdAt: Date
}

// =============================================================================
// Schema
// =============================================================================

const TokenUsageLogSchema = new Schema<ITokenUsageLog>(
  {
    logId: {
      type: String,
      required: true,
      unique: true,
      default: () => new Types.ObjectId().toString(),
    },

    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    sessionId: {
      type: String,
      index: true,
    },

    messageId: {
      type: String,
      index: true,
    },

    taskId: {
      type: String,
      index: true,
    },

    langfuseTraceId: {
      type: String,
      // Index defined at schema level for LangFuse cross-reference
    },

    provider: {
      type: String,
      enum: ["GOOGLE"],
      required: true,
      index: true,
    },

    model: {
      type: String,
      required: true,
      index: true,
    },

    actionType: {
      type: String,
      enum: [
        "PLANNING",
        "PLAN_VALIDATION",
        "REFINEMENT",
        "VERIFICATION",
        "CONTEXT_ANALYSIS",
        "SELF_CORRECTION",
        "ACTION_GENERATION",
        "OUTCOME_PREDICTION",
        "DIRECT_ACTION",
        "CRITIC",
        "MULTI_SOURCE_SYNTHESIS",
        "DYNAMIC_INTERRUPT",
        "SKILLS_RETRIEVAL",
        "CONTINGENCY_CHECK",
        "HIERARCHICAL_PLANNING",
        "GENERAL",
      ],
      required: true,
      index: true,
    },

    inputTokens: {
      type: Number,
      required: true,
      default: 0,
    },

    outputTokens: {
      type: Number,
      required: true,
      default: 0,
    },

    totalTokens: {
      type: Number,
      required: true,
    },

    cachedTokens: {
      type: Number,
      default: 0,
    },

    costUSD: {
      type: Number,
      required: true,
    },

    costCents: {
      type: Number,
      required: true,
    },

    durationMs: {
      type: Number,
    },

    metadata: {
      type: Schema.Types.Mixed,
    },

    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable - no updates
  }
)

// =============================================================================
// Indexes for Billing Queries
// =============================================================================

// Primary billing index: tenant + time range
TokenUsageLogSchema.index({ tenantId: 1, timestamp: -1 })

// Per-user breakdown within tenant
TokenUsageLogSchema.index({ tenantId: 1, userId: 1, timestamp: -1 })

// Cost analysis by provider/model
TokenUsageLogSchema.index({ tenantId: 1, provider: 1, model: 1, timestamp: -1 })

// Cost analysis by action type
TokenUsageLogSchema.index({ tenantId: 1, actionType: 1, timestamp: -1 })

// Task-specific cost tracking
TokenUsageLogSchema.index({ taskId: 1, timestamp: -1 })

// Session-specific cost tracking
TokenUsageLogSchema.index({ sessionId: 1, timestamp: -1 })

// LangFuse cross-reference
TokenUsageLogSchema.index({ langfuseTraceId: 1 })

// =============================================================================
// Model Export
// =============================================================================

export const TokenUsageLog =
  mongoose.models.TokenUsageLog ||
  mongoose.model<ITokenUsageLog>("TokenUsageLog", TokenUsageLogSchema)

// =============================================================================
// Helper Types for API
// =============================================================================

/**
 * Input for creating a token usage log entry
 */
export interface CreateTokenUsageLogInput {
  tenantId: string
  userId: string
  sessionId?: string
  messageId?: string
  taskId?: string
  langfuseTraceId?: string
  provider: LLMProviderType
  model: string
  actionType: LLMActionType
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  costUSD: number
  costCents: number
  durationMs?: number
  metadata?: Record<string, unknown>
}

/**
 * Filters for querying token usage logs
 */
export interface TokenUsageLogFilters {
  tenantId?: string
  userId?: string
  sessionId?: string
  taskId?: string
  provider?: LLMProviderType
  model?: string
  actionType?: LLMActionType
  startDate?: Date
  endDate?: Date
}

/**
 * Aggregated usage summary
 */
export interface TokenUsageSummary {
  totalCostUSD: number
  totalCostCents: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  callCount: number
  breakdown: {
    byProvider: Record<string, { cost: number; tokens: number; calls: number }>
    byModel: Record<string, { cost: number; tokens: number; calls: number }>
    byActionType: Record<string, { cost: number; tokens: number; calls: number }>
  }
}
