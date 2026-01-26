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
})

export type NextActionResponse = z.infer<typeof nextActionResponseSchema>
