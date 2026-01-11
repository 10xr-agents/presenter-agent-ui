import mongoose, { Schema } from "mongoose"

export type AnalyticsEventType = "viewer_question" | "page_navigation" | "agent_response" | "session_milestone"

export interface IViewerQuestionEvent {
  questionText: string
  questionCategory?: string // AI-classified
  agentResponseQuality?: number
  responseTimeMs?: number
  contextUrl?: string
}

export interface IPageNavigationEvent {
  sourceUrl: string
  destinationUrl: string
  navigationTrigger: "agent_action" | "viewer_request"
  timeSpentOnPreviousPageSeconds?: number
}

export interface IAgentResponseEvent {
  responseText: string
  responseIntent?: string // AI-classified
  confidenceScore?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alternativeResponsesConsidered?: any[]
}

export interface ISessionMilestoneEvent {
  milestoneType: "started" | "25_complete" | "50_complete" | "75_complete" | "completed"
  timeToMilestoneSeconds?: number
  viewerEngagementLevel?: number
}

export interface IAnalyticsEvent extends mongoose.Document {
  organizationId: string
  screenAgentId: string
  presentationSessionId: string
  eventType: AnalyticsEventType
  eventTimestamp: Date
  
  // Event-specific properties (flexible JSON)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>
  
  createdAt: Date
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    organizationId: { type: String, required: true },
    screenAgentId: { type: String, required: true, index: true },
    presentationSessionId: { type: String, required: true, index: true },
    eventType: {
      type: String,
      enum: ["viewer_question", "page_navigation", "agent_response", "session_milestone"],
      required: true,
      index: true,
    },
    eventTimestamp: { type: Date, required: true, index: true, default: Date.now },
    
    // Event-specific properties (flexible JSON)
    properties: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
)

// Indexes for efficient queries
AnalyticsEventSchema.index({ screenAgentId: 1, eventTimestamp: -1 })
AnalyticsEventSchema.index({ presentationSessionId: 1, eventTimestamp: -1 })
AnalyticsEventSchema.index({ organizationId: 1, eventType: 1, eventTimestamp: -1 })
AnalyticsEventSchema.index({ eventTimestamp: -1 }) // For aggregation queries

export const AnalyticsEvent =
  mongoose.models.AnalyticsEvent ||
  mongoose.model<IAnalyticsEvent>("AnalyticsEvent", AnalyticsEventSchema)
