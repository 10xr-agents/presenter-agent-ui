import { connectDB } from "@/lib/db/mongoose"
import type { IPresentationSession } from "@/lib/models/presentation-session"
import { PresentationSession } from "@/lib/models/presentation-session"
import { trackPresentationMinutes } from "@/lib/usage/metering"
import { createLiveKitRoom } from "./livekit"
import { generateSessionToken } from "./tokens"

export interface CreateSessionData {
  screenAgentId: string
  viewerEmail?: string
  viewerName?: string
  organizationId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
}

/**
 * Create a new presentation session
 */
export async function createPresentationSession(
  data: CreateSessionData
): Promise<IPresentationSession> {
  await connectDB()

  // Generate unique session token
  const sessionToken = await generateSessionToken()

  // Create session
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (PresentationSession as any).create({
    screenAgentId: data.screenAgentId,
    sessionToken,
    viewerEmail: data.viewerEmail,
    viewerName: data.viewerName,
    organizationId: data.organizationId,
    status: "pending",
    metadata: data.metadata || {},
    startedAt: new Date(),
  })

  return session
}

/**
 * Get session by token
 */
export async function getSessionByToken(
  token: string
): Promise<IPresentationSession | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (PresentationSession as any).findOne({ sessionToken: token })
  return session
}

/**
 * Get session by ID
 */
export async function getSessionById(
  sessionId: string
): Promise<IPresentationSession | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (PresentationSession as any).findById(sessionId)
  return session
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  sessionId: string,
  status: "pending" | "active" | "completed" | "ended" | "failed"
): Promise<IPresentationSession> {
  await connectDB()

  // Map status to completionStatus
  const completionStatusMap: Record<string, "completed" | "abandoned" | "error"> = {
    completed: "completed",
    ended: "abandoned",
    failed: "error",
    active: "abandoned", // Active sessions are not yet completed
    pending: "abandoned",
  }

  const completionStatus = completionStatusMap[status] || "abandoned"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (PresentationSession as any).findByIdAndUpdate(
    sessionId,
    {
      $set: {
        completionStatus,
        ...(status === "active" ? { startedAt: new Date() } : {}),
        ...(status === "completed" || status === "ended" || status === "failed"
          ? { endedAt: new Date() }
          : {}),
      },
    },
    { new: true }
  )

  if (!session) {
    throw new Error("Session not found")
  }

  return session
}

/**
 * End session and calculate duration
 */
export async function endSession(sessionId: string): Promise<IPresentationSession> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (PresentationSession as any).findById(sessionId)
  if (!session) {
    throw new Error("Session not found")
  }

  const endedAt = new Date()
  const durationSeconds = session.startedAt
    ? Math.ceil((endedAt.getTime() - session.startedAt.getTime()) / 1000)
    : 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedSession = await (PresentationSession as any).findByIdAndUpdate(
    sessionId,
    {
      $set: {
        completionStatus: "abandoned",
        endedAt,
        durationSeconds,
      },
    },
    { new: true }
  )

  if (!updatedSession) {
    throw new Error("Failed to update session")
  }

  // Track usage (calculate minutes from seconds)
  const minutes = Math.ceil(durationSeconds / 60)
  if (minutes > 0) {
    try {
      await trackPresentationMinutes(
        updatedSession.organizationId,
        updatedSession._id.toString(),
        minutes,
        updatedSession.screenAgentId
      )
    } catch (error: unknown) {
      // Log error but don't fail the session update
      console.error("Failed to track presentation usage:", error)
    }
  }

  return updatedSession
}

/**
 * List sessions for a screen agent
 */
export async function listSessions(
  screenAgentId: string,
  options?: {
    status?: "pending" | "active" | "completed" | "ended" | "failed"
    limit?: number
    offset?: number
  }
): Promise<IPresentationSession[]> {
  await connectDB()

  const query: {
    screenAgentId: string
    completionStatus?: "completed" | "abandoned" | "error"
  } = {
    screenAgentId,
  }

  // Map status to completionStatus
  if (options?.status) {
    const statusMap: Record<string, "completed" | "abandoned" | "error"> = {
      completed: "completed",
      ended: "abandoned",
      failed: "error",
      active: "abandoned",
      pending: "abandoned",
    }
    query.completionStatus = statusMap[options.status] || "abandoned"
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = await (PresentationSession as any)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(options?.limit || 50)
    .skip(options?.offset || 0)

  return sessions
}
