/**
 * LangFuse Observability Client
 *
 * Provides LLM-specific tracing and observability via LangFuse.
 * Maintains clear separation with Sentry:
 * - LangFuse: LLM traces, prompt versions, token usage, latency, scores
 * - Sentry: Error monitoring, exceptions, performance alerts
 *
 * LangFuse v4 SDK structure:
 * - @langfuse/openai: Auto-traces OpenAI calls via observeOpenAI wrapper
 * - @langfuse/client: For scores, prompts, datasets (management API)
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 1 Task 2
 */

import { LangfuseClient } from "@langfuse/client"
import { observeOpenAI } from "@langfuse/openai"
import OpenAI from "openai"

// =============================================================================
// Configuration
// =============================================================================

/**
 * LangFuse configuration loaded from environment variables
 */
interface LangfuseConfig {
  publicKey: string
  secretKey: string
  baseUrl: string
  enabled: boolean
}

/**
 * Get LangFuse configuration from environment
 */
function getLangfuseConfig(): LangfuseConfig {
  return {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY || "",
    secretKey: process.env.LANGFUSE_SECRET_KEY || "",
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
    enabled:
      process.env.ENABLE_LANGFUSE === "true" &&
      !!process.env.LANGFUSE_PUBLIC_KEY &&
      !!process.env.LANGFUSE_SECRET_KEY,
  }
}

// =============================================================================
// Singleton Client
// =============================================================================

let _langfuseClient: LangfuseClient | null = null

/**
 * Get the singleton LangFuse client instance
 * Returns null if LangFuse is not enabled
 */
export function getLangfuseClient(): LangfuseClient | null {
  const config = getLangfuseConfig()

  if (!config.enabled) {
    return null
  }

  if (!_langfuseClient) {
    _langfuseClient = new LangfuseClient({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
    })
  }

  return _langfuseClient
}

/**
 * Check if LangFuse is enabled and properly configured
 */
export function isLangfuseEnabled(): boolean {
  return getLangfuseConfig().enabled
}

// =============================================================================
// OpenAI Integration
// =============================================================================

let _tracedOpenAI: OpenAI | null = null

/**
 * Get a traced OpenAI client that automatically sends traces to LangFuse
 *
 * If LangFuse is disabled, returns a regular OpenAI client
 */
export function getTracedOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured")
  }

  // If LangFuse is disabled, return a plain OpenAI client
  if (!isLangfuseEnabled()) {
    if (!_tracedOpenAI) {
      _tracedOpenAI = new OpenAI({ apiKey })
    }
    return _tracedOpenAI
  }

  // Create traced OpenAI client
  // The observeOpenAI wrapper automatically sends traces to LangFuse
  return observeOpenAI(new OpenAI({ apiKey }))
}

/**
 * Get a traced OpenAI client with custom trace properties
 *
 * Use this for specific operations where you want to customize the trace metadata
 */
export function getTracedOpenAIWithConfig(config: {
  generationName?: string
  sessionId?: string
  userId?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured")
  }

  if (!isLangfuseEnabled()) {
    return new OpenAI({ apiKey })
  }

  return observeOpenAI(new OpenAI({ apiKey }), {
    generationName: config.generationName,
    sessionId: config.sessionId,
    userId: config.userId,
    tags: config.tags,
    generationMetadata: config.metadata,
  })
}

// =============================================================================
// Score Management
// =============================================================================

/**
 * Score data for evaluation
 */
export interface ScoreData {
  name: string
  value: number
  traceId?: string
  observationId?: string
  comment?: string
}

/**
 * Add a score to LangFuse
 *
 * Scores are used for evaluation metrics like:
 * - Verification success/failure
 * - Correction effectiveness
 * - Task completion
 */
export async function addScore(score: ScoreData): Promise<void> {
  const client = getLangfuseClient()
  if (!client) return

  try {
    await client.score.create({
      name: score.name,
      value: score.value,
      traceId: score.traceId,
      observationId: score.observationId,
      comment: score.comment,
    })
  } catch (error) {
    // Log but don't throw - observability should not break the main flow
    console.error("[LangFuse] Failed to add score:", error)
  }
}

// =============================================================================
// Flush and Shutdown
// =============================================================================

/**
 * Flush all pending data to LangFuse
 *
 * Call this before the process exits in short-lived environments
 */
export async function flushLangfuse(): Promise<void> {
  const client = getLangfuseClient()
  if (!client) return

  try {
    await client.flush()
  } catch (error) {
    console.error("[LangFuse] Failed to flush:", error)
  }
}

/**
 * Shutdown the LangFuse client gracefully
 */
export async function shutdownLangfuse(): Promise<void> {
  const client = getLangfuseClient()
  if (!client) return

  try {
    await client.shutdown()
  } catch (error) {
    console.error("[LangFuse] Failed to shutdown:", error)
  }
}

// =============================================================================
// Interact Flow Tracing Helper
// =============================================================================

/**
 * Interact flow trace context
 *
 * Holds trace state for a single interact request
 * Note: LangFuse v4 with observeOpenAI auto-creates traces for OpenAI calls
 */
export interface InteractTraceContext {
  enabled: boolean
  sessionId?: string
  userId?: string
  metadata: Record<string, unknown>
}

/**
 * Start tracing an interact flow
 *
 * Creates a context for adding scores and metadata
 * The actual trace is created automatically by observeOpenAI
 */
export async function startInteractTrace(
  metadata: {
    tenantId: string
    userId: string
    sessionId?: string
    taskId?: string
    query: string
    url: string
    complexity?: string
    tags?: string[]
  }
): Promise<InteractTraceContext> {
  if (!isLangfuseEnabled()) {
    return { enabled: false, metadata: {} }
  }

  return {
    enabled: true,
    sessionId: metadata.sessionId,
    userId: metadata.userId,
    metadata: {
      tenantId: metadata.tenantId,
      taskId: metadata.taskId,
      query: metadata.query,
      url: metadata.url,
      complexity: metadata.complexity,
      tags: metadata.tags,
    },
  }
}

/**
 * Record a node execution in the interact flow
 *
 * Note: In v4, this logs to console when LangFuse is enabled
 * The actual spans are created by the observeOpenAI wrapper for LLM calls
 */
export async function recordNodeExecution(
  ctx: InteractTraceContext,
  node: {
    name: string
    input?: unknown
    output?: unknown
    durationMs?: number
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  if (!ctx.enabled) return

  // Log node execution for debugging
  // Note: Full span support requires OpenTelemetry setup
  console.log(`[LangFuse:Node] ${node.name}`, {
    durationMs: node.durationMs,
    hasInput: !!node.input,
    hasOutput: !!node.output,
  })
}

/**
 * Record an LLM generation in the interact flow
 *
 * Note: OpenAI calls are automatically traced by observeOpenAI
 * This is for logging additional context
 */
export async function recordGeneration(
  ctx: InteractTraceContext,
  generation: {
    name: string
    model: string
    input: string
    output: string
    usage?: {
      promptTokens: number
      completionTokens: number
    }
    durationMs?: number
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  if (!ctx.enabled) return

  // Log generation for debugging
  // Note: The actual generation is traced by observeOpenAI
  console.log(`[LangFuse:Generation] ${generation.name}`, {
    model: generation.model,
    durationMs: generation.durationMs,
    tokens: generation.usage
      ? generation.usage.promptTokens + generation.usage.completionTokens
      : undefined,
  })
}

/**
 * Record a verification result as a score
 */
export async function recordVerificationScore(
  ctx: InteractTraceContext,
  verification: {
    success: boolean
    confidence: number
    reason?: string
  }
): Promise<void> {
  if (!ctx.enabled) return

  // Add verification success score
  await addScore({
    name: "verification_success",
    value: verification.success ? 1 : 0,
    comment: verification.reason,
  })

  // Add verification confidence score
  await addScore({
    name: "verification_confidence",
    value: verification.confidence,
  })
}

/**
 * Record a correction attempt
 */
export async function recordCorrectionAttempt(
  ctx: InteractTraceContext,
  correction: {
    strategy: string
    success: boolean
    attemptNumber: number
    reason?: string
  }
): Promise<void> {
  if (!ctx.enabled) return

  // Add correction score
  await addScore({
    name: "correction_success",
    value: correction.success ? 1 : 0,
    comment: `Strategy: ${correction.strategy}, Attempt: ${correction.attemptNumber}. ${correction.reason || ""}`,
  })

  // Log correction attempt
  console.log(`[LangFuse:Correction] Attempt ${correction.attemptNumber}`, {
    strategy: correction.strategy,
    success: correction.success,
  })
}

/**
 * Finalize the interact trace
 */
export async function finalizeInteractTrace(
  ctx: InteractTraceContext,
  result: {
    status: string
    action?: string
    thought?: string
    durationMs: number
    complexity?: string
    error?: string
  }
): Promise<void> {
  if (!ctx.enabled) return

  // Add final status score
  const statusValue =
    result.status === "completed"
      ? 1
      : result.status === "in_progress"
        ? 0.5
        : 0

  await addScore({
    name: "task_status",
    value: statusValue,
    comment: `Status: ${result.status}, Duration: ${result.durationMs}ms, Complexity: ${result.complexity || "unknown"}${result.error ? `, Error: ${result.error}` : ""}`,
  })

  // Log trace completion
  console.log(`[LangFuse:Complete] status=${result.status}`, {
    durationMs: result.durationMs,
    complexity: result.complexity,
    hasError: !!result.error,
  })

  // Flush to ensure data is sent
  await flushLangfuse()
}

// =============================================================================
// Exports
// =============================================================================

export { LangfuseClient }
