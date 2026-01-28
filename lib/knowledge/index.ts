/**
 * Knowledge Module Exports
 *
 * Unified exports for document extraction, crawling, and ingestion.
 */

// =============================================================================
// Extractors
// =============================================================================

export {
  extractPdfText,
  extractPdfTextByPage,
  type PdfExtractionResult,
} from "./extractors/pdf-extractor"

export {
  extractDocxText,
  extractDocxImages,
  type DocxExtractionResult,
  type DocxExtractionOptions,
} from "./extractors/docx-extractor"

export {
  extractMarkdownText,
  type MarkdownExtractionResult,
  type MarkdownExtractionOptions,
} from "./extractors/markdown-extractor"

export {
  extractTextContent,
  extractJsonText,
  extractCsvText,
  type TextExtractionResult,
  type TextExtractionOptions,
} from "./extractors/text-extractor"

export {
  extractHtmlContent,
  extractHtmlText,
  htmlToMarkdown,
  type HtmlExtractionResult,
  type HtmlExtractionOptions,
} from "./extractors/html-extractor"

// Audio/Video (re-export existing)
export { transcribeAudio } from "./extractors/audio-extractor"
export { transcribeVideo } from "./extractors/video-extractor"

// =============================================================================
// Crawler
// =============================================================================

export {
  // Types
  type CrawlStrategy,
  type CrawlConfig,
  type CrawledPage,
  type CrawlResult,
  type CrawlProgress,
  type CrawlProgressCallback,
  type SitemapEntry,
  type SitemapResult,
  crawlConfigSchema,
  DEFAULT_EXCLUDE_PATTERNS,
  DOCS_INCLUDE_PATTERNS,
  // Sitemap
  discoverSitemap,
  parseSitemap,
  fetchAllSitemapUrls,
  filterDocsUrls,
  // Crawler
  crawlWebsite,
  crawlSinglePage,
  crawlDocumentation,
  spiderWebsite,
} from "./crawler"

// =============================================================================
// Ingestion Pipeline
// =============================================================================

export {
  // Types
  type DocumentType,
  type IngestionSourceType,
  type IngestionSource,
  type IngestionOptions,
  type IngestedChunk,
  type IngestedDocument,
  type IngestionResult,
  type IngestionProgress,
  type IngestionProgressCallback,
  ingestionOptionsSchema,
  EXTENSION_TO_TYPE,
  MIME_TO_TYPE,
  // Chunker
  chunkText,
  chunkByParagraphs,
  chunkMarkdown,
  type ChunkingConfig,
  type TextChunk,
  // Pipeline
  detectDocumentType,
  ingestDocuments,
  ingestSingleDocument,
  ingestUrl,
  ingestDocumentationSite,
  ingestFile,
} from "./ingestion"

// =============================================================================
// Embeddings
// =============================================================================

export { generateEmbeddings } from "./embeddings"

// =============================================================================
// Processor (Legacy)
// =============================================================================

export { processKnowledgeDocument, type ProcessingResult } from "./processor"
