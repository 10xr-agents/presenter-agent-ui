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

// Screen Agent schemas
export const voiceConfigSchema = z.object({
  provider: z.enum(["elevenlabs", "openai", "cartesia"]),
  voiceId: z.string().min(1),
  language: z.string().min(1),
  speechRate: z.number().min(0.5).max(2.0).optional(),
  pitch: z.number().min(-1.0).max(1.0).optional(),
})

export const conversationConfigSchema = z.object({
  personalityPrompt: z.string().optional(),
  welcomeMessage: z.string().optional(),
  fallbackResponse: z.string().optional(),
  guardrails: z.array(z.string()).optional(),
})

export const createScreenAgentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(20).max(500),
  organizationId: z.string().min(1),
  teamId: z.string().optional(),
  // Visibility is implicit and determined server-side - do not accept from client
  targetWebsiteUrl: z.string().refine(
    (val) => {
      try {
        new URL(val)
        return true
      } catch {
        return false
      }
    },
    { message: "Invalid URL format" }
  ),
  websiteCredentials: z
    .object({
      username: z.string(),
      password: z.string(),
    })
    .optional(),
  loginNotes: z.string().max(1000).optional(),
  voiceConfig: voiceConfigSchema.optional(),
  conversationConfig: conversationConfigSchema.optional(),
  knowledgeDocumentIds: z.array(z.string()).default([]),
  domainRestrictions: z.array(z.string()).optional(),
  sessionTimeoutMinutes: z.number().int().min(1).max(480).optional(),
  maxSessionDurationMinutes: z.number().int().min(1).max(480).optional(),
  viewerAuthRequired: z.boolean().default(false),
  dataCollectionConsent: z.boolean().default(false),
  recordingEnabled: z.boolean().default(true),
})

export const updateScreenAgentSchema = createScreenAgentSchema.partial()

// Presentation Session schemas
export const viewerInfoSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  customFields: z.record(z.string(), z.any()).optional(),
})

export const createPresentationSessionSchema = z.object({
  screenAgentId: z.string().min(1),
  viewerInfo: viewerInfoSchema.optional(),
})

// Knowledge Document schemas
export const createKnowledgeDocumentSchema = z.object({
  screenAgentId: z.string().min(1),
  documentType: z.enum(["pdf", "video", "audio", "text", "url"]),
  originalFilename: z.string().min(1),
  storageLocation: z.string().min(1),
  fileSizeBytes: z.number().int().min(0),
})

// Billing Account schemas
export const paymentMethodSchema = z.object({
  type: z.enum(["card", "bank_transfer", "invoice"]),
  lastFour: z.string().length(4).optional(),
  expirationDate: z.coerce.date().optional(),
  billingName: z.string().optional(),
  cardBrand: z.enum(["visa", "mastercard", "amex", "discover", "other"]).optional(),
  stripePaymentMethodId: z.string().optional(),
})

export const createBillingAccountSchema = z.object({
  organizationId: z.string().min(1),
  billingType: z.enum(["pay_as_you_go", "enterprise_contract"]),
  currencyCode: z.string().length(3).default("USD"),
  billingEmailAddresses: z.array(z.string().email()).min(1),
  billingAddress: z
    .object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string(),
      country: z.string(),
    })
    .optional(),
  autoReloadEnabled: z.boolean().default(false),
  autoReloadThresholdCents: z.number().int().min(0).default(1000),
  autoReloadAmountCents: z.number().int().min(0).default(10000),
})

// Usage Event schemas
export const createUsageEventSchema = z.object({
  organizationId: z.string().min(1),
  screenAgentId: z.string().optional(),
  presentationSessionId: z.string().optional(),
  eventType: z.enum(["session_minutes", "knowledge_processing", "storage", "api_call"]),
  quantity: z.number().min(0),
  unitCostCents: z.number().int().min(0),
  totalCostCents: z.number().int().min(0),
  billingAccountId: z.string().min(1),
})

// Analytics Event schemas
export const createAnalyticsEventSchema = z.object({
  organizationId: z.string().min(1),
  screenAgentId: z.string().min(1),
  presentationSessionId: z.string().min(1),
  eventType: z.enum(["viewer_question", "page_navigation", "agent_response", "session_milestone"]),
  properties: z.record(z.string(), z.any()),
})

// Team schemas (Enterprise)
export const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  organizationId: z.string().min(1),
  settings: z.record(z.string(), z.any()).optional(),
})

export const createTeamMembershipSchema = z.object({
  userId: z.string().min(1),
  teamId: z.string().min(1),
  teamRole: z.enum(["team_admin", "team_member"]).default("team_member"),
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

