/**
 * LangGraph State Types for Interact Flow
 *
 * Defines the shared state that flows through the graph nodes.
 * Each node reads from and writes to this state.
 */

import type { HierarchicalPlan } from "@/lib/agent/hierarchical-planning"
import type { ContextAnalysisResult } from "@/lib/agent/reasoning/context-analyzer"
import type { DomMode } from "@/lib/agent/schemas"
import type { WebSearchResult } from "@/lib/agent/web-search"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { PlanStep, TaskPlan } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"

/**
 * Complexity classification for routing
 */
export type ComplexityLevel = "SIMPLE" | "COMPLEX"

/**
 * Task status in the graph
 */
export type GraphTaskStatus =
  | "pending"
  | "analyzing"
  | "planning"
  | "executing"
  | "verifying"
  | "correcting"
  | "completed"
  | "failed"
  | "needs_user_input"

/**
 * Chained action (for action chaining - Phase 2 Task 1)
 */
export interface ChainedActionResult {
  /** The action string (e.g., "setValue(101, 'John')") */
  action: string
  /** Human-readable description */
  description: string
  /** Position in chain (0-indexed) */
  index: number
  /** If true, chain continues even if this action fails */
  canFail?: boolean
  /** Target element ID */
  targetElementId?: number
}

/**
 * Chain metadata (for action chaining - Phase 2 Task 1)
 */
export interface ChainMetadataResult {
  /** Total actions in chain */
  totalActions: number
  /** Estimated execution duration (ms) */
  estimatedDuration?: number
  /** Server confidence that chain is safe */
  safeToChain: boolean
  /** Reason for chaining */
  chainReason: "FORM_FILL" | "RELATED_INPUTS" | "BULK_SELECTION" | "SEQUENTIAL_STEPS" | "OPTIMIZED_PATH"
  /** Container selector */
  containerSelector?: string
}

/**
 * Action result from execution
 */
export interface ActionResult {
  thought: string
  action: string
  /** When action is finish("..."), this contains the extracted message for display */
  finishMessage?: string
  toolAction?: {
    toolName: string
    toolType: "DOM" | "SERVER"
    parameters: Record<string, unknown>
  }
  /** Chained actions (Phase 2 Task 1) - when present, action is first in chain */
  chainedActions?: ChainedActionResult[]
  /** Chain metadata (Phase 2 Task 1) */
  chainMetadata?: ChainMetadataResult
}

/**
 * Phase 5: Verification tier used (for observability and cost tracking).
 */
export type VerificationTier = "deterministic" | "lightweight" | "full"

/**
 * Verification result.
 * goalAchieved is set when semantic LLM returns task_completed=true with confidence >= 0.85.
 * success is set when action_succeeded=true and confidence >= 0.7 (route to next action vs correction).
 * Router uses goalAchieved and success only; do not parse reason.
 */
export interface VerificationResult {
  success: boolean
  confidence: number
  reason: string
  expectedState?: Record<string, unknown>
  actualState?: Record<string, unknown>
  comparison?: Record<string, unknown>
  /** True when engine determined user's goal was achieved (task_completed + confidence). */
  goalAchieved?: boolean
  /** True when this action did something useful; used with success for routing. */
  action_succeeded?: boolean
  /** True when entire user goal is done; used with confidence for goalAchieved. */
  task_completed?: boolean
  /** Phase 4 Task 9: True when current sub-task objective was achieved (hierarchical only). */
  sub_task_completed?: boolean
  /** Short semantic summary for display; set by engine. */
  semanticSummary?: string
  /** Phase 5: Which verification tier was used. */
  verificationTier?: VerificationTier
  /** Phase 5: Estimated tokens saved by using tiered verification. */
  tokensSaved?: number
  /** Phase 5: When true, bypass Tier 2/3 and route directly to Correction (hard failures). */
  routeToCorrection?: boolean
}

/**
 * Correction result
 */
export interface CorrectionResult {
  strategy:
    | "ALTERNATIVE_SELECTOR"
    | "ALTERNATIVE_TOOL"
    | "GATHER_INFORMATION"
    | "UPDATE_PLAN"
    | "RETRY_WITH_DELAY"
  reason: string
  retryAction: string
  correctedStep?: PlanStep
}

/**
 * Phase 3 Task 2: Re-planning result
 */
export interface ReplanningResult {
  /** Whether re-planning was triggered */
  triggered: boolean
  /** Whether the existing plan is still valid */
  planValid: boolean
  /** Reason for re-planning or validation result */
  reason: string
  /** Trigger reasons (URL change, DOM similarity, etc.) */
  triggerReasons: string[]
  /** DOM similarity score (0-1) */
  domSimilarity?: number
  /** Whether URL changed */
  urlChanged: boolean
  /** Suggested modifications (if plan can be salvaged) */
  suggestedChanges?: string[]
  /**
   * True when a new plan was generated (step index reset to 0).
   * Router uses this only to route to planning; do not parse reason text.
   */
  planRegenerated?: boolean
}

/**
 * Previous action in history
 */
export interface PreviousAction {
  stepIndex: number
  thought: string
  action: string
  status?: "success" | "failure" | "pending"
  error?: {
    message: string
    code: string
  }
  domSummary?: string
}

/**
 * LLM usage metrics
 */
export interface LLMUsage {
  promptTokens: number
  completionTokens: number
}

/**
 * Main graph state - all data that flows through the graph
 */
export interface InteractGraphState {
  // Request context (immutable during graph execution)
  tenantId: string
  userId: string
  url: string
  query: string
  dom: string
  previousUrl?: string

  // Hybrid Vision + Skeleton fields
  /** Base64-encoded JPEG screenshot of visible viewport (max 1024px width, quality 0.7) */
  screenshot?: string | null
  /** Processing mode: skeleton (fast), full (legacy), or hybrid (vision + skeleton) */
  domMode?: DomMode
  /** Skeleton DOM containing only interactive elements */
  skeletonDom?: string
  /** Hash of current screenshot for deduplication */
  screenshotHash?: string

  // Session context
  sessionId?: string
  taskId?: string
  isNewTask: boolean

  /** Langfuse trace ID for this interact request (one trace per message; costs/scores attach here) */
  langfuseTraceId?: string

  // RAG context
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean

  // Complexity routing
  complexity: ComplexityLevel
  complexityReason: string
  complexityConfidence: number

  // Context analysis (reasoning)
  contextAnalysis?: ContextAnalysisResult

  // Web search results
  webSearchResult?: WebSearchResult | null

  // Planning
  plan?: TaskPlan
  currentStepIndex: number
  /** Phase 4 Task 8: Hierarchical plan (sub-tasks) when decomposition was applied. */
  hierarchicalPlan?: HierarchicalPlan
  /** True when all plan steps have been executed but task wasn't marked complete.
   * Signals to action generation that it should check goal completion and finish. */
  planExhausted?: boolean

  // Previous actions history
  previousActions: PreviousAction[]
  /** When previousActions were trimmed (rolling context), summary of earlier steps. */
  previousActionsSummary?: string
  previousMessages: Array<{
    role: "user" | "assistant"
    content: string
    timestamp: Date
  }>

  // Verification (for existing tasks)
  lastActionExpectedOutcome?: ExpectedOutcome
  lastAction?: string
  /** Observation-Based Verification (v3.0): beforeState for the last action (DOM diff) */
  lastActionBeforeState?: {
    url: string
    domHash: string
    activeElement?: string
    semanticSkeleton?: Record<string, unknown>
  }
  verificationResult?: VerificationResult
  // Client-side verification result (100% accurate querySelector from extension)
  clientVerification?: {
    elementFound: boolean
    selector?: string
    urlChanged?: boolean
    timestamp?: number
  }
  /** Observation-Based Verification (v3.0): extension witnessed during/after action */
  clientObservations?: {
    didNetworkOccur?: boolean
    didDomMutate?: boolean
    didUrlChange?: boolean
  }

  // Correction (when verification fails)
  correctionResult?: CorrectionResult
  correctionAttempts: number
  consecutiveFailures: number
  /** Semantic loop prevention: consecutive successful verifications without task_completed (goal not achieved). When >= threshold, route to finalize. */
  consecutiveSuccessWithoutTaskComplete: number

  // Phase 3 Task 2: Re-planning
  previousDom?: string // DOM from previous request (for similarity comparison)
  replanningResult?: ReplanningResult

  // Action generation
  actionResult?: ActionResult
  expectedOutcome?: ExpectedOutcome

  // LLM metrics
  llmUsage?: LLMUsage
  llmDuration?: number

  // Graph execution state
  status: GraphTaskStatus
  error?: string

  // Timing
  startTime: number
  ragDuration?: number
}

/**
 * Graph configuration (constants that don't change during execution)
 */
export interface InteractGraphConfig {
  maxStepsPerTask: number
  maxRetriesPerStep: number
  maxConsecutiveFailures: number
  complexityThreshold: number // Word count threshold for SIMPLE classification
}

/**
 * Default graph configuration
 */
export const DEFAULT_GRAPH_CONFIG: InteractGraphConfig = {
  maxStepsPerTask: 50,
  maxRetriesPerStep: 3,
  maxConsecutiveFailures: 3,
  complexityThreshold: 6, // Queries with < 6 words and action verbs are SIMPLE
}

/**
 * Node names in the graph
 */
export type NodeName =
  | "complexity_check"
  | "context_analysis"
  | "planning"
  | "replanning" // Phase 3 Task 2
  | "step_refinement"
  | "action_generation"
  | "verification"
  | "goal_achieved" // When verification indicates user goal was achieved
  | "correction"
  | "direct_action"
  | "outcome_prediction"
  | "finalize"

/**
 * Edge conditions for routing
 */
export type EdgeCondition =
  | "simple_path"
  | "complex_path"
  | "needs_user_input"
  | "needs_web_search"
  | "has_plan"
  | "no_plan"
  | "verification_success"
  | "verification_failure"
  | "correction_success"
  | "correction_failure"
  | "max_retries_exceeded"
  | "task_complete"
  | "task_failed"
