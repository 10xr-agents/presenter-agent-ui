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
  dom: z.string().min(1).max(500000),
  taskId: z
    .string()
    .refine((val) => {
      // UUID format validation
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(val)
    }, "Invalid taskId format")
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
})

export type NextActionResponse = z.infer<typeof nextActionResponseSchema>
