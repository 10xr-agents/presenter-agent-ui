import mongoose, { Schema } from "mongoose"

/**
 * Verification Record Model (Task 7)
 *
 * Stores verification results for each action.
 * Used by Verification Engine to track whether actions achieved their expected outcomes.
 *
 * - Created after each action is verified
 * - Used for self-correction (Task 8) and debugging
 * - All accesses scoped by tenantId and taskId
 *
 * Tenant ID: userId (normal mode) or organizationId (organization mode)
 */
export interface IVerificationRecord extends mongoose.Document {
  tenantId: string // userId or organizationId (indexed)
  taskId: string // Link to task (indexed)
  stepIndex: number // Step index in plan
  success: boolean // Whether verification passed
  confidence: number // Confidence score (0-1)
  expectedState: {
    // What was expected
    description?: string
    domChanges?: {
      elementShouldExist?: string
      elementShouldNotExist?: string
      elementShouldHaveText?: {
        selector: string
        text: string
      }
      urlShouldChange?: boolean
    }
    [key: string]: unknown
  }
  actualState: {
    // What actually happened
    domSnapshot: string // Current DOM
    url: string // Current URL
    extractedText?: string // Key text from page
    elementStates?: Array<{
      selector: string
      exists: boolean
      text?: string
    }>
  }
  comparison: {
    // Detailed comparison results
    domChecks?: {
      elementExists?: boolean
      elementNotExists?: boolean
      elementTextMatches?: boolean
      urlChanged?: boolean
    }
    semanticMatch?: boolean // LLM-based semantic verification result
    overallMatch: boolean // Overall match result
  }
  reason: string // Explanation of verification result
  timestamp: Date // When verification occurred (indexed)
  createdAt: Date
  updatedAt: Date
}

const VerificationRecordSchema = new Schema<IVerificationRecord>(
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
    success: {
      type: Boolean,
      required: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    expectedState: {
      type: Schema.Types.Mixed,
      required: true,
    },
    actualState: {
      type: Schema.Types.Mixed,
      required: true,
    },
    comparison: {
      type: Schema.Types.Mixed,
      required: true,
    },
    reason: {
      type: String,
      required: true,
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
VerificationRecordSchema.index({ tenantId: 1, taskId: 1, stepIndex: 1 }) // For task-specific verification queries
VerificationRecordSchema.index({ tenantId: 1, timestamp: -1 }) // For tenant-scoped queries

export const VerificationRecord =
  mongoose.models.VerificationRecord ||
  mongoose.model<IVerificationRecord>("VerificationRecord", VerificationRecordSchema)
