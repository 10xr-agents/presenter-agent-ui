/**
 * Document Ingestion API
 *
 * POST /api/knowledge/ingest
 *
 * Ingests documents from various sources (files, URLs, raw content).
 * Supports PDF, DOCX, Markdown, Text, HTML, JSON, CSV, and more.
 */

import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { z } from "zod"
import { auth } from "@/lib/auth/auth"
import { headers } from "next/headers"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeDocument } from "@/lib/models/knowledge-document"

// Dynamic imports to avoid Turbopack issues
const getKnowledgeModule = async () => import("@/lib/knowledge")

// Import types statically (they don't cause issues)
type IngestionSource = {
  type: "file" | "url" | "buffer"
  location: string
  fileName?: string
  mimeType?: string
  content?: Buffer | string
}

type DocumentType = "pdf" | "docx" | "doc" | "markdown" | "text" | "html" | "json" | "csv" | "url" | "audio" | "video" | "unknown"

// =============================================================================
// Request Schema
// =============================================================================

const ingestRequestSchema = z.object({
  /** Source type */
  sourceType: z.enum(["file", "url", "content"]),
  /** For file: presigned URL or file path; For URL: the URL; For content: ignored */
  location: z.string().optional(),
  /** File name (for content or file sources) */
  fileName: z.string().optional(),
  /** MIME type (helps with detection) */
  mimeType: z.string().optional(),
  /** Raw content (for content source type) */
  content: z.string().optional(),
  /** Force a specific document type */
  forceType: z.enum([
    "pdf", "docx", "doc", "markdown", "text", "html", "json", "csv", "url", "audio", "video", "unknown"
  ]).optional(),
  /** Name for the knowledge document */
  name: z.string().min(1).max(200).optional(),
  /** Description */
  description: z.string().max(1000).optional(),
  /** Generate embeddings */
  generateEmbeddings: z.boolean().optional().default(true),
  /** Chunking configuration */
  chunking: z.object({
    enabled: z.boolean().default(true),
    chunkSize: z.number().min(100).max(10000).default(1000),
    chunkOverlap: z.number().min(0).max(1000).default(200),
  }).optional(),
  /** Custom metadata */
  metadata: z.record(z.string(), z.unknown()).optional(),
})

type IngestRequest = z.infer<typeof ingestRequestSchema>

// =============================================================================
// POST Handler
// =============================================================================

export async function POST(request: NextRequest) {
  Sentry.logger.info("Knowledge ingest: request received")
  try {
    // Authenticate
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user?.id) {
      Sentry.logger.info("Knowledge ingest: unauthorized")
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Parse request body
    const body = (await request.json()) as unknown
    const parseResult = ingestRequestSchema.safeParse(body)

    if (!parseResult.success) {
      Sentry.logger.info("Knowledge ingest: body validation failed")
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.format() },
        { status: 400 }
      )
    }

    const data = parseResult.data

    // Validate required fields based on source type
    if (data.sourceType === "content" && !data.content) {
      Sentry.logger.info("Knowledge ingest: content required for content source type")
      return NextResponse.json(
        { error: "Content is required for content source type" },
        { status: 400 }
      )
    }

    if ((data.sourceType === "file" || data.sourceType === "url") && !data.location) {
      Sentry.logger.info("Knowledge ingest: location required for file/url source type")
      return NextResponse.json(
        { error: "Location is required for file/url source types" },
        { status: 400 }
      )
    }

    Sentry.logger.info("Knowledge ingest: starting ingestion", {
      sourceType: data.sourceType,
    })
    // Connect to database
    await connectDB()

    // Get tenant ID
    const tenantId = (session.user as { activeTenantId?: string }).activeTenantId || session.user.id

    // Build ingestion source
    const source: IngestionSource = {
      type: data.sourceType === "content" ? "buffer" : data.sourceType,
      location: data.location || "inline-content",
      fileName: data.fileName,
      mimeType: data.mimeType,
      content: data.content,
    }

    // Dynamically import to avoid Turbopack issues
    const { detectDocumentType, ingestSingleDocument } = await getKnowledgeModule()

    // Detect document type
    const docType = data.forceType || detectDocumentType(source as Parameters<typeof detectDocumentType>[0])

    // Create knowledge document record
    const documentName = data.name || data.fileName || getDocumentName(source, docType)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const knowledgeDoc = await (KnowledgeDocument as any).create({
      tenantId,
      userId: session.user.id,
      name: documentName,
      description: data.description,
      type: docType,
      status: "processing",
      storageLocation: data.location,
      metadata: data.metadata,
    })

    try {
      // Ingest the document
      const doc = await ingestSingleDocument(source as Parameters<typeof ingestSingleDocument>[0], {
        forceType: data.forceType,
        generateEmbeddings: data.generateEmbeddings,
        chunking: data.chunking,
        metadata: data.metadata,
      })

      // Update knowledge document with results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (KnowledgeDocument as any).findByIdAndUpdate(knowledgeDoc._id, {
        $set: {
          status: "ready",
          extractedTextContent: doc.text.substring(0, 100000), // Limit stored text
          summary: doc.title || doc.text.substring(0, 200),
          keyTopics: doc.chunks.slice(0, 5).map((c) => c.text.substring(0, 100)),
          extractedMetadata: {
            ...doc.metadata,
            chunksCount: doc.chunks.length,
            processingMs: doc.processingMs,
          },
          embeddingVectors: doc.chunks
            .filter((c) => c.embedding)
            .slice(0, 50) // Limit stored embeddings
            .map((c) => c.embedding),
        },
      })

      Sentry.logger.info("Knowledge ingest: ingestion completed", {
        sourceType: data.sourceType,
        chunksCount: doc.chunks.length,
      })
      return NextResponse.json({
        success: true,
        knowledgeDocumentId: knowledgeDoc._id.toString(),
        document: {
          id: doc.id,
          type: doc.type,
          title: doc.title,
          wordCount: doc.metadata.wordCount,
          charCount: doc.metadata.charCount,
          chunksCount: doc.chunks.length,
          processingMs: doc.processingMs,
        },
      })
    } catch (processingError: unknown) {
      Sentry.logger.info("Knowledge ingest: ingestion failed")
      // Update document to failed status
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (KnowledgeDocument as any).findByIdAndUpdate(knowledgeDoc._id, {
        $set: {
          status: "failed",
          processingError:
            processingError instanceof Error
              ? processingError.message
              : String(processingError),
        },
      })

      throw processingError
    }
  } catch (error: unknown) {
    Sentry.logger.info("Knowledge ingest: internal error")
    Sentry.captureException(error, {
      tags: { api: "knowledge/ingest" },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)

    return NextResponse.json(
      { error: "Failed to ingest document", details: errorMessage },
      { status: 500 }
    )
  }
}

// =============================================================================
// GET Handler - List supported formats
// =============================================================================

export async function GET() {
  const { EXTENSION_TO_TYPE } = await getKnowledgeModule()
  
  return NextResponse.json({
    supportedFormats: {
      documents: ["pdf", "docx", "doc"],
      text: ["txt", "md", "markdown", "json", "csv", "xml", "yaml", "yml"],
      web: ["html", "htm", "url"],
      media: ["mp3", "wav", "m4a", "mp4", "webm"],
    },
    extensions: Object.keys(EXTENSION_TO_TYPE),
    strategies: {
      single: "Index a single page or document",
      sitemap: "Discover and index all pages from sitemap.xml",
      spider: "Crawl and index linked pages up to a specified depth",
    },
  })
}

// =============================================================================
// Helpers
// =============================================================================

function getDocumentName(source: IngestionSource, docType: DocumentType): string {
  if (source.fileName) {
    return source.fileName
  }

  if (source.location.startsWith("http")) {
    try {
      const url = new URL(source.location)
      return url.pathname.split("/").pop() || url.hostname
    } catch {
      return "Untitled Document"
    }
  }

  return `Untitled ${docType.toUpperCase()} Document`
}
