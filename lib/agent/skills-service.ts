/**
 * Skills Service (Phase 4 Task 6)
 *
 * CRUD operations and retrieval for the Skills Library (episodic memory).
 * Provides skill storage, lookup, and prompt hint generation.
 *
 * Key Features:
 * - Tenant isolation (REQUIRED)
 * - Domain-specific matching
 * - Success rate filtering
 * - TTL-based cleanup
 * - Max skills per tenant enforcement
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 4 Task 6
 */

import * as Sentry from "@sentry/nextjs"
import {
  Skill,
  normalizeGoal,
  type ISkill,
  type CreateSkillInput,
  type SkillLookupInput,
  type SkillHint,
} from "@/lib/models/skill"
import connectMongoose from "@/lib/db/mongoose"

// =============================================================================
// Constants
// =============================================================================

/** Maximum skills per tenant to prevent abuse */
const MAX_SKILLS_PER_TENANT = 10000

/** Minimum success rate for skill injection (50%) */
const MIN_SUCCESS_RATE_FOR_INJECTION = 0.5

/** Default number of skills to return in lookup */
const DEFAULT_LOOKUP_LIMIT = 5

// =============================================================================
// Skill Management
// =============================================================================

/**
 * Create or update a skill from a successful correction
 *
 * Implements upsert logic:
 * - If skill exists (same tenant + domain + goal + failed action), increment successCount
 * - If new, create with successCount = 1
 *
 * @param input - Skill creation input
 * @returns Created or updated skill
 */
export async function recordSuccessfulCorrection(
  input: CreateSkillInput
): Promise<ISkill | null> {
  try {
    await connectMongoose()

    const goalNormalized = normalizeGoal(input.goal)

    // Check tenant skill count limit
    const currentCount = await (Skill as any).countDocuments({
      tenantId: input.tenantId,
    })
    if (currentCount >= MAX_SKILLS_PER_TENANT) {
      console.warn(
        `[Skills] Tenant ${input.tenantId} has reached max skills (${MAX_SKILLS_PER_TENANT})`
      )
      // Delete oldest unused skill to make room
      await (Skill as any).findOneAndDelete({
        tenantId: input.tenantId,
      }).sort({ lastUsed: 1 })
    }

    // Upsert skill
    const skill = await (Skill as any).findOneAndUpdate(
      {
        tenantId: input.tenantId,
        domain: input.domain,
        goalNormalized,
        "failedState.action": input.failedState.action,
      },
      {
        $set: {
          goal: input.goal,
          failedState: input.failedState,
          successfulAction: input.successfulAction,
          urlPattern: input.urlPattern,
          tags: input.tags || [],
          lastUsed: new Date(),
        },
        $inc: {
          successCount: 1,
        },
        $setOnInsert: {
          skillId: undefined, // Will use default
          failureCount: 0,
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    )

    console.log(
      `[Skills] Recorded skill for "${input.goal}" on ${input.domain} ` +
        `(success count: ${skill.successCount})`
    )

    return skill
  } catch (error: unknown) {
    // Handle duplicate key error gracefully (race condition)
    if ((error as any)?.code === 11000) {
      console.log(`[Skills] Skill already exists, updating...`)
      return recordSuccessfulCorrection(input) // Retry
    }

    Sentry.captureException(error, {
      tags: { component: "skills-service", operation: "recordSuccessfulCorrection" },
      extra: { tenantId: input.tenantId, domain: input.domain, goal: input.goal },
    })
    console.error("[Skills] Error recording skill:", error)
    return null
  }
}

/**
 * Record a skill failure (when a skill hint didn't work)
 *
 * Increments failureCount and recalculates successRate.
 *
 * @param skillId - Skill to mark as failed
 * @returns Updated skill
 */
export async function recordSkillFailure(skillId: string): Promise<ISkill | null> {
  try {
    await connectMongoose()

    const skill = await (Skill as any).findOneAndUpdate(
      { skillId },
      {
        $inc: { failureCount: 1 },
        $set: { lastUsed: new Date() },
      },
      { new: true }
    )

    if (skill) {
      // Recalculate success rate
      const total = skill.successCount + skill.failureCount
      skill.successRate = total > 0 ? skill.successCount / total : 0
      await skill.save()

      console.log(
        `[Skills] Recorded failure for skill ${skillId} ` +
          `(success rate: ${(skill.successRate * 100).toFixed(1)}%)`
      )
    }

    return skill
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "skills-service", operation: "recordSkillFailure" },
      extra: { skillId },
    })
    console.error("[Skills] Error recording skill failure:", error)
    return null
  }
}

// =============================================================================
// Skill Lookup
// =============================================================================

/**
 * Find relevant skills for a given goal and context
 *
 * Retrieves skills that match:
 * - Same tenant (REQUIRED)
 * - Same domain (REQUIRED)
 * - Similar goal (normalized matching)
 * - Success rate above threshold
 *
 * @param input - Lookup parameters
 * @returns Matching skills sorted by success rate
 */
export async function findRelevantSkills(
  input: SkillLookupInput
): Promise<ISkill[]> {
  try {
    await connectMongoose()

    const goalNormalized = normalizeGoal(input.goal)
    const minSuccessRate = input.minSuccessRate ?? MIN_SUCCESS_RATE_FOR_INJECTION
    const limit = input.limit ?? DEFAULT_LOOKUP_LIMIT

    // Extract keywords from goal for fuzzy matching
    const keywords = goalNormalized.split(" ").filter((w) => w.length > 2)

    // Build query
    const query: any = {
      tenantId: input.tenantId,
      domain: input.domain,
      successRate: { $gte: minSuccessRate },
    }

    // Match by exact normalized goal OR keywords
    if (keywords.length > 0) {
      query.$or = [
        { goalNormalized },
        { goalNormalized: { $regex: keywords.join("|"), $options: "i" } },
      ]
    } else {
      query.goalNormalized = goalNormalized
    }

    const skills = await (Skill as any)
      .find(query)
      .sort({ successRate: -1, successCount: -1, lastUsed: -1 })
      .limit(limit)
      .lean()

    console.log(
      `[Skills] Found ${skills.length} relevant skills for "${input.goal}" on ${input.domain}`
    )

    return skills
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "skills-service", operation: "findRelevantSkills" },
      extra: { tenantId: input.tenantId, domain: input.domain, goal: input.goal },
    })
    console.error("[Skills] Error finding skills:", error)
    return []
  }
}

/**
 * Generate skill hints for prompt injection
 *
 * Converts skills to a format suitable for LLM prompt injection.
 *
 * @param skills - Skills to convert
 * @returns Skill hints for prompt injection
 */
export function generateSkillHints(skills: ISkill[]): SkillHint[] {
  return skills.map((skill) => ({
    skillId: skill.skillId,
    goal: skill.goal,
    failedAction: skill.failedState.action,
    failedElement: skill.failedState.elementDescription,
    successfulAction: skill.successfulAction.action,
    successfulElement: skill.successfulAction.elementDescription,
    strategy: skill.successfulAction.strategy,
    successRate: skill.successRate,
  }))
}

/**
 * Build prompt injection text from skill hints
 *
 * Creates a formatted string to inject into action generation prompts.
 *
 * @param hints - Skill hints to format
 * @returns Formatted prompt injection text
 */
export function buildSkillPromptInjection(hints: SkillHint[]): string {
  if (hints.length === 0) return ""

  const lines = [
    "LEARNED PATTERNS (from previous successful corrections):",
    "These patterns worked in the past for similar goals:",
    "",
  ]

  hints.forEach((hint, i) => {
    lines.push(
      `${i + 1}. For goal "${hint.goal}":`,
      `   - AVOID: ${hint.failedAction} on "${hint.failedElement}" (failed before)`,
      `   - USE: ${hint.successfulAction} on "${hint.successfulElement}" (strategy: ${hint.strategy})`,
      `   - Success rate: ${(hint.successRate * 100).toFixed(0)}%`,
      ""
    )
  })

  lines.push(
    "Consider these patterns when choosing your action. Prefer successful alternatives over known failures."
  )

  return lines.join("\n")
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Delete low-performing skills for a tenant
 *
 * Removes skills with success rate below threshold.
 *
 * @param tenantId - Tenant ID
 * @param minSuccessRate - Minimum success rate to keep (default: 0.3)
 * @returns Number of deleted skills
 */
export async function cleanupLowPerformingSkills(
  tenantId: string,
  minSuccessRate = 0.3
): Promise<number> {
  try {
    await connectMongoose()

    const result = await (Skill as any).deleteMany({
      tenantId,
      successRate: { $lt: minSuccessRate },
      // Only delete if tried at least 3 times (give it a fair chance)
      $expr: { $gte: [{ $add: ["$successCount", "$failureCount"] }, 3] },
    })

    console.log(
      `[Skills] Cleaned up ${result.deletedCount} low-performing skills for tenant ${tenantId}`
    )

    return result.deletedCount
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "skills-service", operation: "cleanupLowPerformingSkills" },
      extra: { tenantId },
    })
    console.error("[Skills] Error cleaning up skills:", error)
    return 0
  }
}

/**
 * Get skill statistics for a tenant
 *
 * @param tenantId - Tenant ID
 * @returns Skill statistics
 */
export async function getSkillStats(tenantId: string): Promise<{
  totalSkills: number
  avgSuccessRate: number
  topDomains: Array<{ domain: string; count: number }>
}> {
  try {
    await connectMongoose()

    const [stats, domains] = await Promise.all([
      (Skill as any).aggregate([
        { $match: { tenantId } },
        {
          $group: {
            _id: null,
            totalSkills: { $sum: 1 },
            avgSuccessRate: { $avg: "$successRate" },
          },
        },
      ]),
      (Skill as any).aggregate([
        { $match: { tenantId } },
        { $group: { _id: "$domain", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { domain: "$_id", count: 1, _id: 0 } },
      ]),
    ])

    return {
      totalSkills: stats[0]?.totalSkills || 0,
      avgSuccessRate: stats[0]?.avgSuccessRate || 0,
      topDomains: domains,
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "skills-service", operation: "getSkillStats" },
      extra: { tenantId },
    })
    console.error("[Skills] Error getting skill stats:", error)
    return { totalSkills: 0, avgSuccessRate: 0, topDomains: [] }
  }
}
