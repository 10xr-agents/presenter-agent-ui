import mongoose, { Schema } from "mongoose"

export type RecordingStatus = "pending" | "processing" | "ready" | "failed"
export type AnalysisStatus = "pending" | "processing" | "completed" | "failed"

export interface ISessionRecording extends Omit<mongoose.Document, "model"> {
  presentationSessionId: string
  screenAgentId: string
  organizationId: string

  // Recording metadata
  recordingUrl: string // S3, Azure Blob, etc. URL
  recordingDurationSeconds: number
  fileSizeBytes: number
  recordingFormat: "mp4" | "webm"
  status: RecordingStatus
  recordingError?: string

  // Analysis results
  analysisStatus: AnalysisStatus
  analysisJobId?: string // BullMQ job ID
  analysisError?: string

  // Clustered questions (AI-generated)
  clusteredQuestions?: Array<{
    question: string
    count: number
    sessions: string[]
    topic?: string
  }>

  // Extracted topics (AI-generated)
  extractedTopics?: string[]

  // Insights (AI-generated summary)
  insights?: {
    summary: string
    keyFindings: string[]
    recommendations?: string[]
  }

  // Processing timestamps
  recordedAt: Date
  processedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const SessionRecordingSchema = new Schema<ISessionRecording>(
  {
    presentationSessionId: { type: String, required: true, unique: true, index: true },
    screenAgentId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },

    // Recording metadata
    recordingUrl: { type: String, required: true },
    recordingDurationSeconds: { type: Number, required: true },
    fileSizeBytes: { type: Number, required: true },
    recordingFormat: { type: String, enum: ["mp4", "webm"], default: "mp4" },
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
      index: true,
    },
    recordingError: String,

    // Analysis results
    analysisStatus: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    analysisJobId: String,
    analysisError: String,

    // Clustered questions
    clusteredQuestions: [
      {
        question: String,
        count: Number,
        sessions: [String],
        topic: String,
      },
    ],

    // Extracted topics
    extractedTopics: [String],

    // Insights
    insights: {
      summary: String,
      keyFindings: [String],
      recommendations: [String],
    },

    // Processing timestamps
    recordedAt: { type: Date, required: true, index: true },
    processedAt: Date,
  },
  { timestamps: true }
)

// Indexes for efficient queries
SessionRecordingSchema.index({ screenAgentId: 1, status: 1 })
SessionRecordingSchema.index({ organizationId: 1, analysisStatus: 1 })
SessionRecordingSchema.index({ recordedAt: -1 })

export const SessionRecording =
  mongoose.models.SessionRecording ||
  mongoose.model<ISessionRecording>("SessionRecording", SessionRecordingSchema)
