import * as Sentry from "@sentry/nextjs"
import { recordUsage, type RecordUsageInput } from "@/lib/cost"
import {
  DEFAULT_GEMINI_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { ACTION_RESPONSE_SCHEMA } from "@/lib/llm/response-schemas"
import type { ImageInput } from "@/lib/llm/multimodal-helpers"
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
  /** Optional multimodal images (e.g., screenshot for hybrid mode) */
  images?: ImageInput[]
}

/**
 * Call Gemini LLM for action generation.
 *
 * Cost tracking (Phase 1 Task 3):
 * - Dual-writes to MongoDB (billing) and LangFuse (observability)
 * - Non-blocking via Promise.allSettled
 * - Requires tenantId and userId in options
 *
 * @param systemPrompt - System message
 * @param userPrompt - User message with context
 * @param options - Optional trace metadata and cost tracking
 * @returns Parsed thought and action, or null on error
 */
export async function callActionLLM(
  systemPrompt: string,
  userPrompt: string,
  options?: LLMCallOptions
): Promise<LLMResponse | null> {
  const startTime = Date.now()

  const result = await generateWithGemini(systemPrompt, userPrompt, {
    model: DEFAULT_GEMINI_MODEL,
    temperature: 0.7,
    maxOutputTokens: 2000,
    thinkingLevel: "low",
    generationName: options?.generationName || "action_generation",
    sessionId: options?.sessionId,
    userId: options?.userId,
    images: options?.images,
    tags: options?.tags,
    metadata: options?.metadata,
    responseJsonSchema: ACTION_RESPONSE_SCHEMA,
  })

  if (!result) return null

  let thought: string
  let action: string
  try {
    const parsed = JSON.parse(result.content) as { thought?: string; action?: string }
    thought = typeof parsed.thought === "string" ? parsed.thought : ""
    action = typeof parsed.action === "string" ? parsed.action : ""
  } catch {
    return null
  }
  if (!thought || !action) return null

  const durationMs = Date.now() - startTime
  const promptTokens = result.promptTokens ?? 0
  const completionTokens = result.completionTokens ?? 0

  let costTracking: LLMResponse["costTracking"]
  if (options?.tenantId && options?.userId) {
    const usageInput: RecordUsageInput = {
      tenantId: options.tenantId,
      userId: options.userId,
      sessionId: options.sessionId,
      messageId: options.messageId,
      taskId: options.taskId,
      provider: "google",
      model: DEFAULT_GEMINI_MODEL,
      actionType: options.actionType || "ACTION_GENERATION",
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      durationMs,
      langfuseTraceId: options.langfuseTraceId,
      metadata: options.metadata,
    }

    recordUsage(usageInput)
      .then((res) => {
        if (!res.success) console.warn("[LLM] Cost tracking failed:", res.errors)
      })
      .catch((err: unknown) => {
        console.error("[LLM] Cost tracking error:", err)
      })

    costTracking = { costUSD: undefined, costCents: undefined }
  } else if (options?.tenantId || options?.userId) {
    console.warn(
      "[LLM] Cost tracking skipped: both tenantId and userId required"
    )
  }

  return {
    thought,
    action,
    usage:
      promptTokens > 0 || completionTokens > 0
        ? { promptTokens, completionTokens }
        : undefined,
    costTracking,
  }
}
