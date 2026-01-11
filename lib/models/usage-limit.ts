import mongoose, { Schema } from "mongoose"

export type UsageLimitType = "presentation_minutes" | "screen_agents" | "knowledge_documents" | "storage_gb"

export interface IUsageLimit extends mongoose.Document {
  organizationId: string

  limitType: UsageLimitType
  limitValue: number // Maximum allowed value
  currentUsage: number // Current usage value

  // Warning thresholds (percentage)
  warningThreshold1?: number // e.g., 80% - first warning
  warningThreshold2?: number // e.g., 90% - second warning
  warningThreshold3?: number // e.g., 95% - final warning

  // Warning tracking
  warningsSent: {
    threshold1?: Date
    threshold2?: Date
    threshold3?: Date
  }

  // Reset period (for recurring limits)
  resetPeriod?: "monthly" | "yearly"
  lastResetAt?: Date

  // Additional metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>

  createdAt: Date
  updatedAt: Date
}

const UsageLimitSchema = new Schema<IUsageLimit>(
  {
    organizationId: { type: String, required: true, index: true },
    limitType: {
      type: String,
      enum: ["presentation_minutes", "screen_agents", "knowledge_documents", "storage_gb"],
      required: true,
      index: true,
    },
    limitValue: { type: Number, required: true },
    currentUsage: { type: Number, default: 0 },

    warningThreshold1: { type: Number }, // e.g., 80
    warningThreshold2: { type: Number }, // e.g., 90
    warningThreshold3: { type: Number }, // e.g., 95

    warningsSent: {
      threshold1: Date,
      threshold2: Date,
      threshold3: Date,
    },

    resetPeriod: {
      type: String,
      enum: ["monthly", "yearly"],
    },
    lastResetAt: { type: Date },

    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
)

// Indexes
UsageLimitSchema.index({ organizationId: 1, limitType: 1 }, { unique: true })
UsageLimitSchema.index({ organizationId: 1, currentUsage: 1 })

export const UsageLimit =
  mongoose.models.UsageLimit ||
  mongoose.model<IUsageLimit>("UsageLimit", UsageLimitSchema)
