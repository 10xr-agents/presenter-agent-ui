import { connectDB } from "@/lib/db/mongoose"
import type { IAnalyticsEvent } from "@/lib/models/analytics-event"
import { AnalyticsEvent } from "@/lib/models/analytics-event"

export type AnalyticsEventType =
  | "viewer_question"
  | "page_navigation"
  | "agent_response"
  | "session_milestone"

export interface TrackEventData {
  sessionId: string
  screenAgentId: string
  organizationId: string
  eventType: AnalyticsEventType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData?: Record<string, any>
  userId?: string
  viewerEmail?: string
}

/**
 * Track an analytics event
 */
export async function trackEvent(data: TrackEventData): Promise<IAnalyticsEvent> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = await (AnalyticsEvent as any).create({
    sessionId: data.sessionId,
    screenAgentId: data.screenAgentId,
    organizationId: data.organizationId,
    eventType: data.eventType,
    eventData: data.eventData || {},
    userId: data.userId,
    viewerEmail: data.viewerEmail,
    timestamp: new Date(),
  })

  return event
}

/**
 * Track a question
 */
export async function trackQuestion(
  sessionId: string,
  screenAgentId: string,
  organizationId: string,
  question: string,
  viewerEmail?: string
): Promise<IAnalyticsEvent> {
  return trackEvent({
    sessionId,
    screenAgentId,
    organizationId,
    eventType: "viewer_question",
    eventData: {
      questionText: question,
    },
    viewerEmail,
  })
}

/**
 * Track page navigation
 */
export async function trackPageNavigation(
  sessionId: string,
  screenAgentId: string,
  organizationId: string,
  pageUrl: string,
  pageTitle?: string,
  viewerEmail?: string
): Promise<IAnalyticsEvent> {
  return trackEvent({
    sessionId,
    screenAgentId,
    organizationId,
    eventType: "page_navigation",
    eventData: {
      destinationUrl: pageUrl,
      sourceUrl: "", // Can be enhanced to track previous URL
      navigationTrigger: "agent_action", // Can be enhanced
    },
    viewerEmail,
  })
}

/**
 * Track session start
 */
export async function trackSessionStart(
  sessionId: string,
  screenAgentId: string,
  organizationId: string,
  viewerEmail?: string
): Promise<IAnalyticsEvent> {
  return trackEvent({
    sessionId,
    screenAgentId,
    organizationId,
    eventType: "session_milestone",
    eventData: {
      milestoneType: "started",
    },
    viewerEmail,
  })
}

/**
 * Track session end
 */
export async function trackSessionEnd(
  sessionId: string,
  screenAgentId: string,
  organizationId: string,
  durationMinutes?: number,
  viewerEmail?: string
): Promise<IAnalyticsEvent> {
  return trackEvent({
    sessionId,
    screenAgentId,
    organizationId,
    eventType: "session_milestone",
    eventData: {
      milestoneType: "completed",
      timeToMilestoneSeconds: durationMinutes ? durationMinutes * 60 : undefined,
    },
    viewerEmail,
  })
}

/**
 * Track session completion
 */
export async function trackSessionCompletion(
  sessionId: string,
  screenAgentId: string,
  organizationId: string,
  completionRate?: number,
  viewerEmail?: string
): Promise<IAnalyticsEvent> {
  return trackEvent({
    sessionId,
    screenAgentId,
    organizationId,
    eventType: "session_milestone",
    eventData: {
      milestoneType: "completed",
      viewerEngagementLevel: completionRate ? Math.round(completionRate * 100) : undefined,
    },
    viewerEmail,
  })
}

/**
 * Track engagement score
 */
export async function trackEngagementScore(
  sessionId: string,
  screenAgentId: string,
  organizationId: string,
  score: number,
  viewerEmail?: string
): Promise<IAnalyticsEvent> {
  return trackEvent({
    sessionId,
    screenAgentId,
    organizationId,
    eventType: "session_milestone",
    eventData: {
      milestoneType: "completed",
      viewerEngagementLevel: score,
    },
    viewerEmail,
  })
}
