import { NextResponse } from "next/server"
import { connectDB } from "@/lib/db/mongoose"
import { prisma } from "@/lib/db/prisma"
import { successResponse, errorResponse } from "@/lib/utils/api-response"
import { ErrorCode } from "@/lib/utils/error-codes"
import { logger } from "@/lib/utils/logger"

/**
 * GET /api/health
 *
 * Enhanced health check endpoint with comprehensive service status checks.
 * Returns detailed health information for monitoring and deployment verification.
 *
 * Response:
 * - 200 OK: All services healthy
 * - 503 Service Unavailable: One or more services unhealthy
 */
export async function GET() {
  const startTime = Date.now()
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {}

  try {
    // Check MongoDB connection
    const mongoStart = Date.now()
    try {
      await connectDB()
      const mongoLatency = Date.now() - mongoStart
      checks.database = {
        status: "connected",
        latency: mongoLatency,
      }
      logger.debug("Health check: MongoDB connected", { latency: mongoLatency })
    } catch (error: unknown) {
      const mongoLatency = Date.now() - mongoStart
      checks.database = {
        status: "disconnected",
        latency: mongoLatency,
        error: error instanceof Error ? error.message : "Unknown error",
      }
      logger.error("Health check: MongoDB connection failed", error, { latency: mongoLatency })
    }

    // Check Prisma (Better Auth) connection
    const prismaStart = Date.now()
    try {
      await prisma.$connect()
      const prismaLatency = Date.now() - prismaStart
      checks.auth = {
        status: "connected",
        latency: prismaLatency,
      }
      logger.debug("Health check: Prisma connected", { latency: prismaLatency })
    } catch (error: unknown) {
      const prismaLatency = Date.now() - prismaStart
      checks.auth = {
        status: "disconnected",
        latency: prismaLatency,
        error: error instanceof Error ? error.message : "Unknown error",
      }
      logger.error("Health check: Prisma connection failed", error, { latency: prismaLatency })
    }

    // Check Redis (if available)
    const redisStart = Date.now()
    try {
      const { getRedis } = await import("@/lib/queue/redis")
      const redis = getRedis()
      await redis.ping()
      const redisLatency = Date.now() - redisStart
      checks.redis = {
        status: "connected",
        latency: redisLatency,
      }
      logger.debug("Health check: Redis connected", { latency: redisLatency })
    } catch (error: unknown) {
      const redisLatency = Date.now() - redisStart
      checks.redis = {
        status: "disconnected",
        latency: redisLatency,
        error: error instanceof Error ? error.message : "Redis not configured",
      }
      logger.debug("Health check: Redis not available", { latency: redisLatency })
    }

    // Determine overall health status
    const allHealthy = Object.values(checks).every((check) => check.status === "connected")
    const criticalServicesHealthy = checks.database?.status === "connected" && checks.auth?.status === "connected"

    const duration = Date.now() - startTime

    if (allHealthy) {
      logger.info("Health check: All services healthy", { duration, checks })
      return successResponse(
        {
          status: "healthy",
          timestamp: new Date().toISOString(),
          duration,
          services: checks,
        },
        "All services are healthy"
      )
    } else if (criticalServicesHealthy) {
      logger.warn("Health check: Service degraded", { duration, checks })
      return successResponse(
        {
          status: "degraded",
          timestamp: new Date().toISOString(),
          duration,
          services: checks,
        },
        "Service is operational but some non-critical services are unavailable"
      )
    } else {
      logger.error("Health check: Service unhealthy", undefined, { duration, checks })
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        503,
        {
          message: "One or more critical services are unavailable",
          services: checks,
        }
      )
    }
  } catch (error: unknown) {
    const duration = Date.now() - startTime
    logger.error("Health check: Failed", error, { duration })
    return errorResponse(
      ErrorCode.INTERNAL_ERROR,
      503,
      {
        message: "Health check failed",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        duration,
        services: checks,
      }
    )
  }
}

