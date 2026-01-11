import { connectDB } from "@/lib/db/mongoose"
import type { IAnalyticsEvent } from "@/lib/models/analytics-event"
import { AnalyticsEvent } from "@/lib/models/analytics-event"

export interface EngagementMetrics {
  totalQuestions: number
  totalPageNavigations: number
  sessionDuration: number // in minutes
  interactions: number
  completionRate: number // 0-1
}

/**
 * Calculate engagement score for a session
 * Score is 0-100, based on multiple factors
 */
export async function calculateEngagementScore(
  sessionId: string
): Promise<number> {
  await connectDB()

  // Get all events for this session
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = await (AnalyticsEvent as any).find({ sessionId })

  const metrics = calculateMetrics(events)

  // Calculate score based on weighted factors
  let score = 0

  // Questions asked (0-30 points)
  score += Math.min(metrics.totalQuestions * 5, 30)

  // Page navigations (0-20 points)
  score += Math.min(metrics.totalPageNavigations * 2, 20)

  // Session duration (0-25 points)
  // Longer sessions = higher score (up to 25 points for 30+ minutes)
  score += Math.min((metrics.sessionDuration / 30) * 25, 25)

  // Interactions (0-15 points)
  score += Math.min(metrics.interactions * 1.5, 15)

  // Completion rate (0-10 points)
  score += metrics.completionRate * 10

  return Math.round(Math.min(score, 100))
}

/**
 * Calculate engagement metrics from events
 */
function calculateMetrics(events: IAnalyticsEvent[]): EngagementMetrics {
  let totalQuestions = 0
  let totalPageNavigations = 0
  let interactions = 0
  let sessionStartTime: Date | null = null
  let sessionEndTime: Date | null = null

  for (const event of events) {
    switch (event.eventType) {
      case "viewer_question":
        totalQuestions++
        interactions++
        break
      case "page_navigation":
        totalPageNavigations++
        interactions++
        break
      case "session_milestone":
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const milestoneType = (event.properties as any)?.milestoneType
        if (milestoneType === "started") {
          sessionStartTime = event.eventTimestamp
        } else if (milestoneType === "completed") {
          sessionEndTime = event.eventTimestamp
        }
        break
      case "agent_response":
        interactions++
        break
    }
  }

  const sessionDuration = sessionStartTime && sessionEndTime
    ? Math.ceil((sessionEndTime.getTime() - sessionStartTime.getTime()) / 1000 / 60)
    : 0

  // Calculate completion rate (1.0 if session_milestone with completed exists, 0.0 otherwise)
  const completionRate = events.some(
    (e) =>
      e.eventType === "session_milestone" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e.properties as any)?.milestoneType === "completed"
  )
    ? 1.0
    : 0.0

  return {
    totalQuestions,
    totalPageNavigations,
    sessionDuration,
    interactions,
    completionRate,
  }
}

/**
 * Get engagement metrics for a session
 */
export async function getSessionEngagementMetrics(
  sessionId: string
): Promise<EngagementMetrics> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = await (AnalyticsEvent as any).find({ presentationSessionId: sessionId })

  return calculateMetrics(events)
}
