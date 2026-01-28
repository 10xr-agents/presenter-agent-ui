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

import { StateGraph, END, START } from "@langchain/langgraph"
import type { InteractGraphState, InteractGraphConfig, NodeName, ComplexityLevel, GraphTaskStatus } from "./types"
import { DEFAULT_GRAPH_CONFIG } from "./types"

// Import nodes
import { complexityCheckNode, routeAfterComplexityCheck } from "./nodes/complexity-check"
import { contextAnalysisNode, routeAfterContextAnalysis } from "./nodes/context-analysis"
import { planningNode, routeAfterPlanning } from "./nodes/planning"
import { replanningNode, routeAfterReplanning } from "./nodes/replanning" // Phase 3 Task 2
import { stepRefinementNode, routeAfterStepRefinement } from "./nodes/step-refinement"
import { directActionNode, routeAfterDirectAction } from "./nodes/direct-action"
import { actionGenerationNode, routeAfterActionGeneration } from "./nodes/action-generation"
import { verificationNode, routeAfterVerification } from "./nodes/verification"
import { correctionNode, routeAfterCorrection } from "./nodes/correction"
import { outcomePredictionNode, routeAfterOutcomePrediction } from "./nodes/outcome-prediction"
import { finalizeNode } from "./nodes/finalize"

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

      // Previous actions
      previousActions: { value: (a: any[], b?: any[]) => b ?? a, default: () => [] },
      previousMessages: { value: (a: any[], b?: any[]) => b ?? a, default: () => [] },

      // Verification
      lastActionExpectedOutcome: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      lastAction: { value: (a: string | undefined, b?: string | undefined) => b ?? a, default: () => undefined },
      verificationResult: { value: (a: any, b?: any) => b ?? a, default: () => undefined },

      // Correction
      correctionResult: { value: (a: any, b?: any) => b ?? a, default: () => undefined },
      correctionAttempts: { value: (a: number, b?: number) => b ?? a, default: () => 0 },
      consecutiveFailures: { value: (a: number, b?: number) => b ?? a, default: () => 0 },

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
  // Phase 3 Task 2: Route to replanning instead of planning for DOM/URL change handling
  typedGraph.addConditionalEdges(
    "verification",
    routeAfterVerification,
    {
      "correction": "correction",
      "planning": "replanning", // Route through replanning node
      "finalize": "finalize",
    }
  )

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
