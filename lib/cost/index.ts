/**
 * Cost Tracking Module
 *
 * Provides centralized cost tracking for LLM usage.
 *
 * Components:
 * - pricing.ts: Centralized pricing data for all providers
 * - usage-service.ts: Dual-write to MongoDB + LangFuse
 * - tracker.ts: Legacy cost tracking (kept for backward compatibility)
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 1 Task 3
 */

// Pricing module
export {
  MODEL_PRICING,
  calculateTokenCost,
  getModelPricing,
  getSupportedModels,
  getSupportedProviders,
  isModelSupported,
  type CostBreakdown,
  type LLMProvider,
  type ModelPricing,
  type TokenUsage,
} from "./pricing"

// Usage service (dual-write)
export {
  recordUsage,
  getUsageSummary,
  getRecentUsageLogs,
  getTenantCost,
  type RecordUsageInput,
  type RecordUsageResult,
} from "./usage-service"

// Legacy tracker (backward compatibility)
export {
  Cost,
  calculateCost,
  trackCost,
  getCostSummary,
  type ICost,
} from "./tracker"
