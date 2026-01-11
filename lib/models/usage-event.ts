import mongoose, { Schema } from "mongoose"

export type UsageEventType = "session_minutes" | "knowledge_processing" | "storage" | "api_call"

export interface IUsageEvent extends mongoose.Document {
  organizationId: string
  userId?: string
  screenAgentId?: string
  presentationSessionId?: string

  eventType: UsageEventType
  eventTimestamp: Date

  // Usage metrics
  quantity: number // e.g., minutes, count
  unitCostCents: number // Cost per unit in cents
  totalCostCents: number // Total cost in cents

  // Billing metadata
  billingAccountId: string
  billingStatus: "unbilled" | "billed" | "refunded"
  invoiceId?: string

  // Additional metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>

  createdAt: Date
  updatedAt: Date
}

const UsageEventSchema = new Schema<IUsageEvent>(
  {
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    screenAgentId: { type: String, index: true },
    presentationSessionId: { type: String, index: true },

    eventType: {
      type: String,
      enum: ["session_minutes", "knowledge_processing", "storage", "api_call"],
      required: true,
      index: true,
    },
    eventTimestamp: { type: Date, required: true, index: true },

    quantity: { type: Number, required: true },
    unitCostCents: { type: Number, required: true },
    totalCostCents: { type: Number, required: true },

    billingAccountId: { type: String, required: true, index: true },
    billingStatus: {
      type: String,
      enum: ["unbilled", "billed", "refunded"],
      default: "unbilled",
      index: true,
    },
    invoiceId: { type: String, index: true },

    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
)

// Indexes for efficient querying
UsageEventSchema.index({ organizationId: 1, eventTimestamp: -1 })
UsageEventSchema.index({ organizationId: 1, eventType: 1, eventTimestamp: -1 })
UsageEventSchema.index({ billingAccountId: 1, eventTimestamp: -1 })
UsageEventSchema.index({ billingAccountId: 1, billingStatus: 1 })
UsageEventSchema.index({ presentationSessionId: 1, eventTimestamp: -1 })

export const UsageEvent =
  mongoose.models.UsageEvent ||
  mongoose.model<IUsageEvent>("UsageEvent", UsageEventSchema)
