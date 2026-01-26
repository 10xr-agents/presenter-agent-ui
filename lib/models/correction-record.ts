import mongoose, { Schema } from "mongoose"

/**
 * Correction Record Model (Task 8)
 *
 * Stores self-correction attempts and strategies.
 * Used by Self-Correction Engine to track retry attempts and correction strategies.
 *
 * - Created when verification fails and self-correction is triggered
 * - Used for debugging and analyzing correction effectiveness
 * - All accesses scoped by tenantId and taskId
 *
 * Tenant ID: userId (normal mode) or organizationId (organization mode)
 */
export type CorrectionStrategy =
  | "ALTERNATIVE_SELECTOR"
  | "ALTERNATIVE_TOOL"
  | "GATHER_INFORMATION"
  | "UPDATE_PLAN"
  | "RETRY_WITH_DELAY"

export interface ICorrectionRecord extends mongoose.Document {
  tenantId: string // userId or organizationId (indexed)
  taskId: string // Link to task (indexed)
  stepIndex: number // Step index that failed
  originalStep: {
    // Original step definition
    description: string
    action?: string
    expectedOutcome?: unknown
    [key: string]: unknown
  }
  correctedStep: {
    // Corrected step definition
    description: string
    action?: string
    expectedOutcome?: unknown
    [key: string]: unknown
  }
  strategy: CorrectionStrategy // Correction strategy used
  reason: string // Why correction was needed
  attemptNumber: number // Retry attempt number (1, 2, 3, etc.)
  timestamp: Date // When correction occurred (indexed)
  createdAt: Date
  updatedAt: Date
}

const CorrectionRecordSchema = new Schema<ICorrectionRecord>(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    taskId: {
      type: String,
      required: true,
      index: true,
    },
    stepIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    originalStep: {
      type: Schema.Types.Mixed,
      required: true,
    },
    correctedStep: {
      type: Schema.Types.Mixed,
      required: true,
    },
    strategy: {
      type: String,
      enum: [
        "ALTERNATIVE_SELECTOR",
        "ALTERNATIVE_TOOL",
        "GATHER_INFORMATION",
        "UPDATE_PLAN",
        "RETRY_WITH_DELAY",
      ],
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for efficient queries
CorrectionRecordSchema.index({ tenantId: 1, taskId: 1, stepIndex: 1, attemptNumber: 1 }) // For tracking retry attempts
CorrectionRecordSchema.index({ tenantId: 1, timestamp: -1 }) // For tenant-scoped queries

export const CorrectionRecord =
  mongoose.models.CorrectionRecord ||
  mongoose.model<ICorrectionRecord>("CorrectionRecord", CorrectionRecordSchema)
