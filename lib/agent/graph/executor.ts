/**
 * Graph Executor
 *
 * Executes the interact graph with the given input state.
 * This is the main entry point for using the graph from the route handler.
 */

import * as Sentry from "@sentry/nextjs"
import type { BlockerDetectionResult } from "@/lib/agent/blocker-detection"
import type { HierarchicalPlan } from "@/lib/agent/hierarchical-planning"
import type { ContextAnalysisResult } from "@/lib/agent/reasoning/context-analyzer"
import type {
  DomMode,
  ScrollableContainer,
  SemanticNodeV2,
  SemanticNodeV3,
} from "@/lib/agent/schemas"
import type { WebSearchResult } from "@/lib/agent/web-search"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { TaskAttachment, TaskPlan, TaskType } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import { logger } from "@/lib/utils/logger"
import { getInteractGraph } from "./interact-graph"
import { chatResponseNode } from "./nodes/chat-response"
import type {
  ActionResult,
  ComplexityLevel,
  CorrectionResult,
  InteractGraphConfig,
  InteractGraphState,
  PreviousAction,
  VerificationResult,
} from "./types"

/**
 * Parameters for executing the graph
 */
export interface ExecuteGraphParams {
  // Request context
  tenantId: string
  userId: string
  url: string
  query: string
  /** Full DOM HTML (legacy / may be empty string in semantic-first flow) */
  dom: string
  previousUrl?: string

  // Session context
  sessionId?: string
  taskId?: string
  isNewTask: boolean

  /** Langfuse trace ID for this interact request (one trace per message) */
  langfuseTraceId?: string

  // RAG context
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean

  // Existing task context (for continuation)
  plan?: TaskPlan
  currentStepIndex?: number
  /** Phase 4 Task 8: Hierarchical plan (sub-tasks) when decomposition was applied. */
  hierarchicalPlan?: HierarchicalPlan
  previousActions?: PreviousAction[]
  previousMessages?: Array<{
    role: "user" | "assistant"
    content: string
    timestamp: Date
  }>

  // Verification context (for existing tasks)
  lastActionExpectedOutcome?: ExpectedOutcome
  lastAction?: string
  /** Observation-Based Verification (v3.0): beforeState for last action */
  lastActionBeforeState?: {
    url: string
    domHash: string
    activeElement?: string
    semanticSkeleton?: Record<string, unknown>
  }
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

  // Task metrics
  correctionAttempts?: number
  consecutiveFailures?: number
  /** Semantic loop prevention: consecutive successful verifications without task_completed. */
  consecutiveSuccessWithoutTaskComplete?: number
  /** When previousActions were trimmed (rolling context), summary of earlier steps. */
  previousActionsSummary?: string

  // Existing web search result
  webSearchResult?: WebSearchResult | null

  // User-provided resolution data (from resume after blocker)
  userResolutionData?: Record<string, unknown>

  // Hybrid Vision + Skeleton fields
  /** Base64-encoded JPEG screenshot for visual context */
  screenshot?: string | null
  /** DOM processing mode: skeleton, full, or hybrid */
  domMode?: DomMode
  /** Pre-extracted skeleton DOM containing only interactive elements */
  skeletonDom?: string
  /** Hash of screenshot for deduplication */
  screenshotHash?: string

  // Semantic-first V3 fields (PRIMARY)
  interactiveTree?: SemanticNodeV3[]
  semanticNodes?: SemanticNodeV2[]
  viewport?: { width: number; height: number }
  pageTitle?: string
  scrollPosition?: string
  scrollableContainers?: ScrollableContainer[]
  recentEvents?: string[]
  hasErrors?: boolean
  hasSuccess?: boolean

  // File-Based Tasks & Chat Mode
  /** Task type classification from route */
  taskType?: TaskType
  /** Processed file attachments with extracted content */
  attachments?: TaskAttachment[]
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
  /** Phase 4 Task 8: Hierarchical plan (sub-tasks). */
  hierarchicalPlan?: HierarchicalPlan

  // Verification
  verificationResult?: VerificationResult

  // Correction
  correctionResult?: CorrectionResult
  correctionAttempts: number
  consecutiveFailures: number
  /** Semantic loop prevention: consecutive successful verifications without task_completed. */
  consecutiveSuccessWithoutTaskComplete?: number

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

  // Blocker detection
  blockerResult?: BlockerDetectionResult

  // Backend-driven page-state negotiation
  requestedDomMode?: "skeleton" | "hybrid" | "full"
  needsSkeletonDom?: boolean
  needsScreenshot?: boolean
  needsContextReason?: string

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
  const log = logger.child({
    process: "GraphExecutor",
    sessionId: params.sessionId,
    taskId: params.taskId ?? "",
  })

  log.info(`Starting graph execution for tenant ${params.tenantId}`)
  log.info(`Query: "${params.query.substring(0, 50)}..."`)
  log.info(`isNewTask=${params.isNewTask}, hasTaskId=${!!params.taskId}`)

  try {
    // Chat-only fast path: bypass full graph for non-web tasks
    if (params.taskType === "chat_only") {
      log.info("Chat-only task detected, bypassing full graph execution")

      // Build minimal state for chat response
      const chatState: InteractGraphState = {
        tenantId: params.tenantId,
        userId: params.userId,
        url: params.url || "",
        query: params.query,
        dom: "",
        isNewTask: params.isNewTask,
        sessionId: params.sessionId,
        taskId: params.taskId,
        langfuseTraceId: params.langfuseTraceId,
        ragChunks: params.ragChunks,
        hasOrgKnowledge: params.hasOrgKnowledge,
        previousActions: params.previousActions || [],
        previousMessages: params.previousMessages || [],
        currentStepIndex: 0,
        correctionAttempts: 0,
        consecutiveFailures: 0,
        consecutiveSuccessWithoutTaskComplete: 0,
        complexity: "SIMPLE",
        complexityReason: "Chat-only task",
        complexityConfidence: 1.0,
        status: "pending",
        startTime,
        // File-Based Tasks & Chat Mode
        taskType: params.taskType,
        attachments: params.attachments,
      }

      // Execute chat response node directly
      const chatResult = await chatResponseNode(chatState)
      const graphDuration = Date.now() - startTime

      log.info(`Chat-only response generated in ${graphDuration}ms`)

      return {
        success: chatResult.status !== "failed",
        complexity: "SIMPLE",
        complexityReason: "Chat-only task - no browser required",
        complexityConfidence: 1.0,
        currentStepIndex: 0,
        correctionAttempts: 0,
        consecutiveFailures: 0,
        consecutiveSuccessWithoutTaskComplete: 0,
        actionResult: chatResult.actionResult,
        llmUsage: chatResult.llmUsage,
        llmDuration: chatResult.llmDuration,
        status: chatResult.status || "completed",
        error: chatResult.error,
        graphDuration,
      }
    }

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

      // Semantic-first V3
      interactiveTree: params.interactiveTree,
      semanticNodes: params.semanticNodes,
      viewport: params.viewport,
      pageTitle: params.pageTitle,
      scrollPosition: params.scrollPosition,
      scrollableContainers: params.scrollableContainers,
      recentEvents: params.recentEvents,
      hasErrors: params.hasErrors,
      hasSuccess: params.hasSuccess,

      // Session context
      sessionId: params.sessionId,
      taskId: params.taskId,
      isNewTask: params.isNewTask,
      langfuseTraceId: params.langfuseTraceId,

      // RAG context
      ragChunks: params.ragChunks,
      hasOrgKnowledge: params.hasOrgKnowledge,

      // Existing task context
      plan: params.plan,
      currentStepIndex: params.currentStepIndex || 0,
      hierarchicalPlan: params.hierarchicalPlan,
      previousActions: params.previousActions || [],
      previousActionsSummary: params.previousActionsSummary,
      previousMessages: params.previousMessages || [],

      // Verification context
      lastActionExpectedOutcome: params.lastActionExpectedOutcome,
      lastAction: params.lastAction,
      lastActionBeforeState: params.lastActionBeforeState,
      clientVerification: params.clientVerification,
      clientObservations: params.clientObservations,

      // Task metrics
      correctionAttempts: params.correctionAttempts || 0,
      consecutiveFailures: params.consecutiveFailures || 0,
      consecutiveSuccessWithoutTaskComplete: params.consecutiveSuccessWithoutTaskComplete ?? 0,

      // Web search
      webSearchResult: params.webSearchResult,

      // User resolution data (from resume after blocker)
      userResolutionData: params.userResolutionData,

      // Hybrid Vision + Skeleton
      screenshot: params.screenshot,
      domMode: params.domMode,
      skeletonDom: params.skeletonDom,
      screenshotHash: params.screenshotHash,

      // File-Based Tasks & Chat Mode
      taskType: params.taskType,
      attachments: params.attachments,

      // Initial status
      status: "pending",
      startTime,
    }

    // Execute the graph
    log.info("Invoking graph")
    // Use type assertion for LangGraph's complex generic types
    const result = await (graph as any).invoke(initialState) as InteractGraphState
    const graphDuration = Date.now() - startTime

    log.info(`Graph completed in ${graphDuration}ms, status=${result.status}`)

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
      hierarchicalPlan: result.hierarchicalPlan,

      // Verification
      verificationResult: result.verificationResult,

      // Correction
      correctionResult: result.correctionResult,
      correctionAttempts: result.correctionAttempts || 0,
      consecutiveFailures: result.consecutiveFailures || 0,
      consecutiveSuccessWithoutTaskComplete: result.consecutiveSuccessWithoutTaskComplete,

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

      // Blocker detection
      blockerResult: result.blockerResult,

      // Backend-driven page-state negotiation
      requestedDomMode: result.requestedDomMode,
      needsSkeletonDom: result.needsSkeletonDom,
      needsScreenshot: result.needsScreenshot,
      needsContextReason: result.needsContextReason,

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

    log.error(`Graph execution failed after ${graphDuration}ms`, error)

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
