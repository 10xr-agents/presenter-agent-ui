/**
 * Types for route integration (interact graph input/output).
 * @see INTERACT_FLOW_WALKTHROUGH.md
 */

import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { TaskPlan } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"

/**
 * Input for running the graph from the route
 */
export interface RunGraphInput {
  tenantId: string
  userId: string
  url: string
  query: string
  dom: string
  previousUrl?: string
  sessionId?: string
  taskId?: string
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean
  clientVerification?: {
    elementFound: boolean
    selector?: string
    urlChanged?: boolean
    timestamp?: number
  }
  clientObservations?: {
    didNetworkOccur?: boolean
    didDomMutate?: boolean
    didUrlChange?: boolean
  }
}

/**
 * Chained action in output (Phase 2 Task 1)
 */
export interface ChainedActionOutput {
  action: string
  description: string
  index: number
  canFail?: boolean
  targetElementId?: number
}

/**
 * Chain metadata in output (Phase 2 Task 1)
 */
export interface ChainMetadataOutput {
  totalActions: number
  estimatedDuration?: number
  safeToChain: boolean
  chainReason: "FORM_FILL" | "RELATED_INPUTS" | "BULK_SELECTION" | "SEQUENTIAL_STEPS" | "OPTIMIZED_PATH"
  containerSelector?: string
}

/**
 * Output from the graph execution
 */
export interface RunGraphOutput {
  success: boolean
  taskId: string
  isNewTask: boolean
  thought?: string
  action?: string
  chainedActions?: ChainedActionOutput[]
  chainMetadata?: ChainMetadataOutput
  plan?: TaskPlan
  currentStepIndex: number
  verificationResult?: {
    success: boolean
    confidence: number
    reason: string
  }
  correctionResult?: {
    strategy: string
    reason: string
    retryAction: string
  }
  expectedOutcome?: ExpectedOutcome
  webSearchPerformed: boolean
  webSearchSummary?: string
  llmUsage?: {
    promptTokens: number
    completionTokens: number
  }
  llmDuration?: number
  complexity: string
  complexityReason: string
  status: string
  error?: string
  needsUserInput: boolean
  userQuestion?: string
  missingInformation?: string[]
  graphDuration: number
}
