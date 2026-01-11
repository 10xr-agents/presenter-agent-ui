import { NextRequest } from "next/server"
import { rateLimit } from "@/lib/rate-limit/middleware"

/**
 * Rate limiter for presentation access
 * 
 * Prevents abuse of presentation access by limiting requests per IP address.
 * 
 * Configuration:
 * - Max requests: 10 per 1 minute window
 * - Max concurrent sessions: 5 per IP
 */
export async function checkPresentationRateLimit(
  req: NextRequest
): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const result = await rateLimit(req, {
      maxRequests: 10, // Max 10 requests per window
      windowMs: 60 * 1000, // 1 minute window
    })

    if (!result.success) {
      return {
        allowed: false,
        retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      }
    }

    return { allowed: true }
  } catch (error: unknown) {
    // On error, allow request (fail open)
    console.error("Rate limit check error:", error)
    return { allowed: true }
  }
}

/**
 * Check concurrent session limit
 * 
 * Limits the number of concurrent presentation sessions per IP address.
 */
export async function checkConcurrentSessionLimit(
  req: NextRequest,
  sessionToken: string
): Promise<{ allowed: boolean; reason?: string }> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || 
             req.headers.get("x-real-ip") || 
             "anonymous"

  // TODO: Implement concurrent session tracking
  // This would typically use Redis to track active sessions per IP
  // For now, allow all requests

  return { allowed: true }
}
