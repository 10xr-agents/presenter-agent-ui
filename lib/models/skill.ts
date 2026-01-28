/**
 * Skills Library Model (Phase 4 Task 6)
 *
 * Episodic memory for successful corrections. When self-correction (Step 3.4)
 * fixes a failure, the lesson is stored here for future retrieval.
 *
 * Schema stores triplets: (Goal, Failed_State, Successful_Action)
 * Example: "Goal: Add Patient", "Fail: Click Patient", "Success: Click New/Search"
 *
 * Constraints:
 * - Tenant isolation (REQUIRED)
 * - Domain-specific (different UIs have different patterns)
 * - TTL: 90 days since lastUsed (prevent unbounded growth)
 * - Max 10,000 skills per tenant (prevent abuse)
 * - Min 50% success rate for injection
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 4 Task 6, Section A
 */

import mongoose, { Schema, Types } from "mongoose"

// =============================================================================
// Types
// =============================================================================

/**
 * Failed state that triggered correction
 */
export interface FailedState {
  /** The action that failed (e.g., "click(68)") */
  action: string
  /** Description of target element (e.g., "Patient menu button") */
  elementDescription: string
  /** Type of error (e.g., "VERIFICATION_FAILED", "ELEMENT_NOT_FOUND") */
  errorType: string
  /** Additional error context */
  errorMessage?: string
  /** DOM context at time of failure (truncated) */
  domSnapshot?: string
}

/**
 * Successful action that fixed the failure
 */
export interface SuccessfulAction {
  /** The action that succeeded (e.g., "click(79)") */
  action: string
  /** Description of target element (e.g., "New/Search menu item") */
  elementDescription: string
  /** Strategy used for correction */
  strategy:
    | "ALTERNATIVE_SELECTOR"
    | "WAIT_FOR_ELEMENT"
    | "SCROLL_INTO_VIEW"
    | "MENU_EXPANSION"
    | "FORM_NAVIGATION"
    | "RETRY"
    | "OTHER"
  /** Why this action worked */
  reasoning?: string
}

/**
 * Skill document interface
 */
export interface ISkill extends Omit<mongoose.Document, "model"> {
  /** Unique identifier (UUID) */
  skillId: string

  /** Tenant ID - REQUIRED for isolation */
  tenantId: string

  /** Domain this skill applies to (e.g., "demo.openemr.io") */
  domain: string

  /** High-level goal (e.g., "Add a new patient", "Schedule appointment") */
  goal: string

  /** Normalized goal for matching (lowercase, stripped) */
  goalNormalized: string

  /** The failed state that triggered this skill */
  failedState: FailedState

  /** The successful action that resolved the failure */
  successfulAction: SuccessfulAction

  /** How many times this skill led to success */
  successCount: number

  /** How many times this skill was tried but failed */
  failureCount: number

  /** Success rate (computed: successCount / (successCount + failureCount)) */
  successRate: number

  /** URL pattern where this skill applies (regex or exact) */
  urlPattern?: string

  /** Tags for categorization */
  tags: string[]

  /** When this skill was last used successfully */
  lastUsed: Date

  /** When this skill was created */
  createdAt: Date

  /** When this skill was last updated */
  updatedAt: Date
}

// =============================================================================
// Schema
// =============================================================================

const FailedStateSchema = new Schema<FailedState>(
  {
    action: { type: String, required: true },
    elementDescription: { type: String, required: true },
    errorType: { type: String, required: true },
    errorMessage: { type: String },
    domSnapshot: { type: String, maxlength: 5000 }, // Truncate to 5KB
  },
  { _id: false }
)

const SuccessfulActionSchema = new Schema<SuccessfulAction>(
  {
    action: { type: String, required: true },
    elementDescription: { type: String, required: true },
    strategy: {
      type: String,
      enum: [
        "ALTERNATIVE_SELECTOR",
        "WAIT_FOR_ELEMENT",
        "SCROLL_INTO_VIEW",
        "MENU_EXPANSION",
        "FORM_NAVIGATION",
        "RETRY",
        "OTHER",
      ],
      required: true,
    },
    reasoning: { type: String },
  },
  { _id: false }
)

const SkillSchema = new Schema<ISkill>(
  {
    skillId: {
      type: String,
      required: true,
      unique: true,
      default: () => new Types.ObjectId().toString(),
    },

    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    domain: {
      type: String,
      required: true,
      index: true,
    },

    goal: {
      type: String,
      required: true,
    },

    goalNormalized: {
      type: String,
      required: true,
      index: true,
    },

    failedState: {
      type: FailedStateSchema,
      required: true,
    },

    successfulAction: {
      type: SuccessfulActionSchema,
      required: true,
    },

    successCount: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },

    failureCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    successRate: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
      max: 1,
    },

    urlPattern: {
      type: String,
    },

    tags: {
      type: [String],
      default: [],
    },

    lastUsed: {
      type: Date,
      required: true,
      default: Date.now,
      // Index defined at schema level with TTL expiry
    },
  },
  {
    timestamps: true,
  }
)

// =============================================================================
// Indexes
// =============================================================================

// Primary lookup: tenant + domain + goal (for skill retrieval)
SkillSchema.index({ tenantId: 1, domain: 1, goalNormalized: 1 })

// Alternative lookup with success rate for quality filtering
SkillSchema.index({ tenantId: 1, domain: 1, successRate: -1 })

// TTL index for automatic cleanup (90 days since lastUsed)
SkillSchema.index({ lastUsed: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

// For counting skills per tenant (to enforce limit)
SkillSchema.index({ tenantId: 1, createdAt: -1 })

// Deduplication: same tenant + domain + goal + failed action = same skill
SkillSchema.index(
  { tenantId: 1, domain: 1, goalNormalized: 1, "failedState.action": 1 },
  { unique: true }
)

// =============================================================================
// Pre-save Hook
// =============================================================================

SkillSchema.pre("save", function (next) {
  // Normalize goal for matching
  this.goalNormalized = normalizeGoal(this.goal)

  // Compute success rate
  const total = this.successCount + this.failureCount
  this.successRate = total > 0 ? this.successCount / total : 1

  next()
})

// =============================================================================
// Static Methods
// =============================================================================

/**
 * Normalize goal string for matching
 */
export function normalizeGoal(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// =============================================================================
// Model Export
// =============================================================================

export const Skill =
  mongoose.models.Skill || mongoose.model<ISkill>("Skill", SkillSchema)

// =============================================================================
// Helper Types for API
// =============================================================================

/**
 * Input for creating a skill
 */
export interface CreateSkillInput {
  tenantId: string
  domain: string
  goal: string
  failedState: FailedState
  successfulAction: SuccessfulAction
  urlPattern?: string
  tags?: string[]
}

/**
 * Input for skill lookup
 */
export interface SkillLookupInput {
  tenantId: string
  domain: string
  goal: string
  minSuccessRate?: number // Default: 0.5
  limit?: number // Default: 5
}

/**
 * Skill hint for prompt injection
 */
export interface SkillHint {
  skillId: string
  goal: string
  failedAction: string
  failedElement: string
  successfulAction: string
  successfulElement: string
  strategy: string
  successRate: number
}
