/**
 * LangGraph State Types for Interact Flow
 *
 * Defines the shared state that flows through the graph nodes.
 * Each node reads from and writes to this state.
 */

import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { WebSearchResult } from "@/lib/agent/web-search"
import type { TaskPlan, PlanStep } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import type { ContextAnalysisResult } from "@/lib/agent/reasoning/context-analyzer"

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
 * Verification result
 */
export interface VerificationResult {
  success: boolean
  confidence: number
  reason: string
  expectedState?: Record<string, unknown>
  actualState?: Record<string, unknown>
  comparison?: Record<string, unknown>
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

  // Session context
  sessionId?: string
  taskId?: string
  isNewTask: boolean

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

  // Previous actions history
  previousActions: PreviousAction[]
  previousMessages: Array<{
    role: "user" | "assistant"
    content: string
    timestamp: Date
  }>

  // Verification (for existing tasks)
  lastActionExpectedOutcome?: ExpectedOutcome
  lastAction?: string
  verificationResult?: VerificationResult

  // Correction (when verification fails)
  correctionResult?: CorrectionResult
  correctionAttempts: number
  consecutiveFailures: number

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
