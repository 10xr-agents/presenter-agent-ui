import { connectDB } from "@/lib/db/mongoose"
import { type IUsageEvent, UsageEvent } from "@/lib/models/usage-event"

// Free tier limits
export const FREE_TIER_MINUTES_PER_MONTH = 20 // 20 free minutes per month
export const FREE_TIER_SCREEN_AGENTS_ALLOWED = 1 // 1 Screen Agent creation
export const FREE_TIER_EDIT_ALLOWED = 3 // Up to 2-3 complex edits on knowledge

// Usage warning threshold (80%)
export const USAGE_WARNING_THRESHOLD = 0.8

// Get current month start date
function getCurrentMonthStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

// Get current month end date
function getCurrentMonthEnd(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
}

// Get free tier usage for current month (minutes consumed)
export async function getFreeTierUsageMinutes(
  organizationId: string
): Promise<{ used: number; limit: number; remaining: number; percentage: number }> {
  await connectDB()

  const monthStart = getCurrentMonthStart()
  const monthEnd = getCurrentMonthEnd()

  // Sum up session_minutes usage events for this month
  const usageEvents = await (UsageEvent as any).aggregate([
    {
      $match: {
        organizationId,
        eventType: "session_minutes",
        eventTimestamp: {
          $gte: monthStart,
          $lte: monthEnd,
        },
      },
    },
    {
      $group: {
        _id: null,
        totalMinutes: { $sum: "$quantity" },
      },
    },
  ])

  const used = usageEvents.length > 0 ? usageEvents[0].totalMinutes || 0 : 0
  const limit = FREE_TIER_MINUTES_PER_MONTH
  const remaining = Math.max(0, limit - used)
  const percentage = limit > 0 ? used / limit : 0

  return {
    used,
    limit,
    remaining,
    percentage,
  }
}

// Get free tier screen agent count
export async function getFreeTierScreenAgentCount(
  organizationId: string
): Promise<{ used: number; limit: number; remaining: number }> {
  await connectDB()

  // Import ScreenAgent model dynamically to avoid circular dependencies
  const { ScreenAgent } = await import("@/lib/models/screen-agent")

  const count = await (ScreenAgent as any).countDocuments({
    organizationId,
    status: { $in: ["draft", "active", "paused"] }, // Count active agents
  })

  const used = count
  const limit = FREE_TIER_SCREEN_AGENTS_ALLOWED
  const remaining = Math.max(0, limit - used)

  return {
    used,
    limit,
    remaining,
  }
}

// Check if free tier minutes limit is exceeded
export async function isFreeTierMinutesExceeded(
  organizationId: string
): Promise<{ exceeded: boolean; used: number; limit: number; remaining: number }> {
  const usage = await getFreeTierUsageMinutes(organizationId)
  return {
    exceeded: usage.used >= usage.limit,
    used: usage.used,
    limit: usage.limit,
    remaining: usage.remaining,
  }
}

// Check if free tier screen agent limit is exceeded
export async function isFreeTierScreenAgentExceeded(
  organizationId: string
): Promise<{ exceeded: boolean; used: number; limit: number; remaining: number }> {
  const usage = await getFreeTierScreenAgentCount(organizationId)
  return {
    exceeded: usage.used >= usage.limit,
    used: usage.used,
    limit: usage.limit,
    remaining: usage.remaining,
  }
}

// Check if usage is approaching limit (80% threshold)
export async function isUsageApproachingLimit(
  organizationId: string
): Promise<{
  approaching: boolean
  minutesUsage: { used: number; limit: number; percentage: number }
  screenAgentUsage: { used: number; limit: number }
}> {
  const minutesUsage = await getFreeTierUsageMinutes(organizationId)
  const screenAgentUsage = await getFreeTierScreenAgentCount(organizationId)

  const approaching =
    minutesUsage.percentage >= USAGE_WARNING_THRESHOLD ||
    screenAgentUsage.used >= screenAgentUsage.limit * USAGE_WARNING_THRESHOLD

  return {
    approaching,
    minutesUsage: {
      used: minutesUsage.used,
      limit: minutesUsage.limit,
      percentage: minutesUsage.percentage,
    },
    screenAgentUsage: {
      used: screenAgentUsage.used,
      limit: screenAgentUsage.limit,
    },
  }
}

// Get free tier usage summary
export async function getFreeTierUsageSummary(organizationId: string): Promise<{
  minutes: { used: number; limit: number; remaining: number; percentage: number }
  screenAgents: { used: number; limit: number; remaining: number }
  warnings: {
    minutesWarning: boolean
    screenAgentsWarning: boolean
  }
}> {
  const minutesUsage = await getFreeTierUsageMinutes(organizationId)
  const screenAgentUsage = await getFreeTierScreenAgentCount(organizationId)

  return {
    minutes: minutesUsage,
    screenAgents: screenAgentUsage,
    warnings: {
      minutesWarning: minutesUsage.percentage >= USAGE_WARNING_THRESHOLD,
      screenAgentsWarning: screenAgentUsage.used >= screenAgentUsage.limit * USAGE_WARNING_THRESHOLD,
    },
  }
}
