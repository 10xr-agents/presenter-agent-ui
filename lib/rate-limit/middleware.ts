import mongoose, { Schema } from "mongoose"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"

export interface IRateLimit extends mongoose.Document {
  key: string
  count: number
  resetAt: Date
  createdAt: Date
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: { type: String, required: true, unique: true }, // unique: true automatically creates an index
    count: { type: Number, default: 0 },
    resetAt: { type: Date, required: true }, // Index created via Schema.index() below
  },
  { timestamps: true }
)

// TTL index for auto-cleanup (expires documents when resetAt is reached)
RateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 })

export const RateLimit =
  mongoose.models.RateLimit ||
  mongoose.model<IRateLimit>("RateLimit", RateLimitSchema)

export interface RateLimitOptions {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  keyGenerator?: (req: NextRequest) => Promise<string> // Custom key generator
}

// Rate limit middleware
export async function rateLimit(
  req: NextRequest,
  options: RateLimitOptions
): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  await connectDB()

  // Generate rate limit key
  let key: string
  if (options.keyGenerator) {
    key = await options.keyGenerator(req)
  } else {
    // Default: use user ID or IP address
    const session = await auth.api.getSession({ headers: await headers() })
    // Get IP from headers (NextRequest doesn't have .ip property)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || 
               req.headers.get("x-real-ip") || 
               "anonymous"
    key = session?.user?.id || ip
  }

  const now = new Date()
  const resetAt = new Date(now.getTime() + options.windowMs)

  // Atomic upsert to avoid duplicate key errors under concurrency.
  // If the window is expired, reset count to 1 and set a new resetAt.
  // Otherwise, increment count by 1.
  const rateLimit = await (RateLimit as any)
    .findOneAndUpdate(
      { key },
      [
        {
          $set: {
            key,
            resetAt: { $ifNull: ["$resetAt", resetAt] },
            count: { $ifNull: ["$count", 0] },
          },
        },
        {
          $set: {
            isExpired: { $lt: ["$resetAt", now] },
          },
        },
        {
          $set: {
            count: {
              $cond: [{ $eq: ["$isExpired", true] }, 1, { $add: ["$count", 1] }],
            },
            resetAt: {
              $cond: [{ $eq: ["$isExpired", true] }, resetAt, "$resetAt"],
            },
          },
        },
        { $unset: "isExpired" },
      ],
      { upsert: true, new: true }
    )
    .lean()
    .exec()

  const remaining = Math.max(0, options.maxRequests - (rateLimit.count as number))

  return {
    success: (rateLimit.count as number) <= options.maxRequests,
    remaining,
    resetAt: rateLimit.resetAt as Date,
  }
}

// API route wrapper
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: RateLimitOptions
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const result = await rateLimit(req, options)

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          resetAt: result.resetAt.toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": options.maxRequests.toString(),
            "X-RateLimit-Remaining": result.remaining.toString(),
            "X-RateLimit-Reset": result.resetAt.toISOString(),
          },
        }
      )
    }

    const response = await handler(req)

    // Add rate limit headers
    response.headers.set("X-RateLimit-Limit", options.maxRequests.toString())
    response.headers.set("X-RateLimit-Remaining", result.remaining.toString())
    response.headers.set("X-RateLimit-Reset", result.resetAt.toISOString())

    return response
  }
}

