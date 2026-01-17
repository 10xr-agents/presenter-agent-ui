import mongoose, { Schema } from "mongoose"

export type KnowledgeSourceType = "documentation" | "website" | "video" | "file"
export type KnowledgeStatus = "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"

export interface IKnowledgeSource extends mongoose.Document {
  organizationId: string
  
  // Source identification
  sourceType: KnowledgeSourceType
  sourceUrl?: string // For URL-based sources (documentation, website, video)
  sourceName: string // Human-readable name
  fileName?: string // For file uploads
  fileSize?: number // For file uploads
  fileType?: string // MIME type for file uploads
  
  // Job tracking (new knowledge extraction API)
  jobId: string | null // Job ID from Knowledge Extraction Service
  workflowId: string | null // Temporal workflow ID
  status: KnowledgeStatus
  
  // Sync history - tracks all sync runs (initial + resyncs)
  syncHistory?: Array<{
    jobId: string
    workflowId?: string
    status: KnowledgeStatus
    triggerType: "initial" | "resync"
    startedAt: Date
    completedAt?: Date
    phase?: string // Workflow phase
    progress?: number // 0-100
    errorMessages?: string[] // Renamed from 'errors' to avoid Mongoose reserved pathname
    warnings?: string[]
  }>
  
  // Authentication credentials (for website sources)
  websiteCredentials?: {
    username: string
    password: string // Encrypted before storage
  }
  
  // Configuration options (source-type specific)
  options?: {
    // Website options
    maxPages?: number
    maxDepth?: number
    strategy?: "BFS" | "DFS"
    includePaths?: string[]
    excludePaths?: string[]
    // Documentation options
    extractCodeBlocks?: boolean
    // Video options
    extractThumbnails?: boolean
  }
  
  // Results summary
  pagesStored?: number
  linksStored?: number
  screensExtracted?: number
  tasksExtracted?: number
  externalLinksDetected?: number
  
  // Error tracking
  extractionErrors?: Array<{
    message: string
    phase?: string
    timestamp?: Date
  }>
  
  // Metadata
  name?: string // User-friendly name
  description?: string
  tags?: string[]
  
  // Usage tracking
  timesReferenced: number
  lastReferencedAt?: Date
  
  // Timestamps
  startedAt?: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const KnowledgeSourceSchema = new Schema<IKnowledgeSource>(
  {
    organizationId: { type: String, required: true, index: true },
    
    // Source identification
    sourceType: {
      type: String,
      enum: ["documentation", "website", "video", "file"],
      required: true,
      index: true,
    },
    sourceUrl: String,
    sourceName: { type: String, required: true },
    fileName: String,
    fileSize: Number,
    fileType: String,
    
    // Job tracking
    jobId: { type: String, default: null, index: true },
    workflowId: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "queued", "running", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    
    // Sync history
    syncHistory: [
      {
        jobId: { type: String, required: true },
        workflowId: String,
        status: {
          type: String,
          enum: ["pending", "queued", "running", "completed", "failed", "cancelled"],
          required: true,
        },
        triggerType: {
          type: String,
          enum: ["initial", "resync"],
          required: true,
        },
        startedAt: { type: Date, required: true },
        completedAt: Date,
        phase: String,
        progress: Number,
        errorMessages: [String], // Renamed from 'errors' to avoid Mongoose reserved pathname
        warnings: [String],
      },
    ],
    
    // Authentication credentials
    websiteCredentials: {
      username: String,
      password: String,
    },
    
    // Configuration options
    options: {
      maxPages: Number,
      maxDepth: Number,
      strategy: { type: String, enum: ["BFS", "DFS"] },
      includePaths: [String],
      excludePaths: [String],
      extractCodeBlocks: Boolean,
      extractThumbnails: Boolean,
    },
    
    // Results summary
    pagesStored: { type: Number, default: 0 },
    linksStored: { type: Number, default: 0 },
    screensExtracted: { type: Number, default: 0 },
    tasksExtracted: { type: Number, default: 0 },
    externalLinksDetected: { type: Number, default: 0 },
    
    // Error tracking
    extractionErrors: [
      {
        message: String,
        phase: String,
        timestamp: Date,
      },
    ],
    
    // Metadata
    name: String,
    description: String,
    tags: [String],
    
    // Usage tracking
    timesReferenced: { type: Number, default: 0 },
    lastReferencedAt: Date,
    
    // Timestamps
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
)

// Indexes for efficient queries
KnowledgeSourceSchema.index({ organizationId: 1, status: 1 })
KnowledgeSourceSchema.index({ organizationId: 1, sourceType: 1 })
KnowledgeSourceSchema.index({ organizationId: 1, createdAt: -1 })
KnowledgeSourceSchema.index({ sourceUrl: 1, sourceType: 1 }) // For finding existing knowledge by URL

export const KnowledgeSource =
  mongoose.models.KnowledgeSource ||
  mongoose.model<IKnowledgeSource>("KnowledgeSource", KnowledgeSourceSchema)

/**
 * Extract domain from URL for matching/reuse (website sources only)
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, "") // Remove www. prefix
  } catch {
    return url
  }
}
