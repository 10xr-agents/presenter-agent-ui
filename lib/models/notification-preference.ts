import mongoose, { Schema } from "mongoose"

export type NotificationType =
  | "session_completed"
  | "session_started"
  | "usage_limit_warning"
  | "usage_limit_reached"
  | "billing_alert"
  | "team_invite"
  | "organization_upgrade"
  | "system_alert"

export type NotificationChannel = "email" | "in_app" | "push"

export interface INotificationPreference extends Omit<mongoose.Document, "model"> {
  userId: string
  organizationId?: string

  // Preferences: type -> channels mapping
  // If a type is not in the map, it defaults to enabled for all channels
  preferences: Map<NotificationType, NotificationChannel[]>

  // Global settings
  emailEnabled: boolean
  inAppEnabled: boolean
  pushEnabled: boolean

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, index: true },

    // Preferences stored as an object (MongoDB doesn't support Map directly)
    preferences: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Global settings
    emailEnabled: { type: Boolean, default: true },
    inAppEnabled: { type: Boolean, default: true },
    pushEnabled: { type: Boolean, default: false }, // Push disabled by default
  },
  { timestamps: true }
)

export const NotificationPreference =
  mongoose.models.NotificationPreference ||
  mongoose.model<INotificationPreference>("NotificationPreference", NotificationPreferenceSchema)
