import mongoose, { Schema } from "mongoose"

export type SessionCompletionStatus = "completed" | "abandoned" | "error"
export type ViewerSentiment = "positive" | "neutral" | "negative"

export interface IViewerInfo {
  name?: string
  email?: string
  company?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customFields?: Record<string, any>
}

export interface IPresentationSession extends mongoose.Document {
  screenAgentId: string
  sessionToken: string // Unique token per session
  viewerInfo?: IViewerInfo
  
  // Session timing
  startedAt: Date
  endedAt?: Date
  durationSeconds: number
  
  // LiveKit integration
  liveKitRoomId: string
  
  // Recording and transcription
  recordingReference?: string
  transcriptReference?: string
  
  // Interaction metrics
  totalQuestionsAsked: number
  questions: Array<{
    question: string
    timestamp: Date
    responseQuality?: number
  }>
  pagesVisited: string[]
  navigationEventCount: number
  interruptionCount: number
  viewerEngagementScore?: number
  agentResponseQualityScore?: number
  
  // Session outcomes
  completionStatus: SessionCompletionStatus
  exitReason?: string
  postSessionSurveyResponses?: Array<{
    question: string
    response: string | number
  }>
  viewerSentiment?: ViewerSentiment
  followUpActionTaken?: string
  
  // Technical details
  browserUserAgent?: string
  ipAddress?: string // Anonymized
  geographicLocation?: {
    country?: string
    region?: string
  }
  referralSource?: string
  deviceType?: "desktop" | "mobile" | "tablet"
  
  createdAt: Date
  updatedAt: Date
}

const PresentationSessionSchema = new Schema<IPresentationSession>(
  {
    screenAgentId: { type: String, required: true, index: true },
    sessionToken: { type: String, required: true, unique: true },
    viewerInfo: {
      name: String,
      email: String,
      company: String,
      customFields: Schema.Types.Mixed,
    },
    
    // Session timing
    startedAt: { type: Date, required: true, index: true },
    endedAt: Date,
    durationSeconds: { type: Number, default: 0, index: true },
    
    // LiveKit integration
    liveKitRoomId: { type: String, required: true, index: true },
    
    // Recording and transcription
    recordingReference: String,
    transcriptReference: String,
    
    // Interaction metrics
    totalQuestionsAsked: { type: Number, default: 0 },
    questions: [
      {
        question: String,
        timestamp: Date,
        responseQuality: Number,
      },
    ],
    pagesVisited: [String],
    navigationEventCount: { type: Number, default: 0 },
    interruptionCount: { type: Number, default: 0 },
    viewerEngagementScore: { type: Number, min: 0, max: 100 },
    agentResponseQualityScore: { type: Number, min: 0, max: 100 },
    
    // Session outcomes
    completionStatus: {
      type: String,
      enum: ["completed", "abandoned", "error"],
      default: "abandoned",
      index: true,
    },
    exitReason: String,
    postSessionSurveyResponses: [
      {
        question: String,
        response: Schema.Types.Mixed,
      },
    ],
    viewerSentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
    },
    followUpActionTaken: String,
    
    // Technical details
    browserUserAgent: String,
    ipAddress: String,
    geographicLocation: {
      country: String,
      region: String,
    },
    referralSource: String,
    deviceType: {
      type: String,
      enum: ["desktop", "mobile", "tablet"],
    },
  },
  { timestamps: true }
)

// Indexes for efficient queries
PresentationSessionSchema.index({ screenAgentId: 1, startedAt: -1 })
PresentationSessionSchema.index({ screenAgentId: 1, completionStatus: 1 })
PresentationSessionSchema.index({ startedAt: -1 })
// sessionToken index is automatically created by unique: true
PresentationSessionSchema.index({ "viewerInfo.email": 1 })

export const PresentationSession =
  mongoose.models.PresentationSession ||
  mongoose.model<IPresentationSession>("PresentationSession", PresentationSessionSchema)
