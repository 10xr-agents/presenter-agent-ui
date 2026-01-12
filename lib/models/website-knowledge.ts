import mongoose, { Schema } from "mongoose"

export type WebsiteKnowledgeStatus = "pending" | "exploring" | "completed" | "failed" | "cancelled"

export interface IWebsiteKnowledge extends mongoose.Document {
  organizationId: string
  websiteUrl: string
  websiteDomain: string // Extracted domain for matching/reuse
  
  // Exploration job tracking
  explorationJobId: string | null // Current/latest Job ID from Browser Automation Service
  status: WebsiteKnowledgeStatus // Current/latest status
  
  // Sync history - tracks all sync runs (initial + resyncs)
  syncHistory?: Array<{
    jobId: string // Exploration job ID for this sync run
    status: WebsiteKnowledgeStatus
    triggerType: "initial" | "resync"
    startedAt: Date
    completedAt?: Date
    pagesProcessed?: number
    linksProcessed?: number
    errorCount?: number
  }>
  
  // Authentication credentials (encrypted at application layer)
  websiteCredentials?: {
    username: string
    password: string // Encrypted before storage
  }
  
  // Exploration configuration
  maxPages?: number
  maxDepth?: number
  strategy?: "BFS" | "DFS"
  includePaths?: string[] // Path patterns to include (e.g., ["/docs/*"])
  excludePaths?: string[] // Path patterns to exclude (e.g., ["/admin/*", "/api/*"])
  
  // Results summary
  pagesStored?: number
  linksStored?: number
  externalLinksDetected?: number
  
  // Error tracking
  explorationErrors?: Array<{
    url: string
    error: string
    error_type?: "network" | "timeout" | "http_4xx" | "http_5xx" | "parsing" | "other"
    retry_count?: number
    last_attempted_at?: string
  }>
  
  // Metadata
  name?: string // User-friendly name (e.g., "Example.com - Main Site")
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

const WebsiteKnowledgeSchema = new Schema<IWebsiteKnowledge>(
  {
    organizationId: { type: String, required: true, index: true },
    websiteUrl: { type: String, required: true },
    websiteDomain: { type: String, required: true, index: true },
    
    // Exploration job tracking
    explorationJobId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ["pending", "exploring", "completed", "failed", "cancelled"],
      default: "pending",
      index: true,
    },
    
    // Sync history - tracks all sync runs
    syncHistory: [
      {
        jobId: { type: String, required: true },
        status: {
          type: String,
          enum: ["pending", "exploring", "completed", "failed", "cancelled"],
          required: true,
        },
        triggerType: {
          type: String,
          enum: ["initial", "resync"],
          required: true,
        },
        startedAt: { type: Date, required: true },
        completedAt: Date,
        pagesProcessed: Number,
        linksProcessed: Number,
        errorCount: Number,
      },
    ],
    
    // Authentication credentials (encrypted at application layer)
    websiteCredentials: {
      username: String,
      password: String, // Encrypted before storage
    },
    
    // Exploration configuration
    maxPages: { type: Number, min: 1, default: 100 },
    maxDepth: { type: Number, min: 1, max: 20, default: 10 },
    strategy: { type: String, enum: ["BFS", "DFS"], default: "BFS" },
    includePaths: [String], // Path patterns to include
    excludePaths: [String], // Path patterns to exclude
    
    // Results summary
    pagesStored: { type: Number, default: 0 },
    linksStored: { type: Number, default: 0 },
    externalLinksDetected: { type: Number, default: 0 },
    
    // Error tracking
    explorationErrors: [
      {
        url: String,
        error: String,
        error_type: String,
        retry_count: Number,
        last_attempted_at: String,
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
WebsiteKnowledgeSchema.index({ organizationId: 1, status: 1 })
WebsiteKnowledgeSchema.index({ organizationId: 1, websiteDomain: 1 })
WebsiteKnowledgeSchema.index({ organizationId: 1, createdAt: -1 })
WebsiteKnowledgeSchema.index({ websiteDomain: 1, status: 1 }) // For finding existing knowledge by domain

export const WebsiteKnowledge =
  mongoose.models.WebsiteKnowledge ||
  mongoose.model<IWebsiteKnowledge>("WebsiteKnowledge", WebsiteKnowledgeSchema)

/**
 * Extract domain from URL for matching/reuse
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, "") // Remove www. prefix
  } catch {
    return url
  }
}
