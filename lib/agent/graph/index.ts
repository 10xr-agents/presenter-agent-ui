/**
 * Graph Module Index
 *
 * LangGraph-based orchestration for the Interact Flow.
 * Implements the Reason → Act → Verify loop with complexity routing.
 *
 * Always on (no feature flag). Graph Structure:
 * - complexity_check: Classifies task as SIMPLE or COMPLEX
 * - SIMPLE path: direct_action → outcome_prediction → finalize
 * - COMPLEX path: context_analysis → planning → step_refinement → action_generation → outcome_prediction → finalize
 * - Verification/Correction: verification → correction (on failure)
 */

// Types
export * from "./types"

// Complexity classifier
export { classifyComplexity, isDefinitelySimple, isDefinitelyComplex } from "./complexity-classifier"

// Graph
export { createInteractGraph, getInteractGraph, resetInteractGraph } from "./interact-graph"

// Executor
export { executeInteractGraph, type ExecuteGraphParams, type ExecuteGraphResult } from "./executor"

// Route integration
export { runInteractGraph, type RunGraphInput, type RunGraphOutput } from "./route-integration"
