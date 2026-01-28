/**
 * Ingestion Module Exports
 *
 * Unified document ingestion pipeline.
 */

// Types
export type {
  DocumentType,
  IngestionSourceType,
  IngestionSource,
  IngestionOptions,
  IngestedChunk,
  IngestedDocument,
  IngestionResult,
  IngestionProgress,
  IngestionProgressCallback,
} from "./types"

export {
  ingestionOptionsSchema,
  EXTENSION_TO_TYPE,
  MIME_TO_TYPE,
} from "./types"

// Chunker
export {
  chunkText,
  chunkByParagraphs,
  chunkMarkdown,
  type ChunkingConfig,
  type TextChunk,
} from "./chunker"

// Pipeline
export {
  detectDocumentType,
  ingestDocuments,
  ingestSingleDocument,
  ingestUrl,
  ingestDocumentationSite,
  ingestFile,
} from "./pipeline"
