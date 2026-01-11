import mongoose, { Schema } from "mongoose"

export type KnowledgeDocumentType = "pdf" | "video" | "audio" | "text" | "url"
export type KnowledgeDocumentStatus = "pending" | "processing" | "ready" | "failed"

export interface IKnowledgeDocument extends mongoose.Document {
  screenAgentId: string
  documentType: KnowledgeDocumentType
  originalFilename: string
  storageLocation: string // S3, Azure Blob, etc. reference
  fileSizeBytes: number
  status: KnowledgeDocumentStatus
  processingError?: string
  
  // Processed data
  extractedTextContent?: string
  embeddingVectors?: number[][] // Vector embeddings for semantic search
  summary?: string
  keyTopics?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extractedMetadata?: Record<string, any>
  
  // Usage tracking
  timesReferenced: number
  relevanceScore?: number // How often it provides useful context
  
  createdAt: Date
  updatedAt: Date
}

const KnowledgeDocumentSchema = new Schema<IKnowledgeDocument>(
  {
    screenAgentId: { type: String, required: true, index: true },
    documentType: {
      type: String,
      enum: ["pdf", "video", "audio", "text", "url"],
      required: true,
      index: true,
    },
    originalFilename: { type: String, required: true },
    storageLocation: { type: String, required: true },
    fileSizeBytes: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "ready", "failed"],
      default: "pending",
    },
    processingError: String,
    
    // Processed data
    extractedTextContent: String,
    embeddingVectors: [[Number]],
    summary: String,
    keyTopics: [String],
    extractedMetadata: Schema.Types.Mixed,
    
    // Usage tracking
    timesReferenced: { type: Number, default: 0 },
    relevanceScore: { type: Number, min: 0, max: 100 },
  },
  { timestamps: true }
)

// Indexes for efficient queries
KnowledgeDocumentSchema.index({ screenAgentId: 1, status: 1 })
KnowledgeDocumentSchema.index({ screenAgentId: 1, createdAt: -1 })
KnowledgeDocumentSchema.index({ status: 1 })

export const KnowledgeDocument =
  mongoose.models.KnowledgeDocument ||
  mongoose.model<IKnowledgeDocument>("KnowledgeDocument", KnowledgeDocumentSchema)
