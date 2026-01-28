/**
 * Ingestion Pipeline Types
 *
 * Types for the unified document ingestion pipeline.
 */

import { z } from "zod"

// =============================================================================
// Supported Document Types
// =============================================================================

export type DocumentType =
  | "pdf"
  | "docx"
  | "doc"
  | "markdown"
  | "text"
  | "html"
  | "json"
  | "csv"
  | "url"
  | "audio"
  | "video"
  | "unknown"

/** File extension to document type mapping */
export const EXTENSION_TO_TYPE: Record<string, DocumentType> = {
  // PDFs
  pdf: "pdf",

  // Word documents
  docx: "docx",
  doc: "doc",

  // Markdown
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",

  // Plain text
  txt: "text",
  text: "text",
  log: "text",
  ini: "text",
  cfg: "text",
  conf: "text",
  env: "text",

  // HTML
  html: "html",
  htm: "html",
  xhtml: "html",

  // Data formats
  json: "json",
  csv: "csv",
  tsv: "csv",
  xml: "text",
  yaml: "text",
  yml: "text",

  // Audio
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  flac: "audio",
  aac: "audio",

  // Video
  mp4: "video",
  webm: "video",
  mov: "video",
  avi: "video",
  mkv: "video",
}

/** MIME type to document type mapping */
export const MIME_TO_TYPE: Record<string, DocumentType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/json": "json",
  "text/csv": "csv",
  "text/tab-separated-values": "csv",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/mp4": "audio",
  "audio/ogg": "audio",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
}

// =============================================================================
// Ingestion Source Types
// =============================================================================

export type IngestionSourceType =
  | "file"      // Local file or file upload
  | "url"       // Single URL
  | "sitemap"   // Sitemap-based crawl
  | "spider"    // Spider crawl
  | "buffer"    // Raw buffer/content

export interface IngestionSource {
  /** Source type */
  type: IngestionSourceType
  /** URL, file path, or identifier */
  location: string
  /** File name (for uploads) */
  fileName?: string
  /** MIME type (if known) */
  mimeType?: string
  /** Raw content (for buffer type) */
  content?: Buffer | string
}

// =============================================================================
// Ingestion Options
// =============================================================================

export interface IngestionOptions {
  /** Override detected document type */
  forceType?: DocumentType
  /** Maximum content length to process */
  maxLength?: number
  /** Generate embeddings */
  generateEmbeddings?: boolean
  /** Chunk configuration */
  chunking?: {
    /** Enable chunking */
    enabled: boolean
    /** Chunk size in characters */
    chunkSize: number
    /** Chunk overlap in characters */
    chunkOverlap: number
  }
  /** Crawler options (for URL sources) */
  crawler?: {
    /** Crawl strategy */
    strategy: "single" | "sitemap" | "spider"
    /** Maximum pages */
    maxPages?: number
    /** Maximum depth (for spider) */
    maxDepth?: number
  }
  /** Metadata to attach to ingested content */
  metadata?: Record<string, unknown>
}

export const ingestionOptionsSchema = z.object({
  forceType: z.enum([
    "pdf", "docx", "doc", "markdown", "text", "html", "json", "csv", "url", "audio", "video", "unknown"
  ]).optional(),
  maxLength: z.number().min(1).optional(),
  generateEmbeddings: z.boolean().optional().default(true),
  chunking: z.object({
    enabled: z.boolean(),
    chunkSize: z.number().min(100).max(10000),
    chunkOverlap: z.number().min(0).max(1000),
  }).optional(),
  crawler: z.object({
    strategy: z.enum(["single", "sitemap", "spider"]),
    maxPages: z.number().min(1).max(1000).optional(),
    maxDepth: z.number().min(1).max(5).optional(),
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// =============================================================================
// Ingestion Results
// =============================================================================

export interface IngestedChunk {
  /** Chunk index */
  index: number
  /** Chunk text content */
  text: string
  /** Chunk start position in original content */
  startPos: number
  /** Chunk end position */
  endPos: number
  /** Embedding vector (if generated) */
  embedding?: number[]
}

export interface IngestedDocument {
  /** Document ID (generated) */
  id: string
  /** Source URL or file path */
  source: string
  /** Document type */
  type: DocumentType
  /** Document title */
  title?: string
  /** Full text content */
  text: string
  /** Markdown content (if applicable) */
  markdown?: string
  /** Content chunks */
  chunks: IngestedChunk[]
  /** Document metadata */
  metadata: {
    /** Word count */
    wordCount: number
    /** Character count */
    charCount: number
    /** Page count (for PDFs) */
    pageCount?: number
    /** Author */
    author?: string
    /** Description */
    description?: string
    /** Language */
    language?: string
    /** Custom metadata */
    custom?: Record<string, unknown>
  }
  /** Ingestion timestamp */
  ingestedAt: Date
  /** Processing duration in ms */
  processingMs: number
}

export interface IngestionResult {
  /** Successfully ingested documents */
  documents: IngestedDocument[]
  /** Failed sources */
  failures: Array<{
    source: string
    error: string
  }>
  /** Total sources processed */
  totalProcessed: number
  /** Total successful */
  totalSuccess: number
  /** Total failed */
  totalFailed: number
  /** Total processing time in ms */
  totalProcessingMs: number
}

// =============================================================================
// Progress Tracking
// =============================================================================

export interface IngestionProgress {
  /** Current status */
  status: "pending" | "processing" | "completed" | "failed"
  /** Progress percentage (0-100) */
  progress: number
  /** Current item being processed */
  currentItem?: string
  /** Items completed */
  completed: number
  /** Total items */
  total: number
  /** Error message (if failed) */
  error?: string
}

export type IngestionProgressCallback = (progress: IngestionProgress) => void
