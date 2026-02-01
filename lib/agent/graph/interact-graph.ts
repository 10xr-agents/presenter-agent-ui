/**
 * Interact Graph
 *
 * Main LangGraph definition for the interact flow.
 * Implements the Reason → Act → Verify loop with complexity routing.
 *
 * Graph structure:
 *
 *                     ┌─────────────────┐
 *                     │ complexity_check │
 *                     └────────┬────────┘
 *                              │
 *               ┌──────────────┴──────────────┐
 *               │ SIMPLE                      │ COMPLEX / existing task
 *               ▼                             ▼
 *     ┌─────────────────┐           ┌─────────────────┐
 *     │  direct_action  │           │  verification   │ (for existing tasks)
 *     └────────┬────────┘           │        OR       │
 *              │                    │ context_analysis│ (for new tasks)
 *              │                    └────────┬────────┘
 *              │                             │
 *              │                    ┌────────┴────────┐
 *              │                    │    planning     │
 *              │                    └────────┬────────┘
 *              │                             │
 *              │                    ┌────────┴────────┐
 *              │                    │ step_refinement │
 *              │                    └────────┬────────┘
 *              │                             │
 *              │                    (if refinement failed)
 *              │                    ┌────────┴────────┐
 *              │                    │action_generation│
 *              │                    └────────┬────────┘
 *              │                             │
 *              └──────────┬──────────────────┘
 *                         ▼
 *               ┌─────────────────┐
 *               │outcome_prediction│
 *               └────────┬────────┘
 *                        │
 *               ┌────────┴────────┐
 *               │    finalize     │
 *               └─────────────────┘
 *
 * Correction flow (on verification failure):
 *   verification → correction → outcome_prediction → finalize
 */

import { END, START, StateGraph } from "@langchain/langgraph"

// Import nodes
import { actionGenerationNode, routeAfterActionGeneration } from "./nodes/action-generation"
import { complexityCheckNode, routeAfterComplexityCheck } from "./nodes/complexity-check"
import { contextAnalysisNode, routeAfterContextAnalysis } from "./nodes/context-analysis"
import { correctionNode, routeAfterCorrection } from "./nodes/correction"
import { directActionNode, routeAfterDirectAction } from "./nodes/direct-action"
import { finalizeNode } from "./nodes/finalize"
import { goalAchievedNode } from "./nodes/goal-achieved"
import { outcomePredictionNode, routeAfterOutcomePrediction } from "./nodes/outcome-prediction"
import { planningNode, routeAfterPlanning } from "./nodes/planning"
import { replanningNode, routeAfterReplanning } from "./nodes/replanning" // Phase 3 Task 2
import { routeAfterStepRefinement, stepRefinementNode } from "./nodes/step-refinement"
import { routeAfterVerification, verificationNode } from "./nodes/verification"
import { DEFAULT_GRAPH_CONFIG } from "./types"
import type { ComplexityLevel, GraphTaskStatus, InteractGraphConfig, InteractGraphState, NodeName } from "./types"

/**
 * Create the interact graph
 *
 * @param config - Graph configuration
 * @returns Compiled graph
 */
export function createInteractGraph(config: InteractGraphConfig = DEFAULT_GRAPH_CONFIG) {
  // Define the graph with state type
  const graph = new StateGraph<InteractGraphState>({
    channels: {
      // Request context
      tenantId: { value: (a: string, b?: string) => b ?? a, default: () => "" },
      userId: { value: (a: string, b?: string) => b ?? a, default: () => "" },
      url: { value: (a: string, b?: string) => b ?? a, default: () => "" },
      query: { value: (a: string, b?: string) => b ?? a, default: () => "" },
      dom: { value: (a: string, b?: string) => b ?? a, default: () => "" },
      previousUrl: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },

      // Semantic-first V3 fields (PRIMARY)
      interactiveTree: { value: (a: any[] | undefined, b?: any[] | undefined) => b ?? a, default: () => undefined },
      semanticNodes: { value: (a: any[] | undefined, b?: any[] | undefined) => b ?? a, default: () => undefined },
      viewport: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      pageTitle: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },
      scrollPosition: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },
      scrollableContainers: { value: (a: any[] | undefined, b?: any[] | undefined) => b ?? a, default: () => undefined },
      recentEvents: { value: (a: any[] | undefined, b?: any[] | undefined) => b ?? a, default: () => undefined },
      hasErrors: { value: (a: boolean | undefined, b?: boolean | undefined) => b ?? a, default: () => undefined },
      hasSuccess: { value: (a: boolean | undefined, b?: boolean | undefined) => b ?? a, default: () => undefined },

      // Backend-driven page-state negotiation
      requestedDomMode: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      needsSkeletonDom: { value: (a: boolean | undefined, b?: boolean | undefined) => b ?? a, default: () => undefined },
      needsScreenshot: { value: (a: boolean | undefined, b?: boolean | undefined) => b ?? a, default: () => undefined },
      needsContextReason: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },

      // Session context
      sessionId: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },
      taskId: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },
      isNewTask: { value: (a: boolean, b?: boolean) => b ?? a, default: () => true },

      // RAG context
      ragChunks: { value: (a: any[], b?: any[]) => b ?? a, default: () => [] },
      hasOrgKnowledge: { value: (a: boolean, b?: boolean) => b ?? a, default: () => false },

      // Complexity routing
      complexity: { value: (a: any, b?: any) => b ?? a, default: (): ComplexityLevel => "COMPLEX" },
      complexityReason: { value: (a: string, b?: string) => b ?? a, default: () => "" },
      complexityConfidence: { value: (a: number, b?: number) => b ?? a, default: () => 0 },

      // Context analysis
      contextAnalysis: { value: (a: any, b?: any) => b ?? a, default: () => undefined },

      // Web search
      webSearchResult: { value: (a: any, b?: any) => b ?? a, default: () => null },

      // Planning
      plan: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      currentStepIndex: { value: (a: number, b?: number) => b ?? a, default: () => 0 },
      // Phase 4 Task 8: Hierarchical plan (sub-tasks)
      hierarchicalPlan: { value: (a: any, b?: any) => b ?? a, default: () => undefined },

      // Previous actions
      previousActions: { value: (a: any[], b?: any[]) => b ?? a, default: () => [] },
      previousActionsSummary: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },
      previousMessages: { value: (a: any[], b?: any[]) => b ?? a, default: () => [] },

      // Verification
      lastActionExpectedOutcome: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      lastAction: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },
      // Observation-Based Verification (v3.0): beforeState for DOM diff
      lastActionBeforeState: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      verificationResult: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      // Client-side verification (v2.1 - 100% accurate querySelector from extension)
      clientVerification: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      // Observation-Based Verification (v3.0): extension witnessed during/after action
      clientObservations: { value: (a: any, b?: any) => b ?? a, default: () => undefined },

      // Correction
      correctionResult: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      correctionAttempts: { value: (a: number, b?: number) => b ?? a, default: () => 0 },
      consecutiveFailures: { value: (a: number, b?: number) => b ?? a, default: () => 0 },
      consecutiveSuccessWithoutTaskComplete: { value: (a: number, b?: number) => b ?? a, default: () => 0 },

      // Phase 3 Task 2: Re-planning
      previousDom: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },
      replanningResult: { value: (a: any, b?: any) => b ?? a, default: () => undefined },

      // Action generation
      actionResult: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      expectedOutcome: { value: (a: any, b?: any) => b ?? a, default: () => undefined },

      // LLM metrics
      llmUsage: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      llmDuration: { value: (a: number | undefined, b?: number | undefined) => b ?? a, default: () => undefined },

      // Status
      status: { value: (a: any, b?: any) => b ?? a, default: (): GraphTaskStatus => "pending" },
      error: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },

      // Timing
      startTime: { value: (a: number, b?: number) => b ?? a, default: () => Date.now() },
      ragDuration: { value: (a: number | undefined, b?: number | undefined) => b ?? a, default: () => undefined },
    },
  })

  // Add nodes
  graph.addNode("complexity_check", complexityCheckNode)
  graph.addNode("context_analysis", contextAnalysisNode)
  graph.addNode("planning", planningNode)
  graph.addNode("replanning", replanningNode) // Phase 3 Task 2
  graph.addNode("step_refinement", stepRefinementNode)
  graph.addNode("direct_action", directActionNode)
  graph.addNode("action_generation", actionGenerationNode)
  graph.addNode("verification", verificationNode)
  graph.addNode("goal_achieved", goalAchievedNode)
  graph.addNode("correction", correctionNode)
  graph.addNode("outcome_prediction", outcomePredictionNode)
  graph.addNode("finalize", finalizeNode)

  // Use type assertion to work around LangGraph's strict type inference
  // The graph knows about these nodes at runtime after addNode calls
  const typedGraph = graph as any

  // Set entry point (connect START to complexity_check)
  typedGraph.addEdge(START, "complexity_check")

  // Add conditional edges from complexity_check
  typedGraph.addConditionalEdges(
    "complexity_check",
    routeAfterComplexityCheck,
    {
      "context_analysis": "context_analysis",
      "direct_action": "direct_action",
      "verification": "verification",
    }
  )

  // Add conditional edges from context_analysis
  typedGraph.addConditionalEdges(
    "context_analysis",
    routeAfterContextAnalysis,
    {
      "planning": "planning",
      "finalize": "finalize",
    }
  )

  // Add conditional edges from planning
  typedGraph.addConditionalEdges(
    "planning",
    routeAfterPlanning,
    {
      "step_refinement": "step_refinement",
      "action_generation": "action_generation",
    }
  )

  // Add conditional edges from step_refinement
  typedGraph.addConditionalEdges(
    "step_refinement",
    routeAfterStepRefinement,
    {
      "outcome_prediction": "outcome_prediction",
      "action_generation": "action_generation",
    }
  )

  // Add conditional edges from direct_action
  typedGraph.addConditionalEdges(
    "direct_action",
    routeAfterDirectAction,
    {
      "outcome_prediction": "outcome_prediction",
      "finalize": "finalize",
    }
  )

  // Add conditional edges from action_generation
  typedGraph.addConditionalEdges(
    "action_generation",
    routeAfterActionGeneration,
    {
      "outcome_prediction": "outcome_prediction",
      "finalize": "finalize",
    }
  )

  // Add conditional edges from verification
  // When verification indicates goal achieved, complete task (goal_achieved → finalize)
  // Phase 3 Task 2: Otherwise route to replanning for DOM/URL change handling
  typedGraph.addConditionalEdges(
    "verification",
    routeAfterVerification,
    {
      "correction": "correction",
      "goal_achieved": "goal_achieved",
      "planning": "replanning", // Route through replanning node
      "finalize": "finalize",
    }
  )

  // goal_achieved sets actionResult to finish() and goes to finalize
  typedGraph.addEdge("goal_achieved", "finalize")

  // Phase 3 Task 2: Add conditional edges from replanning
  typedGraph.addConditionalEdges(
    "replanning",
    routeAfterReplanning,
    {
      "planning": "planning",
      "step_refinement": "step_refinement",
      "finalize": "finalize",
    }
  )

  // Add conditional edges from correction
  typedGraph.addConditionalEdges(
    "correction",
    routeAfterCorrection,
    {
      "outcome_prediction": "outcome_prediction",
      "finalize": "finalize",
    }
  )

  // Add edge from outcome_prediction to finalize
  typedGraph.addConditionalEdges(
    "outcome_prediction",
    routeAfterOutcomePrediction,
    {
      "finalize": "finalize",
    }
  )

  // Add edge from finalize to END
  typedGraph.addEdge("finalize", END)

  // Compile and return
  return graph.compile()
}

/**
 * Singleton instance of the compiled graph
 */
let _graphInstance: ReturnType<typeof createInteractGraph> | null = null

/**
 * Get the singleton graph instance
 *
 * @param config - Graph configuration (only used on first call)
 * @returns Compiled graph
 */
export function getInteractGraph(config: InteractGraphConfig = DEFAULT_GRAPH_CONFIG) {
  if (!_graphInstance) {
    console.log(`[InteractGraph] Creating graph instance`)
    _graphInstance = createInteractGraph(config)
  }
  return _graphInstance
}

/**
 * Reset the graph instance (for testing)
 */
export function resetInteractGraph() {
  _graphInstance = null
}
