import { connectDB } from "@/lib/db/mongoose"
import { type INotification, Notification, type NotificationChannel, type NotificationType } from "@/lib/models/notification"
import { type INotificationPreference, NotificationPreference } from "@/lib/models/notification-preference"
import { queueEmail } from "@/lib/queue"

interface CreateNotificationData {
  userId: string
  organizationId?: string
  teamId?: string
  type: NotificationType
  title: string
  message: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
  channels?: NotificationChannel[]
}

/**
 * Get or create notification preferences for a user
 */
export async function getNotificationPreferences(
  userId: string,
  organizationId?: string
): Promise<INotificationPreference> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let preferences = await (NotificationPreference as any).findOne({ userId })

  if (!preferences) {
    // Create default preferences
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    preferences = await (NotificationPreference as any).create({
      userId,
      organizationId,
      emailEnabled: true,
      inAppEnabled: true,
      pushEnabled: false,
      preferences: {},
    })
  }

  return preferences
}

/**
 * Update notification preferences for a user
 */
export async function updateNotificationPreferences(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updates: any
): Promise<INotificationPreference | null> {
  await connectDB()

  // Convert Map to object if needed
  const updateData: any = { ...updates }
  if (updates.preferences instanceof Map) {
    updateData.preferences = Object.fromEntries(updates.preferences)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preferences = await (NotificationPreference as any).findOneAndUpdate(
    { userId },
    { $set: updateData },
    { new: true, upsert: true }
  )

  return preferences
}

/**
 * Create a notification
 * Respects user preferences and sends via appropriate channels
 */
export async function createNotification(data: CreateNotificationData): Promise<INotification> {
  await connectDB()

  // Get user preferences
  const preferences = await getNotificationPreferences(data.userId, data.organizationId)

  // Determine channels based on preferences
  let channels: NotificationChannel[] = data.channels || []

  if (channels.length === 0) {
    // Use default channels based on preferences
    const typePreferences = preferences.preferences?.get(data.type)
    if (typePreferences && typePreferences.length > 0) {
      channels = typePreferences
    } else {
      // Use global preferences
      channels = []
      if (preferences.emailEnabled) channels.push("email")
      if (preferences.inAppEnabled) channels.push("in_app")
      if (preferences.pushEnabled) channels.push("push")
    }
  }

  // Filter channels based on global settings
  const filteredChannels: NotificationChannel[] = []
  if (channels.includes("email") && preferences.emailEnabled) filteredChannels.push("email")
  if (channels.includes("in_app") && preferences.inAppEnabled) filteredChannels.push("in_app")
  if (channels.includes("push") && preferences.pushEnabled) filteredChannels.push("push")

  // Create notification
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notification = await (Notification as any).create({
    ...data,
    channels: filteredChannels,
    status: "pending",
    retryCount: 0,
  })

  // Send notification via channels (async)
  await sendNotification(notification).catch((error: unknown) => {
    console.error("Error sending notification:", error)
  })

  return notification
}

/**
 * Send a notification via its configured channels
 */
async function sendNotification(notification: INotification): Promise<void> {
  await connectDB()

  try {
    const promises: Promise<void>[] = []

    for (const channel of notification.channels) {
      switch (channel) {
        case "email":
          promises.push(sendEmailNotification(notification))
          break
        case "in_app":
          // In-app notifications are already stored in DB, just mark as sent
          promises.push(Promise.resolve())
          break
        case "push":
          // TODO: Implement push notifications
          console.log("Push notifications not yet implemented")
          promises.push(Promise.resolve())
          break
      }
    }

    await Promise.all(promises)

    // Update notification status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Notification as any).findByIdAndUpdate(notification._id, {
      $set: { status: "sent", sentAt: new Date() },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Error sending notification ${notification._id}:`, error)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Notification as any).findByIdAndUpdate(notification._id, {
      $set: {
        status: "failed",
        errorMessage,
        retryCount: notification.retryCount + 1,
      },
    })
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(notification: INotification): Promise<void> {
  // Get user email from metadata or fetch from user service
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userEmail = (notification.metadata as any)?.userEmail

  if (!userEmail) {
    console.warn(`No email address found for notification ${notification._id}`)
    return
  }

  // Queue email job
  await queueEmail({
    to: userEmail,
    subject: notification.title,
    body: `
      <h2>${notification.title}</h2>
      <p>${notification.message}</p>
      ${notification.metadata?.link ? `<p><a href="${notification.metadata.link}">View Details</a></p>` : ""}
    `,
  })
}

/**
 * Get notifications for a user
 */
export async function getUserNotifications(
  userId: string,
  options?: {
    status?: "pending" | "sent" | "failed" | "read"
    type?: NotificationType
    limit?: number
    offset?: number
  }
): Promise<INotification[]> {
  await connectDB()

  const query: {
    userId: string
    status?: string
    type?: NotificationType
  } = {
    userId,
  }

  if (options?.status) {
    query.status = options.status
  }

  if (options?.type) {
    query.type = options.type
  }

  const limit = options?.limit || 50
  const offset = options?.offset || 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Notification as any)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset)
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<INotification | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Notification as any).findByIdAndUpdate(
    notificationId,
    { $set: { status: "read", readAt: new Date() } },
    { new: true }
  )
}
