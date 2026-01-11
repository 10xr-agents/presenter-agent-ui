import { z } from "zod"

// Common validation schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
})

export const organizationIdSchema = z.object({
  organizationId: z.string().optional(),
})

// API Key schemas
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  organizationId: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.coerce.date().optional(),
  rateLimit: z
    .object({
      requests: z.number().int().min(1),
      windowMs: z.number().int().min(1000),
    })
    .optional(),
})

// Notification schemas
export const createNotificationSchema = z.object({
  userId: z.string(),
  organizationId: z.string().optional(),
  type: z.enum(["info", "success", "warning", "error", "invitation", "mention", "system"]),
  title: z.string().min(1).max(200),
  message: z.string().min(1, "Message is required").max(1000, "Message too long"),
  link: z.string().refine(
    (val) => {
      if (!val) return true
      try {
        new URL(val)
        return true
      } catch {
        return false
      }
    },
    { message: "Invalid URL format" }
  ).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  sendEmail: z.boolean().optional(),
})

// Template schemas
export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(["prompt", "workflow", "agent", "form"]),
  category: z.string().max(50).optional(),
  tags: z.array(z.string()).optional(),
  content: z.record(z.string(), z.any()),
  variables: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean(),
        default: z.string().optional(),
      })
    )
    .optional(),
  public: z.boolean().optional(),
  organizationId: z.string().optional(),
})

// Usage tracking schemas
export const trackUsageSchema = z.object({
  type: z.enum(["api_call", "ai_request", "storage", "bandwidth", "feature_usage"]),
  resource: z.string().min(1),
  quantity: z.number().int().min(0),
  cost: z.number().min(0).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

export const quotaSchema = z.object({
  limit: z.number().int().min(1),
  windowMs: z.number().int().min(1000),
  type: z.enum(["api_call", "ai_request", "storage", "bandwidth", "feature_usage"]),
  resource: z.string().optional(),
})

// Helper function to validate request body
export async function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<{ success: true; data: T } | { success: false; error: z.ZodError }> {
  try {
    const validated = await schema.parseAsync(data)
    return { success: true, data: validated }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return { success: false, error }
    }
    throw error
  }
}

