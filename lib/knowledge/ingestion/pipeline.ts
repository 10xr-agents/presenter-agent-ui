/**
 * Unified Ingestion Pipeline
 *
 * Routes documents to appropriate extractors and processes them
 * into chunks ready for embedding and storage.
 */

import * as Sentry from "@sentry/nextjs"
import { v4 as uuidv4 } from "uuid"
import { chunkByParagraphs, chunkMarkdown, chunkText } from "./chunker"
import {
  type DocumentType,
  EXTENSION_TO_TYPE,
  type IngestedChunk,
  type IngestedDocument,
  type IngestionOptions,
  type IngestionProgressCallback,
  type IngestionResult,
  type IngestionSource,
  MIME_TO_TYPE,
} from "./types"
import { crawlSinglePage, crawlWebsite } from "../crawler"
import { generateEmbeddings } from "../embeddings"
import { transcribeAudio } from "../extractors/audio-extractor"
import { extractDocxText } from "../extractors/docx-extractor"
import { extractHtmlContent, htmlToMarkdown } from "../extractors/html-extractor"
import { extractMarkdownText } from "../extractors/markdown-extractor"
import { extractPdfText } from "../extractors/pdf-extractor"
import { extractCsvText, extractJsonText, extractTextContent } from "../extractors/text-extractor"
import { transcribeVideo } from "../extractors/video-extractor"

// =============================================================================
// Document Type Detection
// =============================================================================

/**
 * Detect document type from source information
 */
export function detectDocumentType(source: IngestionSource): DocumentType {
  // Check MIME type first
  if (source.mimeType) {
    const typeFromMime = MIME_TO_TYPE[source.mimeType]
    if (typeFromMime) {
      return typeFromMime
    }
  }

  // Check file extension
  const fileName = source.fileName || source.location
  const ext = fileName.split(".").pop()?.toLowerCase()

  if (ext) {
    const typeFromExt = EXTENSION_TO_TYPE[ext]
    if (typeFromExt) {
      return typeFromExt
    }
  }

  // Check if URL
  if (source.type === "url" || source.location.startsWith("http")) {
    return "url"
  }

  return "unknown"
}

// =============================================================================
// Main Ingestion Pipeline
// =============================================================================

/**
 * Ingest documents from various sources
 *
 * This is the main entry point for the ingestion pipeline.
 */
export async function ingestDocuments(
  sources: IngestionSource[],
  options: IngestionOptions = {},
  onProgress?: IngestionProgressCallback
): Promise<IngestionResult> {
  const startTime = Date.now()
  const result: IngestionResult = {
    documents: [],
    failures: [],
    totalProcessed: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalProcessingMs: 0,
  }

  const total = sources.length

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    if (!source) continue

    // Update progress
    if (onProgress) {
      onProgress({
        status: "processing",
        progress: Math.round((i / total) * 100),
        currentItem: source.location,
        completed: i,
        total,
      })
    }

    try {
      const doc = await ingestSingleDocument(source, options)
      result.documents.push(doc)
      result.totalSuccess++
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      result.failures.push({
        source: source.location,
        error: errorMessage,
      })
      result.totalFailed++

      Sentry.captureException(error, {
        tags: { component: "ingestion-pipeline" },
        extra: { source: source.location },
      })
    }

    result.totalProcessed++
  }

  result.totalProcessingMs = Date.now() - startTime

  if (onProgress) {
    onProgress({
      status: "completed",
      progress: 100,
      completed: total,
      total,
    })
  }

  return result
}

/**
 * Ingest a single document
 */
export async function ingestSingleDocument(
  source: IngestionSource,
  options: IngestionOptions = {}
): Promise<IngestedDocument> {
  const startTime = Date.now()

  // Detect document type
  const docType = options.forceType || detectDocumentType(source)

  // Extract content based on type
  const extracted = await extractContent(source, docType, options)

  // Chunk the content
  const chunks = await chunkContent(
    extracted.text,
    extracted.markdown,
    docType,
    options
  )

  // Generate embeddings if requested
  if (options.generateEmbeddings !== false && chunks.length > 0) {
    const texts = chunks.map((c) => c.text)
    const embeddings = await generateEmbeddings(texts.join("\n\n"))

    // For now, assign the whole document embedding to each chunk
    // In production, you'd generate per-chunk embeddings
    for (const chunk of chunks) {
      chunk.embedding = embeddings[0]
    }
  }

  // Build document
  const doc: IngestedDocument = {
    id: uuidv4(),
    source: source.location,
    type: docType,
    title: extracted.title,
    text: extracted.text,
    markdown: extracted.markdown,
    chunks,
    metadata: {
      wordCount: extracted.text.split(/\s+/).filter((w) => w.length > 0).length,
      charCount: extracted.text.length,
      pageCount: extracted.pageCount,
      author: extracted.author,
      description: extracted.description,
      language: extracted.language,
      custom: options.metadata,
    },
    ingestedAt: new Date(),
    processingMs: Date.now() - startTime,
  }

  return doc
}

// =============================================================================
// Content Extraction
// =============================================================================

interface ExtractedContent {
  text: string
  markdown?: string
  title?: string
  author?: string
  description?: string
  language?: string
  pageCount?: number
}

/**
 * Extract content from source based on document type
 */
async function extractContent(
  source: IngestionSource,
  docType: DocumentType,
  options: IngestionOptions
): Promise<ExtractedContent> {
  const location = source.location
  const content = source.content

  switch (docType) {
    case "pdf": {
      const result = await extractPdfText(content || location)
      return {
        text: result.text,
        title: result.metadata?.title,
        author: result.metadata?.author,
        pageCount: result.metadata?.pages,
      }
    }

    case "docx":
    case "doc": {
      const buffer = content
        ? (typeof content === "string" ? Buffer.from(content) : content)
        : location
      const result = await extractDocxText(buffer, { includeMarkdown: true })
      return {
        text: result.text,
        markdown: result.markdown,
      }
    }

    case "markdown": {
      const mdContent = content?.toString() || location
      const result = await extractMarkdownText(mdContent, {
        includeHtml: false,
        parseFrontmatter: true,
        extractMetadata: true,
      })
      return {
        text: result.text,
        markdown: mdContent.toString(),
        title: result.metadata?.title || (result.frontmatter?.title as string),
        author: result.frontmatter?.author as string,
        description: result.frontmatter?.description as string,
      }
    }

    case "text": {
      const textContent = content?.toString() || location
      const result = await extractTextContent(textContent, {
        normalizeWhitespace: true,
        maxLength: options.maxLength,
      })
      return {
        text: result.text,
      }
    }

    case "json": {
      const jsonContent = content?.toString() || location
      const result = await extractJsonText(jsonContent)
      return {
        text: result.text,
      }
    }

    case "csv": {
      const csvContent = content?.toString() || location
      const result = await extractCsvText(csvContent)
      return {
        text: result.text,
      }
    }

    case "html": {
      const htmlContent = content?.toString() || location
      const result = await extractHtmlContent(htmlContent, {
        baseUrl: source.location.startsWith("http") ? source.location : undefined,
        extractLinks: false,
      })
      return {
        text: result.text,
        markdown: result.markdown,
        title: result.metadata?.title,
        author: result.metadata?.author,
        description: result.metadata?.description,
        language: result.metadata?.language,
      }
    }

    case "url": {
      // Handle URL-based ingestion
      if (options.crawler?.strategy === "sitemap" || options.crawler?.strategy === "spider") {
        // Multi-page crawl - this returns multiple documents
        // For single document context, just get the first page
        const page = await crawlSinglePage(location)
        if (!page) {
          throw new Error("Failed to fetch URL")
        }
        return {
          text: page.text,
          markdown: page.markdown,
          title: page.title,
          author: page.metadata?.author,
          description: page.metadata?.description,
          language: page.metadata?.language,
        }
      } else {
        // Single page fetch
        const result = await htmlToMarkdown(location, location)
        const htmlResult = await extractHtmlContent(location, { extractLinks: false })
        return {
          text: htmlResult.text,
          markdown: result.markdown,
          title: result.title,
          description: htmlResult.metadata?.description,
          language: htmlResult.metadata?.language,
        }
      }
    }

    case "audio": {
      const audioContent = content || location
      const result = await transcribeAudio(
        typeof audioContent === "string" ? audioContent : audioContent.toString()
      )
      return {
        text: result.transcript,
      }
    }

    case "video": {
      const videoContent = content || location
      const result = await transcribeVideo(
        typeof videoContent === "string" ? videoContent : videoContent.toString()
      )
      return {
        text: result.transcript,
      }
    }

    default:
      // Try as plain text
      const fallbackContent = content?.toString() || location
      try {
        const result = await extractTextContent(fallbackContent, {
          stripHtml: true,
          normalizeWhitespace: true,
        })
        return { text: result.text }
      } catch {
        throw new Error(`Unsupported document type: ${docType}`)
      }
  }
}

// =============================================================================
// Content Chunking
// =============================================================================

/**
 * Chunk content based on document type and options
 */
async function chunkContent(
  text: string,
  markdown: string | undefined,
  docType: DocumentType,
  options: IngestionOptions
): Promise<IngestedChunk[]> {
  // Skip chunking if disabled
  if (options.chunking?.enabled === false) {
    return [
      {
        index: 0,
        text,
        startPos: 0,
        endPos: text.length,
      },
    ]
  }

  const config = {
    chunkSize: options.chunking?.chunkSize || 1000,
    chunkOverlap: options.chunking?.chunkOverlap || 200,
  }

  // Use markdown-aware chunking for markdown content
  if (markdown && (docType === "markdown" || docType === "html" || docType === "url")) {
    return chunkMarkdown(markdown, config)
  }

  // Use paragraph-based chunking for longer documents
  if (text.length > 5000 && text.includes("\n\n")) {
    return chunkByParagraphs(text, config)
  }

  // Default sentence-based chunking
  return chunkText(text, config)
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Ingest a single URL
 */
export async function ingestUrl(
  url: string,
  options: IngestionOptions = {}
): Promise<IngestedDocument> {
  return ingestSingleDocument(
    { type: "url", location: url },
    { ...options, forceType: "url" }
  )
}

/**
 * Ingest a documentation site via sitemap
 */
export async function ingestDocumentationSite(
  url: string,
  options: {
    maxPages?: number
    generateEmbeddings?: boolean
    onProgress?: IngestionProgressCallback
  } = {}
): Promise<IngestionResult> {
  const crawlResult = await crawlWebsite(
    {
      url,
      strategy: "sitemap",
      maxPages: options.maxPages || 100,
    },
    (progress) => {
      if (options.onProgress) {
        options.onProgress({
          status: progress.status === "completed" ? "completed" : "processing",
          progress: progress.progress,
          currentItem: progress.currentUrl,
          completed: progress.pagesCompleted,
          total: progress.pagesDiscovered,
        })
      }
    }
  )

  // Convert crawled pages to ingested documents
  const documents: IngestedDocument[] = []
  const failures: Array<{ source: string; error: string }> = []

  for (const page of crawlResult.pages) {
    try {
      const textChunks = chunkMarkdown(page.markdown, {
        chunkSize: 1000,
        chunkOverlap: 200,
      })

      // Convert to IngestedChunk format and add embeddings
      const chunks: IngestedChunk[] = textChunks.map((c) => ({
        index: c.index,
        text: c.text,
        startPos: c.startPos,
        endPos: c.endPos,
      }))

      // Generate embeddings if requested
      if (options.generateEmbeddings !== false && chunks.length > 0) {
        const texts = chunks.map((c) => c.text)
        const embeddings = await generateEmbeddings(texts.join("\n\n"))
        for (const chunk of chunks) {
          chunk.embedding = embeddings[0]
        }
      }

      documents.push({
        id: uuidv4(),
        source: page.url,
        type: "url",
        title: page.title,
        text: page.text,
        markdown: page.markdown,
        chunks,
        metadata: {
          wordCount: page.metadata?.wordCount || 0,
          charCount: page.text.length,
          author: page.metadata?.author,
          description: page.metadata?.description,
          language: page.metadata?.language,
        },
        ingestedAt: new Date(),
        processingMs: 0,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      failures.push({ source: page.url, error: errorMessage })
    }
  }

  // Add crawl failures
  for (const failure of crawlResult.failures) {
    failures.push({ source: failure.url, error: failure.error })
  }

  return {
    documents,
    failures,
    totalProcessed: crawlResult.pagesSuccess + crawlResult.pagesFailed,
    totalSuccess: documents.length,
    totalFailed: failures.length,
    totalProcessingMs: crawlResult.durationMs || 0,
  }
}

/**
 * Ingest a file (from buffer or path)
 */
export async function ingestFile(
  fileOrPath: Buffer | string,
  options: {
    fileName?: string
    mimeType?: string
    generateEmbeddings?: boolean
    metadata?: Record<string, unknown>
  } = {}
): Promise<IngestedDocument> {
  const source: IngestionSource = {
    type: typeof fileOrPath === "string" ? "file" : "buffer",
    location: typeof fileOrPath === "string" ? fileOrPath : "buffer",
    fileName: options.fileName,
    mimeType: options.mimeType,
    content: typeof fileOrPath === "string" ? undefined : fileOrPath,
  }

  return ingestSingleDocument(source, {
    generateEmbeddings: options.generateEmbeddings,
    metadata: options.metadata,
  })
}
