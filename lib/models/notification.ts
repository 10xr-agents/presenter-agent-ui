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
export type NotificationStatus = "pending" | "sent" | "failed" | "read"

export interface INotification extends Omit<mongoose.Document, "model"> {
  userId: string
  organizationId?: string
  teamId?: string

  // Notification content
  type: NotificationType
  title: string
  message: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any> // Additional context (e.g., sessionId, amount, etc.)

  // Delivery
  channels: NotificationChannel[]
  status: NotificationStatus
  sentAt?: Date
  readAt?: Date

  // Error tracking
  errorMessage?: string
  retryCount: number

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: String, required: true, index: true },
    organizationId: { type: String, index: true },
    teamId: { type: String, index: true },

    // Notification content
    type: {
      type: String,
      enum: [
        "session_completed",
        "session_started",
        "usage_limit_warning",
        "usage_limit_reached",
        "billing_alert",
        "team_invite",
        "organization_upgrade",
        "system_alert",
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metadata: Schema.Types.Mixed,

    // Delivery
    channels: [
      {
        type: String,
        enum: ["email", "in_app", "push"],
      },
    ],
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "read"],
      default: "pending",
      index: true,
    },
    sentAt: Date,
    readAt: Date,

    // Error tracking
    errorMessage: String,
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// Indexes for efficient queries
NotificationSchema.index({ userId: 1, status: 1 })
NotificationSchema.index({ userId: 1, createdAt: -1 })
NotificationSchema.index({ organizationId: 1, type: 1 })
NotificationSchema.index({ status: 1, createdAt: 1 }) // For processing pending notifications

export const Notification =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema)
