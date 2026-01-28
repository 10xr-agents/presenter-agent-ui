/**
 * Graph Executor
 *
 * Executes the interact graph with the given input state.
 * This is the main entry point for using the graph from the route handler.
 */

import * as Sentry from "@sentry/nextjs"
import { getInteractGraph } from "./interact-graph"
import type {
  InteractGraphState,
  InteractGraphConfig,
  PreviousAction,
  ComplexityLevel,
  VerificationResult,
  CorrectionResult,
  ActionResult,
} from "./types"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { WebSearchResult } from "@/lib/agent/web-search"
import type { TaskPlan } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import type { ContextAnalysisResult } from "@/lib/agent/reasoning/context-analyzer"

/**
 * Parameters for executing the graph
 */
export interface ExecuteGraphParams {
  // Request context
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

  // Existing task context (for continuation)
  plan?: TaskPlan
  currentStepIndex?: number
  previousActions?: PreviousAction[]
  previousMessages?: Array<{
    role: "user" | "assistant"
    content: string
    timestamp: Date
  }>

  // Verification context (for existing tasks)
  lastActionExpectedOutcome?: ExpectedOutcome
  lastAction?: string

  // Task metrics
  correctionAttempts?: number
  consecutiveFailures?: number

  // Existing web search result
  webSearchResult?: WebSearchResult | null
}

/**
 * Result from graph execution
 */
export interface ExecuteGraphResult {
  // Success indicator
  success: boolean

  // Complexity classification
  complexity: ComplexityLevel
  complexityReason: string
  complexityConfidence: number

  // Context analysis
  contextAnalysis?: ContextAnalysisResult

  // Web search
  webSearchResult?: WebSearchResult | null

  // Planning
  plan?: TaskPlan
  currentStepIndex: number

  // Verification
  verificationResult?: VerificationResult

  // Correction
  correctionResult?: CorrectionResult
  correctionAttempts: number
  consecutiveFailures: number

  // Action (and failed action when correction occurred, for CorrectionRecord.originalStep)
  actionResult?: ActionResult
  lastAction?: string
  expectedOutcome?: ExpectedOutcome

  // LLM metrics
  llmUsage?: {
    promptTokens: number
    completionTokens: number
  }
  llmDuration?: number

  // Status
  status: string
  error?: string

  // Timing
  graphDuration: number
}

/**
 * Execute the interact graph
 *
 * @param params - Input parameters
 * @param config - Optional graph configuration
 * @returns Execution result
 */
export async function executeInteractGraph(
  params: ExecuteGraphParams,
  config?: InteractGraphConfig
): Promise<ExecuteGraphResult> {
  const startTime = Date.now()

  console.log(`[GraphExecutor] Starting graph execution for tenant ${params.tenantId}`)
  console.log(`[GraphExecutor] Query: "${params.query.substring(0, 50)}..."`)
  console.log(`[GraphExecutor] isNewTask=${params.isNewTask}, hasTaskId=${!!params.taskId}`)

  try {
    // Get the graph instance
    const graph = getInteractGraph(config)
    if (!graph) {
      throw new Error("Failed to create graph instance")
    }

    // Build initial state
    const initialState: Partial<InteractGraphState> = {
      // Request context
      tenantId: params.tenantId,
      userId: params.userId,
      url: params.url,
      query: params.query,
      dom: params.dom,
      previousUrl: params.previousUrl,

      // Session context
      sessionId: params.sessionId,
      taskId: params.taskId,
      isNewTask: params.isNewTask,

      // RAG context
      ragChunks: params.ragChunks,
      hasOrgKnowledge: params.hasOrgKnowledge,

      // Existing task context
      plan: params.plan,
      currentStepIndex: params.currentStepIndex || 0,
      previousActions: params.previousActions || [],
      previousMessages: params.previousMessages || [],

      // Verification context
      lastActionExpectedOutcome: params.lastActionExpectedOutcome,
      lastAction: params.lastAction,

      // Task metrics
      correctionAttempts: params.correctionAttempts || 0,
      consecutiveFailures: params.consecutiveFailures || 0,

      // Web search
      webSearchResult: params.webSearchResult,

      // Initial status
      status: "pending",
      startTime,
    }

    // Execute the graph
    console.log(`[GraphExecutor] Invoking graph`)
    // Use type assertion for LangGraph's complex generic types
    const result = await (graph as any).invoke(initialState) as InteractGraphState
    const graphDuration = Date.now() - startTime

    console.log(`[GraphExecutor] Graph completed in ${graphDuration}ms, status=${result.status}`)

    // Build result
    return {
      success: result.status !== "failed",

      // Complexity
      complexity: result.complexity || "COMPLEX",
      complexityReason: result.complexityReason || "",
      complexityConfidence: result.complexityConfidence || 0,

      // Context analysis
      contextAnalysis: result.contextAnalysis,

      // Web search
      webSearchResult: result.webSearchResult,

      // Planning
      plan: result.plan,
      currentStepIndex: result.currentStepIndex || 0,

      // Verification
      verificationResult: result.verificationResult,

      // Correction
      correctionResult: result.correctionResult,
      correctionAttempts: result.correctionAttempts || 0,
      consecutiveFailures: result.consecutiveFailures || 0,

      // Action (include lastAction when correction occurred for CorrectionRecord.originalStep)
      actionResult: result.actionResult,
      expectedOutcome: result.expectedOutcome,
      lastAction: result.lastAction,

      // LLM metrics
      llmUsage: result.llmUsage,
      llmDuration: result.llmDuration,

      // Status
      status: result.status || "unknown",
      error: result.error,

      // Timing
      graphDuration,
    }
  } catch (error: unknown) {
    const graphDuration = Date.now() - startTime

    Sentry.captureException(error, {
      tags: { component: "graph-executor" },
      extra: {
        tenantId: params.tenantId,
        query: params.query.substring(0, 100),
        isNewTask: params.isNewTask,
      },
    })

    console.error(`[GraphExecutor] Graph execution failed after ${graphDuration}ms:`, error)

    return {
      success: false,
      complexity: "COMPLEX",
      complexityReason: "Error occurred",
      complexityConfidence: 0,
      currentStepIndex: params.currentStepIndex || 0,
      correctionAttempts: params.correctionAttempts || 0,
      consecutiveFailures: params.consecutiveFailures || 0,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      graphDuration,
    }
  }
}
