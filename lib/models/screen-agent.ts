import mongoose, { Schema } from "mongoose"

export type ScreenAgentStatus = "draft" | "active" | "paused" | "archived"
export type ScreenAgentVisibility = "private" | "team" | "organization" | "public"

export interface IVoiceConfig {
  provider: "elevenlabs" | "openai" | "cartesia"
  voiceId: string
  language: string
  speechRate?: number
  pitch?: number
}

export interface IConversationConfig {
  personalityPrompt?: string
  welcomeMessage?: string
  fallbackResponse?: string
  guardrails?: string[]
}

export interface IWebsiteCredentials {
  username: string
  password: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionTokens?: Record<string, any>
}

export interface IScreenAgent extends mongoose.Document {
  name: string
  description?: string
  ownerId: string // User who created it
  organizationId: string
  teamId?: string // Optional, Enterprise only
  visibility: ScreenAgentVisibility
  status: ScreenAgentStatus
  
  // Configuration
  targetWebsiteUrl: string
  websiteCredentials?: IWebsiteCredentials // Encrypted
  voiceConfig: IVoiceConfig
  conversationConfig?: IConversationConfig
  knowledgeDocumentIds: string[]
  domainRestrictions?: string[]
  sessionTimeoutMinutes?: number
  maxSessionDurationMinutes?: number
  rateLimitConfig?: {
    maxSessionsPerViewer?: number
    cooldownMinutes?: number
  }
  
  // Presentation Settings
  customBranding?: {
    logo?: string
    colors?: {
      primary?: string
      secondary?: string
    }
    companyName?: string
  }
  viewerAuthRequired: boolean // Email-based if true
  dataCollectionConsent: boolean
  recordingEnabled: boolean
  preSessionQuestions?: Array<{
    question: string
    required: boolean
  }>
  postSessionSurvey?: Array<{
    question: string
    type: "rating" | "text" | "multiple_choice"
    options?: string[]
  }>
  
  // Sharing
  shareableToken: string // Unique token for shareable link
  linkExpirationDate?: Date
  linkMaxUses?: number
  linkUseCount: number
  
  // Analytics (aggregated)
  totalPresentationCount: number
  totalViewerCount: number
  totalMinutesConsumed: number
  averageSessionDuration: number
  completionRate: number
  viewerSatisfactionScore?: number
  
  // Timestamps
  lastActivatedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const ScreenAgentSchema = new Schema<IScreenAgent>(
  {
    name: { type: String, required: true, index: true },
    description: { type: String },
    ownerId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true },
    teamId: { type: String, index: true },
    visibility: {
      type: String,
      enum: ["private", "team", "organization", "public"],
      default: "private",
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "archived"],
      default: "draft",
      index: true,
    },
    
    // Configuration
    targetWebsiteUrl: { type: String, required: true },
    websiteCredentials: {
      username: String,
      password: String, // Will be encrypted in application layer
      sessionTokens: Schema.Types.Mixed,
    },
    voiceConfig: {
      provider: {
        type: String,
        enum: ["elevenlabs", "openai", "cartesia"],
        required: true,
      },
      voiceId: { type: String, required: true },
      language: { type: String, required: true },
      speechRate: { type: Number, min: 0.5, max: 2.0, default: 1.0 },
      pitch: { type: Number, min: -1.0, max: 1.0, default: 0 },
    },
    conversationConfig: {
      personalityPrompt: String,
      welcomeMessage: String,
      fallbackResponse: String,
      guardrails: [String],
    },
    knowledgeDocumentIds: [{ type: String }],
    domainRestrictions: [String],
    sessionTimeoutMinutes: { type: Number, default: 60 },
    maxSessionDurationMinutes: { type: Number, default: 120 },
    rateLimitConfig: {
      maxSessionsPerViewer: { type: Number, default: 10 },
      cooldownMinutes: { type: Number, default: 60 },
    },
    
    // Presentation Settings
    customBranding: {
      logo: String,
      colors: {
        primary: String,
        secondary: String,
      },
      companyName: String,
    },
    viewerAuthRequired: { type: Boolean, default: false },
    dataCollectionConsent: { type: Boolean, default: false },
    recordingEnabled: { type: Boolean, default: true },
    preSessionQuestions: [
      {
        question: String,
        required: Boolean,
      },
    ],
    postSessionSurvey: [
      {
        question: String,
        type: {
          type: String,
          enum: ["rating", "text", "multiple_choice"],
        },
        options: [String],
      },
    ],
    
    // Sharing
    shareableToken: { type: String, required: true, unique: true },
    linkExpirationDate: Date,
    linkMaxUses: Number,
    linkUseCount: { type: Number, default: 0 },
    
    // Analytics (aggregated)
    totalPresentationCount: { type: Number, default: 0 },
    totalViewerCount: { type: Number, default: 0 },
    totalMinutesConsumed: { type: Number, default: 0 },
    averageSessionDuration: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0, min: 0, max: 100 },
    viewerSatisfactionScore: { type: Number, min: 0, max: 5 },
    
    lastActivatedAt: Date,
  },
  { timestamps: true }
)

// Indexes for efficient queries
ScreenAgentSchema.index({ organizationId: 1, status: 1 })
ScreenAgentSchema.index({ organizationId: 1, createdAt: -1 })
ScreenAgentSchema.index({ ownerId: 1, status: 1 })
ScreenAgentSchema.index({ teamId: 1, status: 1 })
// shareableToken index is automatically created by unique: true

export const ScreenAgent =
  mongoose.models.ScreenAgent ||
  mongoose.model<IScreenAgent>("ScreenAgent", ScreenAgentSchema)
