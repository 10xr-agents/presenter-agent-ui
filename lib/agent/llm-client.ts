import * as Sentry from "@sentry/nextjs"
import { getTracedOpenAIWithConfig, isLangfuseEnabled } from "@/lib/observability"
import { recordUsage, type RecordUsageInput } from "@/lib/cost"
import type { LLMActionType } from "@/lib/models/token-usage-log"

/**
 * LLM response with usage metrics.
 */
export interface LLMResponse {
  thought: string
  action: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
  /** Cost tracking result (if enabled) */
  costTracking?: {
    logId?: string
    costUSD?: number
    costCents?: number
  }
}

/**
 * LLM call options for additional metadata
 */
export interface LLMCallOptions {
  /** Name to identify this generation in LangFuse traces */
  generationName?: string
  /** Session ID for trace grouping */
  sessionId?: string
  /** User ID for trace attribution */
  userId?: string
  /** Tenant ID for billing (required for cost tracking) */
  tenantId?: string
  /** Task ID for linking to task execution */
  taskId?: string
  /** Message ID for linking to specific message */
  messageId?: string
  /** Action type for categorization */
  actionType?: LLMActionType
  /** LangFuse trace ID for cross-referencing */
  langfuseTraceId?: string
  /** Additional tags for filtering */
  tags?: string[]
  /** Custom metadata */
  metadata?: Record<string, unknown>
}

/** Default model used for LLM calls */
const DEFAULT_MODEL = "gpt-4-turbo-preview"

/**
 * Call OpenAI LLM for action generation.
 *
 * Uses LangFuse-traced OpenAI client when enabled for observability.
 * Falls back to regular OpenAI client when LangFuse is disabled.
 *
 * Cost tracking (Phase 1 Task 3):
 * - Dual-writes to MongoDB (billing) and LangFuse (observability)
 * - Non-blocking via Promise.allSettled
 * - Requires tenantId and userId in options
 *
 * Separation of concerns:
 * - LangFuse: Traces the LLM call (prompt, completion, tokens, latency)
 * - MongoDB: Source of truth for billing/cost
 * - Sentry: Captures errors/exceptions only
 *
 * @param systemPrompt - System message
 * @param userPrompt - User message with context
 * @param options - Optional trace metadata for LangFuse and cost tracking
 * @returns Parsed thought and action, or null on error
 */
export async function callActionLLM(
  systemPrompt: string,
  userPrompt: string,
  options?: LLMCallOptions
): Promise<LLMResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY
  const startTime = Date.now()

  if (!apiKey) {
    // Sentry captures the error for alerting
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  // Get traced OpenAI client (automatically sends traces to LangFuse when enabled)
  const openai = getTracedOpenAIWithConfig({
    generationName: options?.generationName || "action_generation",
    sessionId: options?.sessionId,
    userId: options?.userId,
    tags: options?.tags,
    metadata: options?.metadata,
  })

  try {
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL, // Can be made configurable per tenant
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content
    const durationMs = Date.now() - startTime

    if (!content) {
      // Log to Sentry as this is an unexpected state
      Sentry.captureException(new Error("Empty LLM response"), {
        tags: { component: "llm-client", operation: "action-generation" },
        extra: { model: DEFAULT_MODEL, langfuseEnabled: isLangfuseEnabled() },
      })
      return null
    }

    // Extract usage data
    const promptTokens = response.usage?.prompt_tokens ?? 0
    const completionTokens = response.usage?.completion_tokens ?? 0

    // Track cost (dual-write to MongoDB + LangFuse)
    // Non-blocking - errors are logged but don't fail the request
    let costTracking: LLMResponse["costTracking"]
    if (options?.tenantId && options?.userId) {
      const usageInput: RecordUsageInput = {
        tenantId: options.tenantId,
        userId: options.userId,
        sessionId: options.sessionId,
        messageId: options.messageId,
        taskId: options.taskId,
        provider: "openai",
        model: DEFAULT_MODEL,
        actionType: options.actionType || "ACTION_GENERATION",
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        durationMs,
        langfuseTraceId: options.langfuseTraceId,
        metadata: options.metadata,
      }

      // Fire-and-forget cost tracking (non-blocking)
      recordUsage(usageInput)
        .then((result) => {
          if (!result.success) {
            console.warn("[LLM] Cost tracking failed:", result.errors)
          }
        })
        .catch((err: unknown) => {
          console.error("[LLM] Cost tracking error:", err)
        })

      // For immediate access, we can estimate cost (actual recording is async)
      costTracking = {
        costUSD: undefined, // Set asynchronously
        costCents: undefined,
      }
    } else if (options?.tenantId || options?.userId) {
      console.warn(
        "[LLM] Cost tracking skipped: both tenantId and userId required"
      )
    }

    return {
      thought: content, // Raw LLM response - will be parsed by parseActionResponse
      action: content, // Same content (for compatibility)
      usage: response.usage
        ? {
            promptTokens,
            completionTokens,
          }
        : undefined,
      costTracking,
    }
  } catch (error: unknown) {
    // Sentry captures errors for alerting and debugging
    // LangFuse does NOT capture errors (clear separation)
    Sentry.captureException(error, {
      tags: { component: "llm-client", operation: "action-generation" },
      extra: { langfuseEnabled: isLangfuseEnabled() },
    })
    throw error
  }
}
