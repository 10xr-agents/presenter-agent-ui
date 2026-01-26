import mongoose, { Schema } from "mongoose"

/**
 * User Preference Model
 *
 * Stores user preferences per tenant for Chrome extension settings.
 * Used by GET/POST /api/v1/user/preferences endpoints.
 *
 * Tenant ID: userId (normal mode) or organizationId (organization mode)
 */
export interface IUserPreference extends mongoose.Document {
  tenantId: string // userId or organizationId (indexed, unique)
  userId?: string // Optional user-level preferences
  preferences: {
    theme: "light" | "dark" | "system"
    // Future: language, notifications, etc.
  }
  syncedAt: Date // Last sync timestamp
  createdAt: Date
  updatedAt: Date
}

const UserPreferenceSchema = new Schema<IUserPreference>(
  {
    tenantId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: false,
    },
    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
        required: true,
      },
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
)

// Unique index on tenantId (one preference record per tenant)
UserPreferenceSchema.index({ tenantId: 1 }, { unique: true })

export const UserPreference =
  mongoose.models.UserPreference ||
  mongoose.model<IUserPreference>("UserPreference", UserPreferenceSchema)
