import { connectDB } from "@/lib/db/mongoose"
import { AnalyticsEvent } from "@/lib/models/analytics-event"
import type { IAnalyticsEvent } from "@/lib/models/analytics-event"

export interface QuestionCluster {
  question: string
  count: number
  sessions: string[]
}

export interface AnalyticsAggregation {
  totalSessions: number
  totalQuestions: number
  totalPageNavigations: number
  averageSessionDuration: number
  averageEngagementScore: number
  completionRate: number
  topQuestions: QuestionCluster[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventBreakdown: Record<string, any>
}

/**
 * Aggregate analytics for a screen agent
 */
export async function aggregateScreenAgentAnalytics(
  screenAgentId: string,
  startDate?: Date,
  endDate?: Date
): Promise<AnalyticsAggregation> {
  await connectDB()

  const query: {
    screenAgentId: string
    timestamp?: { $gte?: Date; $lte?: Date }
  } = {
    screenAgentId,
  }

  if (startDate || endDate) {
    query.timestamp = {}
    if (startDate) query.timestamp.$gte = startDate
    if (endDate) query.timestamp.$lte = endDate
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = await (AnalyticsEvent as any).find(query)

  // Calculate aggregations
  const uniqueSessions = new Set<string>()
  let totalQuestions = 0
  let totalPageNavigations = 0
  const sessionDurations: number[] = []
  const engagementScores: number[] = []
  let completedSessions = 0
  const questionMap = new Map<string, { count: number; sessions: Set<string> }>()

  let currentSessionStart: Date | null = null
  let currentSessionId: string | null = null

  for (const event of events) {
    uniqueSessions.add(event.sessionId)

    switch (event.eventType) {
      case "question_asked":
        totalQuestions++
        const question = (event.eventData as { question?: string })?.question || "Unknown"
        if (!questionMap.has(question)) {
          questionMap.set(question, { count: 0, sessions: new Set() })
        }
        const qData = questionMap.get(question)!
        qData.count++
        qData.sessions.add(event.sessionId)
        break

      case "page_navigated":
        totalPageNavigations++
        break

      case "session_started":
        currentSessionStart = event.timestamp
        currentSessionId = event.sessionId
        break

      case "session_ended":
        if (currentSessionStart && currentSessionId === event.sessionId) {
          const duration = Math.ceil(
            (event.timestamp.getTime() - currentSessionStart.getTime()) / 1000 / 60
          )
          sessionDurations.push(duration)
        }
        currentSessionStart = null
        currentSessionId = null
        break

      case "session_completed":
        completedSessions++
        break

      case "engagement_score":
        const score = (event.eventData as { score?: number })?.score
        if (score !== undefined) {
          engagementScores.push(score)
        }
        break
    }
  }

  // Calculate averages
  const totalSessions = uniqueSessions.size
  const averageSessionDuration =
    sessionDurations.length > 0
      ? sessionDurations.reduce((sum: number, d: number) => sum + d, 0) /
        sessionDurations.length
      : 0
  const averageEngagementScore =
    engagementScores.length > 0
      ? engagementScores.reduce((sum: number, s: number) => sum + s, 0) /
        engagementScores.length
      : 0
  const completionRate =
    totalSessions > 0 ? completedSessions / totalSessions : 0

  // Get top questions
  const topQuestions: QuestionCluster[] = Array.from(questionMap.entries())
    .map(([question, data]) => ({
      question,
      count: data.count,
      sessions: Array.from(data.sessions),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10) // Top 10

  // Event breakdown
  const eventBreakdown: Record<string, number> = {}
  for (const event of events) {
    eventBreakdown[event.eventType] = (eventBreakdown[event.eventType] || 0) + 1
  }

  return {
    totalSessions,
    totalQuestions,
    totalPageNavigations,
    averageSessionDuration: Math.round(averageSessionDuration * 10) / 10,
    averageEngagementScore: Math.round(averageEngagementScore * 10) / 10,
    completionRate: Math.round(completionRate * 100) / 100,
    topQuestions,
    eventBreakdown,
  }
}

/**
 * Aggregate analytics for an organization
 */
export async function aggregateOrganizationAnalytics(
  organizationId: string,
  startDate?: Date,
  endDate?: Date
): Promise<AnalyticsAggregation> {
  await connectDB()

  const query: {
    organizationId: string
    eventTimestamp?: { $gte?: Date; $lte?: Date }
  } = {
    organizationId,
  }

  if (startDate || endDate) {
    query.eventTimestamp = {}
    if (startDate) query.eventTimestamp.$gte = startDate
    if (endDate) query.eventTimestamp.$lte = endDate
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events = await (AnalyticsEvent as any).find(query)

  // Use same aggregation logic as screen agent
  const uniqueSessions = new Set<string>()
  let totalQuestions = 0
  let totalPageNavigations = 0
  const sessionDurations: number[] = []
  const engagementScores: number[] = []
  let completedSessions = 0
  const questionMap = new Map<string, { count: number; sessions: Set<string> }>()

  let currentSessionStart: Date | null = null
  let currentSessionId: string | null = null

  for (const event of events) {
    uniqueSessions.add(event.sessionId)

    switch (event.eventType) {
      case "question_asked":
        totalQuestions++
        const question = (event.eventData as { question?: string })?.question || "Unknown"
        if (!questionMap.has(question)) {
          questionMap.set(question, { count: 0, sessions: new Set() })
        }
        const qData = questionMap.get(question)!
        qData.count++
        qData.sessions.add(event.sessionId)
        break

      case "page_navigated":
        totalPageNavigations++
        break

      case "session_started":
        currentSessionStart = event.timestamp
        currentSessionId = event.sessionId
        break

      case "session_ended":
        if (currentSessionStart && currentSessionId === event.sessionId) {
          const duration = Math.ceil(
            (event.timestamp.getTime() - currentSessionStart.getTime()) / 1000 / 60
          )
          sessionDurations.push(duration)
        }
        currentSessionStart = null
        currentSessionId = null
        break

      case "session_completed":
        completedSessions++
        break

      case "engagement_score":
        const score = (event.eventData as { score?: number })?.score
        if (score !== undefined) {
          engagementScores.push(score)
        }
        break
    }
  }

  const totalSessions = uniqueSessions.size
  const averageSessionDuration =
    sessionDurations.length > 0
      ? sessionDurations.reduce((sum: number, d: number) => sum + d, 0) /
        sessionDurations.length
      : 0
  const averageEngagementScore =
    engagementScores.length > 0
      ? engagementScores.reduce((sum: number, s: number) => sum + s, 0) /
        engagementScores.length
      : 0
  const completionRate =
    totalSessions > 0 ? completedSessions / totalSessions : 0

  const topQuestions: QuestionCluster[] = Array.from(questionMap.entries())
    .map(([question, data]) => ({
      question,
      count: data.count,
      sessions: Array.from(data.sessions),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const eventBreakdown: Record<string, number> = {}
  for (const event of events) {
    eventBreakdown[event.eventType] = (eventBreakdown[event.eventType] || 0) + 1
  }

  return {
    totalSessions,
    totalQuestions,
    totalPageNavigations,
    averageSessionDuration: Math.round(averageSessionDuration * 10) / 10,
    averageEngagementScore: Math.round(averageEngagementScore * 10) / 10,
    completionRate: Math.round(completionRate * 100) / 100,
    topQuestions,
    eventBreakdown,
  }
}
