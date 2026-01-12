import { connectDB } from "@/lib/db/mongoose"
import { type IUsageLimit, UsageLimit, type UsageLimitType } from "@/lib/models/usage-limit"

export type { UsageLimitType }

export interface CheckLimitResult {
  allowed: boolean
  currentUsage: number
  limitValue: number
  remaining: number
  exceeded: boolean
  warningLevel?: 1 | 2 | 3
}

export interface UpdateUsageData {
  organizationId: string
  limitType: UsageLimitType
  usageDelta: number // Amount to add to current usage (can be negative)
}

/**
 * Get or create a usage limit for an organization
 */
export async function getUsageLimit(
  organizationId: string,
  limitType: UsageLimitType
): Promise<IUsageLimit | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let limit = await (UsageLimit as any).findOne({
    organizationId,
    limitType,
  })

  // If no limit exists, create a default based on organization tier
  if (!limit) {
    // TODO: Get default limits from organization tier/plan
    const defaultLimits: Record<UsageLimitType, number> = {
      presentation_minutes: 20, // Free tier: 20 minutes
      screen_agents: 1, // Free tier: 1 agent
      knowledge_documents: 10, // Free tier: 10 documents
      storage_gb: 1, // Free tier: 1GB
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    limit = await (UsageLimit as any).create({
      organizationId,
      limitType,
      limitValue: defaultLimits[limitType],
      currentUsage: 0,
      warningThreshold1: 80,
      warningThreshold2: 90,
      warningThreshold3: 95,
      warningsSent: {},
    })
  }

  return limit
}

/**
 * Check if usage is within limits
 */
export async function checkUsageLimit(
  organizationId: string,
  limitType: UsageLimitType,
  requestedAmount: number = 1
): Promise<CheckLimitResult> {
  await connectDB()

  const limit = await getUsageLimit(organizationId, limitType)
  if (!limit) {
    // If no limit, allow usage
    return {
      allowed: true,
      currentUsage: 0,
      limitValue: Infinity,
      remaining: Infinity,
      exceeded: false,
    }
  }

  const newUsage = limit.currentUsage + requestedAmount
  const exceeded = newUsage > limit.limitValue
  const remaining = Math.max(0, limit.limitValue - limit.currentUsage)

  // Check warning thresholds
  const usagePercentage = (limit.currentUsage / limit.limitValue) * 100
  let warningLevel: 1 | 2 | 3 | undefined

  if (limit.warningThreshold3 && usagePercentage >= limit.warningThreshold3) {
    warningLevel = 3
  } else if (limit.warningThreshold2 && usagePercentage >= limit.warningThreshold2) {
    warningLevel = 2
  } else if (limit.warningThreshold1 && usagePercentage >= limit.warningThreshold1) {
    warningLevel = 1
  }

  // Send warnings if threshold reached
  if (warningLevel) {
    await sendUsageWarning(organizationId, limitType, limit, warningLevel)
  }

  return {
    allowed: !exceeded,
    currentUsage: limit.currentUsage,
    limitValue: limit.limitValue,
    remaining,
    exceeded,
    warningLevel,
  }
}

/**
 * Update usage for a limit
 */
export async function updateUsageLimit(
  data: UpdateUsageData
): Promise<IUsageLimit> {
  await connectDB()

  const limit = await getUsageLimit(data.organizationId, data.limitType)
  if (!limit) {
    throw new Error(`Usage limit not found for ${data.organizationId}:${data.limitType}`)
  }

  const newUsage = Math.max(0, limit.currentUsage + data.usageDelta)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedLimit = await (UsageLimit as any).findByIdAndUpdate(
    limit._id.toString(),
    {
      $set: {
        currentUsage: newUsage,
      },
    },
    { new: true }
  )

  if (!updatedLimit) {
    throw new Error("Failed to update usage limit")
  }

  return updatedLimit
}

/**
 * Send usage warning notification
 */
async function sendUsageWarning(
  organizationId: string,
  limitType: UsageLimitType,
  limit: IUsageLimit,
  warningLevel: 1 | 2 | 3
): Promise<void> {
  // Check if warning already sent for this threshold
  const thresholdKey = `threshold${warningLevel}` as keyof typeof limit.warningsSent
  const lastWarningSent = limit.warningsSent[thresholdKey]

  // Only send warning once per threshold per day
  if (lastWarningSent) {
    const daysSinceWarning = (Date.now() - lastWarningSent.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceWarning < 1) {
      return // Already sent today
    }
  }

  const usagePercentage = Math.round((limit.currentUsage / limit.limitValue) * 100)

  // Get organization owner for notification
  // TODO: Get organization owner user ID
  // For now, skip notification if we can't get owner
  // TODO: Implement notification sending when organization owner lookup is available
  // await createNotification({
  //   userId: ownerUserId,
  //   organizationId,
  //   type: "billing_alert",
  //   title: `Usage Limit Warning (${usagePercentage}%)`,
  //   message: `Your ${limitType} usage is at ${usagePercentage}% (${limit.currentUsage}/${limit.limitValue}).`,
  //   link: `/billing?tab=usage`,
  // })

  try {
    // Update warning sent timestamp
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (UsageLimit as any).findByIdAndUpdate(limit._id.toString(), {
      $set: {
        [`warningsSent.${thresholdKey}`]: new Date(),
      },
    })

    console.log(`Usage warning sent for ${organizationId}:${limitType} at ${usagePercentage}%`)
  } catch (error: unknown) {
    console.error("Failed to send usage warning:", error)
  }
}

/**
 * Get all usage limits for an organization
 */
export async function getOrganizationUsageLimits(
  organizationId: string
): Promise<IUsageLimit[]> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const limits = await (UsageLimit as any).find({ organizationId })

  // Ensure all limit types exist
  const limitTypes: UsageLimitType[] = [
    "presentation_minutes",
    "screen_agents",
    "knowledge_documents",
    "storage_gb",
  ]

  const existingTypes = new Set(limits.map((l: IUsageLimit) => l.limitType))
  const missingTypes = limitTypes.filter((t) => !existingTypes.has(t))

  for (const limitType of missingTypes) {
    const limit = await getUsageLimit(organizationId, limitType)
    if (limit) {
      limits.push(limit)
    }
  }

  return limits
}

/**
 * Reset usage limits (for monthly/yearly reset periods)
 */
export async function resetUsageLimits(
  organizationId: string,
  limitType?: UsageLimitType
): Promise<void> {
  await connectDB()

  const query: { organizationId: string; limitType?: UsageLimitType; resetPeriod?: string } = {
    organizationId,
  }

  if (limitType) {
    query.limitType = limitType
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (UsageLimit as any).updateMany(query, {
    $set: {
      currentUsage: 0,
      lastResetAt: new Date(),
      "warningsSent.threshold1": null,
      "warningsSent.threshold2": null,
      "warningsSent.threshold3": null,
    },
  })
}
