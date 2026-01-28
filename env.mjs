import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  server: {
    ANALYZE: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
    // Database
    MONGODB_URI: z.string().refine((val) => !val || /^mongodb(\+srv)?:\/\//.test(val), "Invalid MongoDB URI").optional(),
    // Redis (for job queues)
    REDIS_URL: z.string().refine((val) => !val || /^redis(s)?:\/\//.test(val), "Invalid Redis URL").optional(),
    // Better Auth
    BETTER_AUTH_SECRET: z.string().min(32).optional(),
    BETTER_AUTH_URL: z.string().refine((val) => !val || /^https?:\/\//.test(val), "Invalid URL").optional(),
    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // Email (Resend)
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), "Invalid email").optional(),
    // Uploadthing (file uploads)
    UPLOADTHING_TOKEN: z.string().optional(),
    // AI Agent Configuration
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    TAVILY_API_KEY: z.string().optional(),
    // Organization Settings
    ORGANIZATION_LIMIT: z.string().optional(),
    MEMBERSHIP_LIMIT: z.string().optional(),
    // Prisma Logging
    PRISMA_LOG_QUERIES: z.enum(["true", "false"]).optional(),
    // Stripe Billing
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_ID_FREE: z.string().optional(),
    STRIPE_PRICE_ID_PRO: z.string().optional(),
    STRIPE_PRICE_ID_ENTERPRISE: z.string().optional(),
    // PostHog Analytics
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().refine((val) => !val || /^https?:\/\//.test(val), "Invalid URL").optional(),
    // Sentry Error Tracking
    SENTRY_DSN: z.string().refine((val) => !val || /^https?:\/\//.test(val), "Invalid URL").optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    // LangFuse LLM Observability (separate from Sentry - captures LLM traces, not errors)
    LANGFUSE_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_SECRET_KEY: z.string().optional(),
    LANGFUSE_BASE_URL: z.string().refine((val) => !val || /^https?:\/\//.test(val), "Invalid URL").optional(),
    ENABLE_LANGFUSE: z.enum(["true", "false"]).optional(),
    // Feature Flags
    FEATURE_FLAGS_ENABLED: z.string().optional(),
    // Browser Automation Service
    BROWSER_AUTOMATION_SERVICE_URL: z.string().refine((val) => !val || /^https?:\/\//.test(val), "Invalid URL").optional(),
    // S3 Storage (DigitalOcean Spaces or AWS S3)
    // Provider is automatically determined by NODE_ENV:
    // - NODE_ENV=development → uses DigitalOcean Spaces
    // - NODE_ENV=production → uses AWS S3
    // Can be overridden by explicitly setting S3_PROVIDER
    // Region is automatically derived from endpoint (DigitalOcean) or defaults to us-east-1 (AWS)
    // Can be overridden by explicitly setting S3_REGION
    S3_PROVIDER: z.enum(["aws", "digitalocean"]).optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ENDPOINT: z.string().refine((val) => !val || /^https?:\/\//.test(val), "Invalid URL").optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    // Sockudo (Pusher-compatible WebSocket server) – port 3005
    SOCKUDO_APP_ID: z.string().optional(),
    SOCKUDO_APP_KEY: z.string().optional(),
    SOCKUDO_APP_SECRET: z.string().optional(),
    SOCKUDO_HOST: z.string().optional(),
    SOCKUDO_PORT: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().refine((val) => !val || /^https?:\/\//.test(val), "Invalid URL").optional(),
    /** Sockudo/Pusher client: key (same as SOCKUDO_APP_KEY), ws host, ws port (3005) */
    NEXT_PUBLIC_PUSHER_KEY: z.string().optional(),
    NEXT_PUBLIC_PUSHER_WS_HOST: z.string().optional(),
    NEXT_PUBLIC_PUSHER_WS_PORT: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().refine((val) => !val || /^https?:\/\//.test(val), "Invalid URL").optional(),
  },
  runtimeEnv: {
    ANALYZE: process.env.ANALYZE,
    MONGODB_URI: process.env.MONGODB_URI,
    REDIS_URL: process.env.REDIS_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    // AI Agent Configuration
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    // Organization Settings
    ORGANIZATION_LIMIT: process.env.ORGANIZATION_LIMIT,
    MEMBERSHIP_LIMIT: process.env.MEMBERSHIP_LIMIT,
    // Stripe Billing
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID_FREE: process.env.STRIPE_PRICE_ID_FREE,
    STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO,
    STRIPE_PRICE_ID_ENTERPRISE: process.env.STRIPE_PRICE_ID_ENTERPRISE,
    // PostHog Analytics
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    // Sentry Error Tracking
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    // LangFuse LLM Observability
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    ENABLE_LANGFUSE: process.env.ENABLE_LANGFUSE,
    // Feature Flags
    FEATURE_FLAGS_ENABLED: process.env.FEATURE_FLAGS_ENABLED,
    // Prisma Logging
    PRISMA_LOG_QUERIES: process.env.PRISMA_LOG_QUERIES,
    // Browser Automation Service
    BROWSER_AUTOMATION_SERVICE_URL: process.env.BROWSER_AUTOMATION_SERVICE_URL,
    // S3 Storage
    S3_PROVIDER: process.env.S3_PROVIDER,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    SOCKUDO_APP_ID: process.env.SOCKUDO_APP_ID,
    SOCKUDO_APP_KEY: process.env.SOCKUDO_APP_KEY,
    SOCKUDO_APP_SECRET: process.env.SOCKUDO_APP_SECRET,
    SOCKUDO_HOST: process.env.SOCKUDO_HOST,
    SOCKUDO_PORT: process.env.SOCKUDO_PORT,
    NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
    NEXT_PUBLIC_PUSHER_WS_HOST: process.env.NEXT_PUBLIC_PUSHER_WS_HOST,
    NEXT_PUBLIC_PUSHER_WS_PORT: process.env.NEXT_PUBLIC_PUSHER_WS_PORT,
  },
})
