import { z } from "zod"

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
 */
export const planStepSchema = z.object({
  index: z.number().int().nonnegative(),
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
 */
export const listSessionsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    sessions: z.array(
      z.object({
        sessionId: z.string().uuid(),
        url: z.string(),
        status: z.enum(["active", "completed", "failed", "interrupted", "archived"]),
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
 */
export const sessionMessagesResponseSchema = z.object({
  sessionId: z.string().uuid(),
  messages: z.array(sessionMessageSchema),
  total: z.number().int().nonnegative(),
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
 */
export const latestSessionResponseSchema = z
  .object({
    sessionId: z.string().uuid(),
    url: z.string().url(),
    status: z.enum(["active", "completed", "failed", "interrupted", "archived"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    messageCount: z.number().int().nonnegative(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .nullable()

export type LatestSessionResponse = z.infer<typeof latestSessionResponseSchema>
