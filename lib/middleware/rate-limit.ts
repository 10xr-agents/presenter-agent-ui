import * as Sentry from "@sentry/nextjs"
import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/session"
import { rateLimit as baseRateLimit, RateLimitOptions } from "@/lib/rate-limit/middleware"
import { errorResponse } from "@/lib/utils/api-response"
import { addCorsHeaders } from "@/lib/utils/cors"
import { logger } from "@/lib/utils/logger"

/**
 * Rate Limit Configuration per Endpoint
 * 
 * Different endpoints have different rate limits based on their cost and usage patterns.
 * Limits are per-tenant (tenantId) to ensure fair resource usage.
 */
export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds (e.g., 60000 for 1 minute)
  maxRequests: number // Maximum requests per window
  keyGenerator: (req: NextRequest, userId: string, tenantId: string) => Promise<string>
  skipSuccessfulRequests?: boolean // Don't count successful requests
  skipFailedRequests?: boolean // Don't count failed requests
}

/**
 * Rate limit configurations for each endpoint pattern
 */
export const rateLimitConfigs: Record<string, RateLimitConfig> = {
  "/api/agent/interact": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute (expensive LLM calls)
    keyGenerator: async (_req, _userId, tenantId) => `rate-limit:${tenantId}:interact`,
  },
  "/api/knowledge/resolve": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute (medium cost)
    keyGenerator: async (_req, _userId, tenantId) => `rate-limit:${tenantId}:resolve`,
  },
  "/api/session": {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute (cheap reads)
    keyGenerator: async (_req, _userId, tenantId) => `rate-limit:${tenantId}:session`,
  },
}

/**
 * Get rate limit configuration for an endpoint
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig | null {
  // Match exact path or prefix
  for (const [pattern, config] of Object.entries(rateLimitConfigs)) {
    if (pathname === pattern || pathname.startsWith(pattern)) {
      return config
    }
  }
  return null
}

/**
 * Apply rate limiting to a request
 * 
 * Returns null if rate limit passed, or a 429 response if rate limit exceeded
 */
export async function applyRateLimit(
  req: NextRequest,
  pathname: string
): Promise<NextResponse | null> {
  const config = getRateLimitConfig(pathname)
  
  // No rate limit configured for this endpoint
  if (!config) {
    return null
  }

  try {
    // Get session for userId and tenantId
    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      // If not authenticated, rate limit by IP
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                 req.headers.get("x-real-ip") || 
                 "anonymous"
      
      const options: RateLimitOptions = {
        windowMs: config.windowMs,
        maxRequests: config.maxRequests,
        keyGenerator: async () => `rate-limit:ip:${ip}:${pathname}`,
      }
      
      const result = await baseRateLimit(req, options)
      
      if (!result.success) {
        const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)
        
        // Log rate limit violation
        logger.warn("Rate limit exceeded", {
          endpoint: pathname,
          ip,
          remaining: result.remaining,
          resetAt: result.resetAt.toISOString(),
        })
        
        Sentry.captureMessage("Rate limit exceeded", {
          level: "warning",
          tags: {
            endpoint: pathname,
            type: "rate_limit",
          },
          extra: {
            ip,
            remaining: result.remaining,
            resetAt: result.resetAt.toISOString(),
          },
        })
        
        const err = errorResponse("RATE_LIMIT", 429, {
          code: "RATE_LIMIT",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter,
        })
        
        const response = addCorsHeaders(req, err)
        response.headers.set("X-RateLimit-Limit", config.maxRequests.toString())
        response.headers.set("X-RateLimit-Remaining", result.remaining.toString())
        response.headers.set("X-RateLimit-Reset", Math.floor(result.resetAt.getTime() / 1000).toString())
        
        return response
      }
      
      return null
    }

    const { userId, tenantId } = session

    const options: RateLimitOptions = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      keyGenerator: async () => await config.keyGenerator(req, userId, tenantId),
    }

    const result = await baseRateLimit(req, options)

    if (!result.success) {
      const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)
      
      // Log rate limit violation
      logger.warn("Rate limit exceeded", {
        endpoint: pathname,
        userId,
        tenantId,
        remaining: result.remaining,
        resetAt: result.resetAt.toISOString(),
      })
      
      Sentry.captureMessage("Rate limit exceeded", {
        level: "warning",
        tags: {
          endpoint: pathname,
          type: "rate_limit",
          tenantId,
        },
        extra: {
          userId,
          tenantId,
          remaining: result.remaining,
          resetAt: result.resetAt.toISOString(),
        },
      })
      
      const err = errorResponse("RATE_LIMIT", 429, {
        code: "RATE_LIMIT",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter,
      })
      
      const response = addCorsHeaders(req, err)
      response.headers.set("X-RateLimit-Limit", config.maxRequests.toString())
      response.headers.set("X-RateLimit-Remaining", result.remaining.toString())
      response.headers.set("X-RateLimit-Reset", Math.floor(result.resetAt.getTime() / 1000).toString())
      
      return response
    }

    // Rate limit passed - return null to continue
    return null
  } catch (error: unknown) {
    // On error, allow request (fail open) but log the error
    logger.error("Rate limit check error", error, {
      endpoint: pathname,
    })
    
    Sentry.captureException(error, {
      tags: {
        component: "rate-limit",
        endpoint: pathname,
      },
    })
    
    // Fail open - allow request if rate limiting fails
    return null
  }
}

/**
 * Wrapper for API route handlers that applies rate limiting
 */
export function withRateLimit<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
  pathname: string
): T {
  return (async (...args: Parameters<T>) => {
    const req = args[0] as NextRequest
    
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, pathname)
    if (rateLimitResponse) {
      return rateLimitResponse
    }
    
    // Call original handler
    return handler(...args)
  }) as T
}
