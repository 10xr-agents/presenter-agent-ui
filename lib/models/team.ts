import mongoose, { Schema } from "mongoose"

export interface ITeam extends mongoose.Document {
  name: string
  description?: string
  organizationId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: Record<string, any>
  accessControlPolicy?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
  createdAt: Date
  updatedAt: Date
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, index: true },
    description: String,
    organizationId: { type: String, required: true },
    settings: Schema.Types.Mixed,
    accessControlPolicy: Schema.Types.Mixed,
  },
  { timestamps: true }
)

// Indexes for efficient queries
TeamSchema.index({ organizationId: 1, name: 1 }, { unique: true })
TeamSchema.index({ organizationId: 1, createdAt: -1 })

export const Team =
  mongoose.models.Team ||
  mongoose.model<ITeam>("Team", TeamSchema)
