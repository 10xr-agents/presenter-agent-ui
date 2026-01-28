/**
 * Feature Flags Configuration
 *
 * Controls which features are enabled in the application.
 * These flags are for planned features that are not yet implemented.
 *
 * NOTE: LangGraph orchestration is now always enabled (Phase 1 complete).
 * See lib/agent/graph/ for the implementation.
 */

/**
 * Feature flags for the agent system
 */
export const FEATURE_FLAGS = {
  // ==========================================
  // Phase 1: Foundation (COMPLETED)
  // ==========================================
  // LangGraph + Complexity Routing: ALWAYS ON (no flag needed)
  // See: lib/agent/graph/

  /**
   * Enable LangFuse observability (planned).
   * When true: Sends traces to LangFuse.
   * When false: No LangFuse integration.
   */
  ENABLE_LANGFUSE: process.env.ENABLE_LANGFUSE === "true",

  /**
   * Enable dual cost tracking (planned).
   * When true: Logs token usage to both DB and LangFuse.
   * When false: Only logs to DB.
   */
  ENABLE_DUAL_COST_TRACKING: process.env.ENABLE_DUAL_COST_TRACKING === "true",

  // ==========================================
  // Phase 2: Knowledge Extraction
  // ==========================================

  /**
   * Enable local knowledge ingestion (planned).
   * When true: Uses in-app knowledge extraction.
   * When false: Proxies to external service.
   */
  ENABLE_LOCAL_INGESTION: process.env.ENABLE_LOCAL_INGESTION === "true",

  /**
   * Enable two-phase SPA ingestion (planned).
   * When true: Captures initial + post-interaction content.
   * When false: Single-phase ingestion only.
   */
  ENABLE_TWO_PHASE_INGESTION: process.env.ENABLE_TWO_PHASE_INGESTION === "true",

  // ==========================================
  // Phase 3: Batch & Adapt
  // ==========================================

  /**
   * Enable action chaining (planned).
   * When true: Returns multiple actions in single response.
   * When false: Single action per response.
   */
  ENABLE_ACTION_CHAINING: process.env.ENABLE_ACTION_CHAINING === "true",

  /**
   * Enable dynamic re-planning (planned).
   * When true: Re-evaluates plan on URL/DOM change.
   * When false: Static plan execution.
   */
  ENABLE_DYNAMIC_REPLANNING: process.env.ENABLE_DYNAMIC_REPLANNING === "true",

  /**
   * Enable semantic look-ahead verification (planned).
   * When true: Predicts and verifies next-goal availability.
   * When false: Standard verification only.
   */
  ENABLE_LOOKAHEAD_VERIFICATION: process.env.ENABLE_LOOKAHEAD_VERIFICATION === "true",

  // ==========================================
  // Phase 4: Advanced Logic
  // ==========================================

  /**
   * Enable critic loop (planned).
   * When true: Adds pre-execution reflection step.
   * When false: Direct action execution.
   */
  ENABLE_CRITIC_LOOP: process.env.ENABLE_CRITIC_LOOP === "true",

  /**
   * Enable skills library (planned).
   * When true: Uses episodic memory for learned patterns.
   * When false: No skill retrieval.
   */
  ENABLE_SKILLS_LIBRARY: process.env.ENABLE_SKILLS_LIBRARY === "true",

  /**
   * Enable conditional planning (planned).
   * When true: Plans include contingencies.
   * When false: Linear planning only.
   */
  ENABLE_CONDITIONAL_PLANNING: process.env.ENABLE_CONDITIONAL_PLANNING === "true",

  /**
   * Enable hierarchical planning (planned).
   * When true: Decomposes into sub-tasks.
   * When false: Single-task execution.
   */
  ENABLE_HIERARCHICAL_PLANNING: process.env.ENABLE_HIERARCHICAL_PLANNING === "true",
} as const

/**
 * Type for feature flag names
 */
export type FeatureFlagName = keyof typeof FEATURE_FLAGS

/**
 * Check if a feature flag is enabled
 *
 * @param flag - Feature flag name
 * @returns true if enabled
 */
export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  return FEATURE_FLAGS[flag]
}

/**
 * Get all enabled features (for logging)
 *
 * @returns Array of enabled feature names
 */
export function getEnabledFeatures(): FeatureFlagName[] {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagName[]).filter(
    (key) => FEATURE_FLAGS[key]
  )
}

/**
 * Log feature flag status (call on startup)
 */
export function logFeatureFlags(): void {
  const enabled = getEnabledFeatures()
  if (enabled.length > 0) {
    console.log(`[FeatureFlags] Enabled features: ${enabled.join(", ")}`)
  } else {
    console.log(`[FeatureFlags] No features enabled (using defaults)`)
  }
}
