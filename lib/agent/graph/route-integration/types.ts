/**
 * Types for route integration (interact graph input/output).
 * @see INTERACT_FLOW_WALKTHROUGH.md
 */

import type { ElementMap } from "@/lib/agent/dom-element-mapping"
import type { MemoryActionResult } from "@/lib/agent/memory"
import type {
  DomMode,
  ScrollableContainer,
  SemanticNodeV2,
  SemanticNodeV3,
} from "@/lib/agent/schemas"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { TaskAttachment, TaskPlan, TaskType } from "@/lib/models/task"
import type { ExpectedOutcome } from "@/lib/models/task-action"

/**
 * Input for running the graph from the route
 */
export interface RunGraphInput {
  tenantId: string
  userId: string
  url: string
  query: string
  /** Full DOM HTML (legacy / optional in semantic-first flow) */
  dom?: string
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
  /** Minified interactive element tree */
  interactiveTree?: SemanticNodeV3[]
  /** V2 semantic nodes (fallback format) */
  semanticNodes?: SemanticNodeV2[]
  /** Viewport dimensions (for spatial reasoning / click targeting) */
  viewport?: { width: number; height: number }
  /** Page title (small context hint) */
  pageTitle?: string
  /** Scroll depth percentage (e.g., "25%") */
  scrollPosition?: string
  /** Virtual list / scroll container summary */
  scrollableContainers?: ScrollableContainer[]
  /** Recent DOM mutation stream (compact strings) */
  recentEvents?: string[]
  /** Sentinel-style flags */
  hasErrors?: boolean
  hasSuccess?: boolean
  // Robust Element Selectors
  /** Element mapping for selectorPath fallbacks (parsed from DOM) */
  elementMap?: ElementMap
  // File-Based Tasks & Chat Mode
  /** Task type classification from route */
  taskType?: TaskType
  /** Processed file attachments with extracted content */
  attachments?: TaskAttachment[]
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
/**
 * Structured action details with selector fallback (Robust Element Selectors)
 * @see docs/ROBUST_ELEMENT_SELECTORS_SPEC.md
 */
export interface ActionDetails {
  /** Action name: click, setValue, press, navigate, finish, fail, etc. */
  name: string
  /** Element ID for DOM actions */
  elementId?: string | number
  /** CSS selector path for robust re-finding (from DOM extraction) */
  selectorPath?: string
  /** Additional arguments (e.g., value for setValue) */
  args?: Record<string, unknown>
}

export interface RunGraphOutput {
  success: boolean
  taskId: string
  isNewTask: boolean
  thought?: string
  action?: string
  // Backend-driven page-state negotiation
  requestedDomMode?: "skeleton" | "hybrid" | "full"
  needsSkeletonDom?: boolean
  needsScreenshot?: boolean
  needsContextReason?: string
  /** Structured action details with selectorPath for robust element finding */
  actionDetails?: ActionDetails
  /**
   * Tool action metadata from step refinement.
   * When toolType is "SERVER", the extension should NOT execute the action
   * and instead immediately request the next action.
   */
  toolAction?: {
    toolName: string
    toolType: "DOM" | "SERVER"
    parameters: Record<string, unknown>
    /** Result from memory actions (remember, recall, exportToSession) */
    memoryResult?: MemoryActionResult
  }
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
  /**
   * Blocker information when task is paused awaiting user intervention.
   * Present when status is "awaiting_user".
   */
  blockerInfo?: {
    /** Type of blocker (login_failure, mfa_required, captcha, etc.) */
    type: string
    /** Human-readable description of the blocker */
    description: string
    /** User-friendly message explaining what to do */
    userMessage?: string
    /** How the user can resolve the blocker */
    resolutionMethods: Array<"user_action_on_web" | "provide_in_chat" | "auto_retry" | "alternative_action">
    /** Fields the user needs to provide (for login, MFA, etc.) */
    requiredFields?: Array<{
      name: string
      label: string
      type: "text" | "password" | "email" | "code"
      description?: string
    }>
    /** Suggested wait time before retry (for rate_limit type) */
    retryAfterSeconds?: number
    /** Confidence score (0-1) */
    confidence?: number
  }
}
