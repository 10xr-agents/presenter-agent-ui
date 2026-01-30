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
  elementId: z.number().int().positive().optional(),
  /** Index of the failed action in the chain */
  failedIndex: z.number().int().nonnegative(),
})

export type ChainActionError = z.infer<typeof chainActionErrorSchema>

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
  dom: z.string().min(1).max(1000000), // Increased from 500000 to 1000000 to handle large DOMs
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
      elementId: z.number().optional(), // Element ID that failed (if applicable)
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
 * Response schema for POST /api/agent/interact
 */
export const nextActionResponseSchema = z.object({
  thought: z.string(),
  action: z.string(),
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
    ])
    .optional(), // Task status
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
 */
export const listSessionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    sessions: z.array(
      z.object({
        sessionId: z.string().uuid(),
        title: z.string().optional(), // Domain-Aware: Session title with format "{domain}: {task}"
        domain: z.string().optional(), // Domain-Aware: Root domain (e.g., "google.com")
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
 */
export const latestSessionResponseSchema = z
  .object({
    sessionId: z.string().uuid(),
    title: z.string().optional(), // Domain-Aware: Session title
    domain: z.string().optional(), // Domain-Aware: Root domain
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
