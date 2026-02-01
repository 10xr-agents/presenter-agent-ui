import { z } from "zod"

// =============================================================================
// Action Chaining Schemas (Phase 2 Task 1)
// =============================================================================

/**
 * Schema for partial chain state reported by client on failure
 */
export const chainPartialStateSchema = z.object({
  /** Actions that executed successfully */
  executedActions: z.array(z.string()),
  /** DOM state after last successful action (optional) */
  domAfterLastSuccess: z.string().optional(),
  /** Total actions in the original chain */
  totalActionsInChain: z.number().int().positive(),
})

export type ChainPartialState = z.infer<typeof chainPartialStateSchema>

/**
 * Schema for chain action error details
 */
export const chainActionErrorSchema = z.object({
  /** The action that failed */
  action: z.string(),
  /** Error message */
  message: z.string(),
  /** Error code (e.g., 'ELEMENT_NOT_FOUND', 'TIMEOUT') */
  code: z.string(),
  /** Element ID that couldn't be found (if applicable) */
  elementId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  /** Index of the failed action in the chain */
  failedIndex: z.number().int().nonnegative(),
})

export type ChainActionError = z.infer<typeof chainActionErrorSchema>

/**
 * DOM processing mode for hybrid vision + skeleton pipeline
 * Semantic is PRIMARY mode with ultra-light extraction
 */
export const domModeSchema = z.enum(["semantic", "skeleton", "full", "hybrid"])
export type DomMode = z.infer<typeof domModeSchema>

// =============================================================================
// V3 Semantic Extraction Schemas
// =============================================================================

/**
 * V3 Semantic Node (minified keys for token efficiency)
 * See docs/DOM_EXTRACTION_ARCHITECTURE.md for full specification
 */
export const semanticNodeV3Schema = z.object({
  /** Element ID (stable data-llm-id) - use this in click(i) or setValue(i, text) */
  i: z.string(),
  /** Role (minified: btn=button, inp=input, link=link, chk=checkbox, sel=select) */
  r: z.string(),
  /** Name/label visible to user */
  n: z.string(),
  /** Current value (for inputs) */
  v: z.string().optional(),
  /** State (disabled, checked, expanded, etc.) */
  s: z.string().optional(),
  /** [x, y] center coordinates on screen */
  xy: z.tuple([z.number(), z.number()]).optional(),
  /** Frame ID (0 = main frame, omitted if 0) */
  f: z.number().optional(),
  // V3 ADVANCED FIELDS:
  /** Bounding box [x, y, width, height] for Set-of-Mark multimodal */
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  /** Scrollable container info: depth=scroll%, h=hasMore */
  scr: z
    .object({
      depth: z.string(),
      h: z.boolean(),
    })
    .optional(),
  /** True if element is occluded by modal/overlay (don't click) */
  occ: z.boolean().optional(),
})

export type SemanticNodeV3 = z.infer<typeof semanticNodeV3Schema>

/**
 * V2 Semantic Node (full keys, fallback format)
 */
export const semanticNodeV2Schema = z.object({
  id: z.string(),
  role: z.string(),
  name: z.string(),
  value: z.string().optional(),
  state: z.string().optional(),
  type: z.string().optional(),
  placeholder: z.string().optional(),
  href: z.string().optional(),
  isInShadow: z.boolean().optional(),
  frameId: z.number().optional(),
  bounds: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
})

export type SemanticNodeV2 = z.infer<typeof semanticNodeV2Schema>

/**
 * Scrollable container info for virtual list detection
 */
export const scrollableContainerSchema = z.object({
  id: z.string(),
  depth: z.string(),
  hasMore: z.boolean(),
})

export type ScrollableContainer = z.infer<typeof scrollableContainerSchema>

/**
 * Request body schema for POST /api/agent/interact
 */
export const interactRequestBodySchema = z.object({
  url: z.string().refine((val) => {
    try {
      new URL(val)
      return true
    } catch {
      return false
    }
  }, "Invalid URL"),
  query: z.string().min(1).max(10000),
  /**
   * Full DOM HTML (legacy / fallback).
   *
   * IMPORTANT (V3 semantic-first negotiation):
    * - When domMode === "semantic", clients SHOULD NOT send full HTML by default.
    * - Backend MUST tolerate dom being missing/empty in that case.
   */
  dom: z.string().max(1000000).optional(),
  // =========================================================================
  // Hybrid Vision + Skeleton Fields
  // =========================================================================
  /**
   * Base64-encoded JPEG screenshot of visible viewport.
   * - Max width: 1024px (aspect ratio maintained)
   * - Quality: 0.7 (JPEG)
   * - null if screenshot unchanged since last request (perceptual hash match)
   * - Max size: 2MB base64 encoded (~1.5MB actual image)
   */
  screenshot: z.string().max(2000000).nullable().optional(),
  /**
   * Processing mode hint for server.
   * - "skeleton": Use skeletonDom only (fast, low tokens)
   * - "full": Use full dom only (backward compatible)
   * - "hybrid": Use screenshot + skeletonDom (best for visual tasks)
   */
  domMode: domModeSchema.optional(),
  /**
   * Skeleton DOM containing only interactive elements.
   * Sent when domMode is "skeleton" or "hybrid".
   * Server can also extract this from full DOM if not provided.
   * Max size: 100KB (interactive elements only, much smaller than full DOM)
   */
  skeletonDom: z.string().max(100000).optional(),
  /**
   * Hash of current screenshot for deduplication.
   * If server has cached this hash, it can skip image processing.
   */
  screenshotHash: z.string().max(256).optional(),
  // =========================================================================
  // V3 Semantic Extraction Fields (PRIMARY mode)
  // See docs/DOM_EXTRACTION_ARCHITECTURE.md and docs/SPECS_AND_CONTRACTS.md
  // =========================================================================
  /**
   * V3 minified interactive element tree (PRIMARY extraction format).
   * When domMode is "semantic", this contains the viewport-pruned,
   * minified JSON array of interactive elements.
   */
  interactiveTree: z.array(semanticNodeV3Schema).optional(),
  /**
   * V2 semantic nodes (fallback format with full keys).
   * Used when domMode is "semantic" or V3 extraction fails.
   */
  semanticNodes: z.array(semanticNodeV2Schema).optional(),
  /**
   * Viewport dimensions for coordinate-based interactions.
   */
  viewport: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  /**
   * Page title for context.
   */
  pageTitle: z.string().max(500).optional(),
  // =========================================================================
  // V3 Advanced Fields (Production-Grade)
  // =========================================================================
  /**
   * Page scroll depth as percentage (e.g., "0%", "50%", "100%").
   */
  scrollPosition: z.string().max(10).optional(),
  /**
   * Virtual list containers detected on the page.
   * Used for infinite scroll handling.
   */
  scrollableContainers: z.array(scrollableContainerSchema).optional(),
  /**
   * Recent DOM mutation events (mutation stream for ghost state detection).
   * Format: ["[2s ago] Added: 'Success'", "[1s ago] Removed: 'Loading'"]
   */
  recentEvents: z.array(z.string().max(200)).max(20).optional(),
  /**
   * True if recent error messages were detected in DOM.
   */
  hasErrors: z.boolean().optional(),
  /**
   * True if recent success messages were detected in DOM.
   */
  hasSuccess: z.boolean().optional(),
  // =========================================================================
  // Sentinel Verification Fields (Production-Grade)
  // =========================================================================
  /**
   * Result of client-side Sentinel verification for the previous action.
   */
  verification_passed: z.boolean().optional(),
  /**
   * Human-readable verification feedback from Sentinel verification.
   */
  verification_message: z.string().max(500).optional(),
  /**
   * Errors detected by Sentinel verification.
   */
  errors_detected: z.array(z.string().max(200)).max(10).optional(),
  /**
   * Success messages detected by Sentinel verification.
   */
  success_messages: z.array(z.string().max(200)).max(10).optional(),
  // =========================================================================
  // DOM RAG Fields (Production-Grade for huge pages)
  // =========================================================================
  /**
   * True if DOM was filtered via DOM RAG (client-side chunking).
   */
  dom_filtered: z.boolean().optional(),
  /**
   * Reason for DOM filtering (e.g., "Filtered for 'Samsung Price'").
   */
  filter_reason: z.string().max(200).optional(),
  /**
   * Original node count before filtering.
   */
  original_node_count: z.number().int().nonnegative().optional(),
  /**
   * Token reduction percentage achieved by DOM RAG.
   */
  token_reduction: z.number().min(0).max(100).optional(),
  taskId: z
    .string()
    .refine((val) => {
      // UUID format validation
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(val)
    }, "Invalid taskId format")
    .optional(),
  // Task 3: Session ID for chat persistence
  sessionId: z
    .string()
    .refine((val) => {
      // UUID format validation
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(val)
    }, "Invalid sessionId format")
    .optional(),
  /**
   * Chrome tab ID (debug metadata only, not stable across browser restarts).
   * Used for tab-scoped sessions: one session per browser tab.
   */
  tabId: z.number().int().positive().optional(),
  // Domain-Aware Sessions: Domain for the session (e.g., "google.com")
  domain: z.string().max(255).optional(),
  // Domain-Aware Sessions: Custom title for the session
  title: z.string().max(500).optional(),
  // Task 3: Last action status (for updating message status)
  lastActionStatus: z.enum(["success", "failure", "pending"]).optional(),
  // Task 4: Error reporting for anti-hallucination
  lastActionError: z
    .object({
      message: z.string(),
      code: z.string(), // e.g., 'ELEMENT_NOT_FOUND', 'TIMEOUT', 'NETWORK_ERROR'
      action: z.string(), // The action that failed (e.g., "click(123)")
      elementId: z.union([z.number().int().positive(), z.string().min(1)]).optional(), // Element ID that failed (if applicable)
    })
    .optional(),
  lastActionResult: z
    .object({
      success: z.boolean(),
      actualState: z.string().optional(), // What actually happened (for verification)
    })
    .optional(),
  // Optional: URL before executing the previous action. Used for verification (URL-change checks).
  // If omitted, server uses task baseline URL or last verification record's actualState.url.
  previousUrl: z
    .string()
    .refine((val) => {
      try {
        new URL(val)
        return true
      } catch {
        return false
      }
    }, "Invalid previousUrl")
    .optional(),
  // =========================================================================
  // Client-Side Verification Fields (v2.1)
  // =========================================================================
  /**
   * Client-side element verification result.
   * Extension runs document.querySelector(expectedSelector) after action
   * and reports whether the element was found. This is 100% accurate
   * compared to server-side regex which is ~90% accurate.
   *
   * @see docs/VERIFICATION_PROCESS.md
   */
  clientVerification: z
    .object({
      /** Whether the expected element was found via document.querySelector */
      elementFound: z.boolean(),
      /** The selector that was checked (from expectedOutcome.domChanges.elementShouldExist) */
      selector: z.string().optional(),
      /** Whether the URL changed after action (client-side check) */
      urlChanged: z.boolean().optional(),
      /** Timestamp when verification was performed (for staleness detection) */
      timestamp: z.number().optional(),
    })
    .optional(),
  // =========================================================================
  // Client Observations (Observation-Based Verification v3.0)
  // =========================================================================
  /**
   * Extension reports what it witnessed during/after action execution.
   * Used for observation-based verification (DOM diff) when beforeState exists.
   */
  clientObservations: z
    .object({
      /** Network request(s) occurred (e.g. API call after "Save") */
      didNetworkOccur: z.boolean().optional(),
      /** DOM was mutated (nodes added/removed) */
      didDomMutate: z.boolean().optional(),
      /** URL changed (client-side check) */
      didUrlChange: z.boolean().optional(),
    })
    .optional(),
  // =========================================================================
  // Action Chaining Fields (Phase 2 Task 1)
  // =========================================================================
  /**
   * Index of the last successfully executed action in a chain.
   * Used for chain recovery when partial failure occurs.
   * If present, server uses this to determine where chain failed.
   */
  lastExecutedActionIndex: z.number().int().nonnegative().optional(),
  /**
   * State information for partial chain failure recovery.
   * Sent by client when an action chain partially completes.
   */
  chainPartialState: chainPartialStateSchema.optional(),
  /**
   * Detailed error information for chain action failure.
   * More detailed than lastActionError for chain-specific recovery.
   */
  chainActionError: chainActionErrorSchema.optional(),
})
  .superRefine((val, ctx) => {
    const hasSemanticV3 = !!val.interactiveTree && val.interactiveTree.length > 0
    const hasSemanticV2 = !!val.semanticNodes && val.semanticNodes.length > 0
    const hasSemantic = hasSemanticV3 || hasSemanticV2
    const hasSkeleton = typeof val.skeletonDom === "string" && val.skeletonDom.length > 0
    const hasDom = typeof val.dom === "string" && val.dom.length > 0

    // Semantic mode: allow either V3 interactiveTree or V2 semanticNodes.
    // NOTE: The extension may send domMode="semantic" even when providing interactiveTree (V3).
    if (val.domMode === "semantic" && !hasSemantic) {
      ctx.addIssue({
        code: "custom",
        path: ["interactiveTree"],
        message:
          "interactiveTree or semanticNodes is required when domMode is semantic",
      })
    }

    // Full mode explicitly requires full HTML
    if (val.domMode === "full" && !hasDom) {
      ctx.addIssue({
        code: "custom",
        path: ["dom"],
        message: "dom is required when domMode is full",
      })
    }

    // Skeleton-only / Hybrid: skeletonDom required
    if ((val.domMode === "skeleton" || val.domMode === "hybrid") && !hasSkeleton) {
      ctx.addIssue({
        code: "custom",
        path: ["skeletonDom"],
        message: "skeletonDom is required when domMode is skeleton or hybrid",
      })
    }

    // Compatibility: require at least one page artifact (semantic tree OR skeleton OR full DOM).
    // This enables semantic-first negotiation: clients may omit full HTML as long as they provide
    // semantic nodes (preferred) or skeletonDom (fallback).
    if (!hasSemantic && !hasSkeleton && !hasDom) {
      ctx.addIssue({
        code: "custom",
        path: ["dom"],
        message:
          "At least one page artifact is required: interactiveTree, semanticNodes, skeletonDom, or dom",
      })
    }
  })

export type InteractRequestBody = z.infer<typeof interactRequestBodySchema>

/**
 * RAG debug information schema
 */
export const ragDebugSchema = z.object({
  hasOrgKnowledge: z.boolean(),
  activeDomain: z.string(),
  domainMatch: z.boolean(),
  ragMode: z.enum(["org_specific", "public_only"]),
  reason: z.string(),
  chunkCount: z.number().int().nonnegative(),
  allowedDomains: z.array(z.string()).optional(),
})

export type RAGDebug = z.infer<typeof ragDebugSchema>

/**
 * Execution metrics schema (Task 3)
 */
export const executionMetricsSchema = z.object({
  requestDuration: z.number().int().nonnegative(),
  ragDuration: z.number().int().nonnegative().optional(),
  llmDuration: z.number().int().nonnegative().optional(),
  tokenUsage: z
    .object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
    })
    .optional(),
  stepIndex: z.number().int().nonnegative(),
  actionCount: z.number().int().nonnegative().optional(),
})

export type ExecutionMetrics = z.infer<typeof executionMetricsSchema>

/**
 * Plan step schema (Task 6)
 * 
 * Chat UI Contract: PlanWidget expects `id` (string) for step identification.
 * The `id` field is generated from `index` (e.g., "step_0") in the response.
 */
export const planStepSchema = z.object({
  index: z.number().int().nonnegative(),
  id: z.string().optional(), // Chat UI: step identifier for PlanWidget stepper
  description: z.string(),
  reasoning: z.string().optional(),
  toolType: z.enum(["DOM", "SERVER", "MIXED"]),
  status: z.enum(["pending", "active", "completed", "failed"]),
  expectedOutcome: z.record(z.string(), z.unknown()).optional(),
})

export type PlanStep = z.infer<typeof planStepSchema>

/**
 * Task plan schema (Task 6)
 */
export const taskPlanSchema = z.object({
  steps: z.array(planStepSchema),
  currentStepIndex: z.number().int().nonnegative(),
  createdAt: z.string(), // ISO date string
})

export type TaskPlan = z.infer<typeof taskPlanSchema>

// =============================================================================
// Action Chain Response Schemas (Phase 2 Task 1)
// =============================================================================

/**
 * Schema for a single action in a chain
 */
export const chainedActionResponseSchema = z.object({
  /** The action string (e.g., "setValue(101, 'John')") */
  action: z.string(),
  /** Human-readable description */
  description: z.string(),
  /** Position in chain (0-indexed) */
  index: z.number().int().nonnegative(),
  /** If true, chain continues even if this action fails */
  canFail: z.boolean().optional(),
  /** Target element ID (for validation) */
  targetElementId: z.number().int().positive().optional(),
})

export type ChainedActionResponse = z.infer<typeof chainedActionResponseSchema>

/**
 * Schema for chain metadata
 */
export const chainMetadataResponseSchema = z.object({
  /** Total actions in chain */
  totalActions: z.number().int().positive(),
  /** Estimated execution duration (ms) */
  estimatedDuration: z.number().positive().optional(),
  /** Server confidence that chain is safe to execute */
  safeToChain: z.boolean(),
  /** Reason why actions were chained */
  chainReason: z.enum([
    "FORM_FILL",
    "RELATED_INPUTS",
    "BULK_SELECTION",
    "SEQUENTIAL_STEPS",
    "OPTIMIZED_PATH",
  ]),
  /** Container selector for chain (if applicable) */
  containerSelector: z.string().optional(),
})

export type ChainMetadataResponse = z.infer<typeof chainMetadataResponseSchema>

/**
 * Structured action details with selector fallback (Robust Element Selectors)
 * @see docs/ROBUST_ELEMENT_SELECTORS_SPEC.md
 */
export const actionDetailsSchema = z.object({
  /** Action name: click, setValue, press, navigate, finish, fail, etc. */
  name: z.string(),
  /** Element ID for DOM actions */
  elementId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
  /** CSS selector path for robust re-finding (from DOM extraction) */
  selectorPath: z.string().optional(),
  /** Additional arguments (e.g., value for setValue) */
  args: z.record(z.string(), z.unknown()).optional(),
})

export type ActionDetails = z.infer<typeof actionDetailsSchema>

/**
 * Response schema for POST /api/agent/interact
 */
export const nextActionResponseSchema = z.object({
  thought: z.string(),
  action: z.string(),
  /**
   * Structured action details with selectorPath for robust element finding.
   * When present, extension should prefer selectorPath if elementId fails.
   * @see docs/ROBUST_ELEMENT_SELECTORS_SPEC.md
   */
  actionDetails: actionDetailsSchema.optional(),
  usage: z
    .object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
    })
    .optional(),
  taskId: z.string().uuid().optional(),
  hasOrgKnowledge: z.boolean().optional(),
  ragDebug: ragDebugSchema.optional(),
  metrics: executionMetricsSchema.optional(),
  // Task 6: Planning Engine fields
  plan: taskPlanSchema.optional(),
  currentStep: z.number().int().nonnegative().optional(), // Current step index in plan
  totalSteps: z.number().int().nonnegative().optional(), // Total steps in plan
  status: z
    .enum([
      "active",
      "completed",
      "failed",
      "interrupted",
      "planning",
      "executing",
      "verifying",
      "correcting",
      "needs_user_input", // Chat UI: shows UserInputPrompt when this status is returned
      // Backend-driven page-state negotiation (semantic-first)
      "needs_context",
      // Backward compatibility: legacy full DOM fallback request
      "needs_full_dom",
    ])
    .optional(), // Task status
  /**
   * Backend-driven page-state negotiation (semantic-first contract).
   * When status === "needs_context" (or legacy "needs_full_dom"), the client should retry
   * the same POST /api/agent/interact request, adding ONLY the requested artifacts.
   */
  requestedDomMode: z.enum(["skeleton", "hybrid", "full"]).optional(),
  needsSkeletonDom: z.boolean().optional(),
  needsScreenshot: z.boolean().optional(),
  reason: z.string().optional(),
  // Task 7: Verification result (if verification occurred)
  verification: z
    .object({
      success: z.boolean(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    })
    .optional(),
  // Task 8: Self-correction result (if self-correction occurred)
  correction: z
    .object({
      strategy: z.enum([
        "ALTERNATIVE_SELECTOR",
        "ALTERNATIVE_TOOL",
        "GATHER_INFORMATION",
        "UPDATE_PLAN",
        "RETRY_WITH_DELAY",
      ]),
      reason: z.string(),
      retryAction: z.string(),
    })
    .optional(),
  // Task 9: Expected outcome (if outcome prediction occurred)
  expectedOutcome: z
    .object({
      description: z.string().optional(),
      domChanges: z
        .object({
          elementShouldExist: z.string().optional(),
          elementShouldNotExist: z.string().optional(),
          elementShouldHaveText: z
            .object({
              selector: z.string(),
              text: z.string(),
            })
            .optional(),
          urlShouldChange: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  // Task 10: Tool action (if step refinement occurred)
  toolAction: z
    .object({
      toolName: z.string(),
      toolType: z.enum(["DOM", "SERVER"]),
      parameters: z.record(z.string(), z.unknown()),
    })
    .optional(),
  // Task 1: Web search status (if web search was performed)
  webSearchPerformed: z.boolean().optional(), // Indicates if web search was performed for this task
  webSearchSummary: z.string().optional(), // Brief summary of search results (for UI display)
  // Task 3: Session ID for chat persistence
  sessionId: z.string().uuid().optional(), // Session ID for conversation thread
  // =========================================================================
  // Action Chaining Fields (Phase 2 Task 1)
  // =========================================================================
  /**
   * Array of chained actions to execute.
   * When present, client should execute these sequentially.
   * On first failure, stop and report state back to server.
   * Legacy single `action` field remains the first action for compatibility.
   */
  actions: z.array(chainedActionResponseSchema).optional(),
  /**
   * Metadata about the action chain.
   * Includes safety confidence and chain reasoning.
   */
  chainMetadata: chainMetadataResponseSchema.optional(),
})

export type NextActionResponse = z.infer<typeof nextActionResponseSchema>

/**
 * Needs User Input Response Schema
 * 
 * Returned when the reasoning engine determines that user input is required
 * before proceeding with task execution.
 */
export const needsUserInputResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.literal("needs_user_input"),
    thought: z.string(), // User-friendly explanation
    userQuestion: z.string(), // Specific question to ask user
    missingInformation: z.array(z.string()), // What we need
    context: z.object({
      searchPerformed: z.boolean(),
      searchSummary: z.string().optional(),
      reasoning: z.string(),
    }),
  }),
})

export type NeedsUserInputResponse = z.infer<typeof needsUserInputResponseSchema>

/**
 * List Sessions Response Schema
 *
 * Domain-Aware Sessions: Includes domain, title, and isRenamed fields.
 * Tab-Scoped Sessions: Includes tabId for browser tab association.
 */
export const listSessionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    sessions: z.array(
      z.object({
        sessionId: z.string().uuid(),
        title: z.string().optional(), // Domain-Aware: Session title with format "{domain}: {task}"
        domain: z.string().optional(), // Domain-Aware: Root domain (e.g., "google.com")
        tabId: z.number().int().positive().optional(), // Tab-Scoped: Chrome tab ID (debug metadata)
        url: z.string(),
        status: z.enum(["active", "completed", "failed", "interrupted", "archived"]),
        isRenamed: z.boolean(), // Domain-Aware: Whether user manually renamed the session
        createdAt: z.string(), // ISO 8601
        updatedAt: z.string(), // ISO 8601
        messageCount: z.number().int().nonnegative(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    ),
    pagination: z.object({
      total: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
      hasMore: z.boolean(),
    }),
  }),
})

export type ListSessionsResponse = z.infer<typeof listSessionsResponseSchema>

/**
 * Archive Session Response Schema
 */
export const archiveSessionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    sessionId: z.string().uuid(),
    status: z.literal("archived"),
    message: z.string(),
  }),
})

export type ArchiveSessionResponse = z.infer<typeof archiveSessionResponseSchema>

/**
 * Rename Session Request Schema
 * Domain-Aware Sessions: PATCH /api/session/[sessionId]
 */
export const renameSessionRequestSchema = z.object({
  title: z.string().min(1).max(500),
})

export type RenameSessionRequest = z.infer<typeof renameSessionRequestSchema>

/**
 * Rename Session Response Schema
 * Domain-Aware Sessions: PATCH /api/session/[sessionId]
 */
export const renameSessionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    session: z.object({
      sessionId: z.string().uuid(),
      title: z.string(),
      updatedAt: z.number().int().positive(), // Unix timestamp in milliseconds
    }),
  }),
  message: z.string().optional(),
})

export type RenameSessionResponse = z.infer<typeof renameSessionResponseSchema>

/**
 * Get Session by Domain Response Schema
 * Domain-Aware Sessions: GET /api/session/by-domain/[domain]
 */
export const sessionByDomainResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    session: z
      .object({
        sessionId: z.string().uuid(),
        title: z.string().optional(),
        domain: z.string().optional(),
        tabId: z.number().int().positive().optional(), // Tab-Scoped: Chrome tab ID (debug metadata)
        url: z.string(),
        status: z.enum(["active", "completed", "failed", "interrupted", "archived"]),
        isRenamed: z.boolean(),
        createdAt: z.string(), // ISO 8601
        updatedAt: z.string(), // ISO 8601
        messageCount: z.number().int().nonnegative(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .nullable(),
  }),
})

export type SessionByDomainResponse = z.infer<typeof sessionByDomainResponseSchema>

/**
 * Get Single Session Response Schema
 * Domain-Aware Sessions: GET /api/session/[sessionId]
 */
export const getSessionResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    session: z.object({
      sessionId: z.string().uuid(),
      title: z.string().optional(),
      domain: z.string().optional(),
      tabId: z.number().int().positive().optional(), // Tab-Scoped: Chrome tab ID (debug metadata)
      url: z.string(),
      status: z.enum(["active", "completed", "failed", "interrupted", "archived"]),
      isRenamed: z.boolean(),
      createdAt: z.string(), // ISO 8601
      updatedAt: z.string(), // ISO 8601
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
})

export type GetSessionResponse = z.infer<typeof getSessionResponseSchema>

/**
 * Session Endpoints Schemas (Task 1: Session Endpoints Specifications)
 */

/**
 * Query parameters schema for GET /api/session/[sessionId]/messages
 */
export const sessionMessagesRequestSchema = z.object({
  sessionId: z.string().uuid(),
  limit: z.number().int().positive().max(200).optional().default(50),
  since: z.string().datetime().optional(),
})

export type SessionMessagesRequest = z.infer<typeof sessionMessagesRequestSchema>

/**
 * Message schema for session messages response
 */
export const sessionMessageSchema = z.object({
  messageId: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  actionPayload: z.record(z.string(), z.unknown()).optional(),
  actionString: z.string().optional(),
  status: z.enum(["success", "failure", "pending"]).optional(),
  error: z
    .object({
      message: z.string().optional(),
      code: z.string().optional(),
    })
    .passthrough()
    .optional(),
  sequenceNumber: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  domSummary: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Response schema for GET /api/session/[sessionId]/messages
 *
 * Note: When session doesn't exist, returns empty messages with sessionExists: false
 * to prevent Chrome extension retry loops. This is intentional - 404 causes excessive retries.
 */
export const sessionMessagesResponseSchema = z.object({
  sessionId: z.string().uuid(),
  messages: z.array(sessionMessageSchema),
  total: z.number().int().nonnegative(),
  sessionExists: z.boolean().optional(), // false when session not found (avoids 404 retry loops)
})

export type SessionMessagesResponse = z.infer<typeof sessionMessagesResponseSchema>

/**
 * Query parameters schema for GET /api/session/latest
 */
export const latestSessionRequestSchema = z.object({
  status: z.enum(["active", "completed", "failed", "interrupted", "archived"]).optional(),
})

export type LatestSessionRequest = z.infer<typeof latestSessionRequestSchema>

/**
 * Response schema for GET /api/session/latest
 *
 * Domain-Aware Sessions: Includes domain, title, and isRenamed fields.
 * Tab-Scoped Sessions: Includes tabId for browser tab association.
 */
export const latestSessionResponseSchema = z
  .object({
    sessionId: z.string().uuid(),
    title: z.string().optional(), // Domain-Aware: Session title
    domain: z.string().optional(), // Domain-Aware: Root domain
    tabId: z.number().int().positive().optional(), // Tab-Scoped: Chrome tab ID (debug metadata)
    url: z.string().url(),
    status: z.enum(["active", "completed", "failed", "interrupted", "archived"]),
    isRenamed: z.boolean().optional(), // Domain-Aware: Whether user manually renamed
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    messageCount: z.number().int().nonnegative(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .nullable()

export type LatestSessionResponse = z.infer<typeof latestSessionResponseSchema>
