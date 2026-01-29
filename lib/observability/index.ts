/**
 * Observability Module
 *
 * Provides unified access to observability tools:
 * - LangFuse: LLM-specific tracing (prompts, completions, tokens, latency)
 * - Sentry: Error monitoring (handled separately in sentry.*.config.ts)
 *
 * Separation of concerns:
 * - LangFuse captures: LLM generations, token usage, scores
 * - Sentry captures: Exceptions, errors, performance alerts
 *
 * LLM calls use Google Gemini (@/lib/llm/gemini-client).
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 1 Task 2
 */

export {
  // Client access
  getLangfuseClient,
  isLangfuseEnabled,
  
  // Score management
  addScore,
  
  // Lifecycle
  flushLangfuse,
  shutdownLangfuse,
  
  // Interact flow tracing helpers
  startInteractTrace,
  recordNodeExecution,
  recordGeneration,
  recordVerificationScore,
  recordCorrectionAttempt,
  finalizeInteractTrace,
  
  // Types
  type ScoreData,
  type InteractTraceContext,
} from "./langfuse-client"
