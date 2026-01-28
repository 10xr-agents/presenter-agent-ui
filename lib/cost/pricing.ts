/**
 * Centralized Pricing Module
 *
 * Single source of truth for LLM pricing across providers.
 * All prices are in USD per 1M tokens.
 * Update this file when providers change their rates.
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 1 Task 3
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Supported LLM providers
 */
export type LLMProvider = "openai" | "anthropic" | "google"

/**
 * Pricing structure for a model
 */
export interface ModelPricing {
  /** Price per 1M input tokens in USD */
  inputPer1M: number
  /** Price per 1M output tokens in USD */
  outputPer1M: number
  /** Optional: cached/prompt caching price per 1M tokens */
  cachedInputPer1M?: number
}

/**
 * Usage data for cost calculation
 */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
}

/**
 * Calculated cost breakdown
 */
export interface CostBreakdown {
  /** Input token cost in USD */
  inputCostUSD: number
  /** Output token cost in USD */
  outputCostUSD: number
  /** Cached token cost in USD (if applicable) */
  cachedCostUSD: number
  /** Total cost in USD */
  totalCostUSD: number
  /** Total cost in cents (for DB storage) */
  totalCostCents: number
}

// =============================================================================
// Pricing Data
// =============================================================================

/**
 * LLM pricing by provider and model
 *
 * Prices as of January 2026
 * Source: Official provider pricing pages
 *
 * OpenAI: https://openai.com/pricing
 * Anthropic: https://www.anthropic.com/pricing
 * Google: https://cloud.google.com/vertex-ai/pricing
 */
export const MODEL_PRICING: Record<LLMProvider, Record<string, ModelPricing>> = {
  openai: {
    // GPT-4 Turbo
    "gpt-4-turbo-preview": { inputPer1M: 10.0, outputPer1M: 30.0 },
    "gpt-4-turbo": { inputPer1M: 10.0, outputPer1M: 30.0 },
    "gpt-4-1106-preview": { inputPer1M: 10.0, outputPer1M: 30.0 },
    
    // GPT-4
    "gpt-4": { inputPer1M: 30.0, outputPer1M: 60.0 },
    "gpt-4-32k": { inputPer1M: 60.0, outputPer1M: 120.0 },
    
    // GPT-4o (Omni)
    "gpt-4o": { inputPer1M: 5.0, outputPer1M: 15.0 },
    "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
    
    // GPT-3.5 Turbo
    "gpt-3.5-turbo": { inputPer1M: 0.5, outputPer1M: 1.5 },
    "gpt-3.5-turbo-16k": { inputPer1M: 3.0, outputPer1M: 4.0 },
    
    // o1 Reasoning models
    "o1-preview": { inputPer1M: 15.0, outputPer1M: 60.0 },
    "o1-mini": { inputPer1M: 3.0, outputPer1M: 12.0 },
  },
  
  anthropic: {
    // Claude 3.5
    "claude-3-5-sonnet-20241022": { inputPer1M: 3.0, outputPer1M: 15.0 },
    "claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4.0 },
    
    // Claude 3
    "claude-3-opus-20240229": { inputPer1M: 15.0, outputPer1M: 75.0 },
    "claude-3-sonnet-20240229": { inputPer1M: 3.0, outputPer1M: 15.0 },
    "claude-3-haiku-20240307": { inputPer1M: 0.25, outputPer1M: 1.25 },
    
    // Aliases
    "claude-3-opus": { inputPer1M: 15.0, outputPer1M: 75.0 },
    "claude-3-sonnet": { inputPer1M: 3.0, outputPer1M: 15.0 },
    "claude-3-haiku": { inputPer1M: 0.25, outputPer1M: 1.25 },
  },
  
  google: {
    // Gemini 1.5
    "gemini-1.5-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
    "gemini-1.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },
    
    // Gemini 1.0
    "gemini-1.0-pro": { inputPer1M: 0.5, outputPer1M: 1.5 },
  },
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get pricing for a specific model
 *
 * @param provider - LLM provider name
 * @param model - Model name
 * @returns Pricing info or null if not found
 */
export function getModelPricing(
  provider: string,
  model: string
): ModelPricing | null {
  const providerPricing = MODEL_PRICING[provider as LLMProvider]
  if (!providerPricing) return null
  
  // Try exact match first
  if (providerPricing[model]) {
    return providerPricing[model]
  }
  
  // Try to find a partial match (e.g., "gpt-4-turbo-preview" matches "gpt-4-turbo")
  for (const [modelKey, pricing] of Object.entries(providerPricing)) {
    if (model.startsWith(modelKey) || modelKey.startsWith(model)) {
      return pricing
    }
  }
  
  return null
}

/**
 * Calculate cost for token usage
 *
 * @param provider - LLM provider name
 * @param model - Model name
 * @param usage - Token usage data
 * @returns Cost breakdown or null if pricing not found
 */
export function calculateTokenCost(
  provider: string,
  model: string,
  usage: TokenUsage
): CostBreakdown | null {
  const pricing = getModelPricing(provider, model)
  
  if (!pricing) {
    console.warn(`[Pricing] No pricing found for ${provider}/${model}`)
    return null
  }
  
  const inputCostUSD = (usage.inputTokens / 1_000_000) * pricing.inputPer1M
  const outputCostUSD = (usage.outputTokens / 1_000_000) * pricing.outputPer1M
  const cachedCostUSD = pricing.cachedInputPer1M && usage.cachedTokens
    ? (usage.cachedTokens / 1_000_000) * pricing.cachedInputPer1M
    : 0
  
  const totalCostUSD = inputCostUSD + outputCostUSD + cachedCostUSD
  const totalCostCents = Math.round(totalCostUSD * 100)
  
  return {
    inputCostUSD,
    outputCostUSD,
    cachedCostUSD,
    totalCostUSD,
    totalCostCents,
  }
}

/**
 * Get list of supported providers
 */
export function getSupportedProviders(): LLMProvider[] {
  return Object.keys(MODEL_PRICING) as LLMProvider[]
}

/**
 * Get list of supported models for a provider
 */
export function getSupportedModels(provider: LLMProvider): string[] {
  return Object.keys(MODEL_PRICING[provider] || {})
}

/**
 * Check if a model is supported
 */
export function isModelSupported(provider: string, model: string): boolean {
  return getModelPricing(provider, model) !== null
}
