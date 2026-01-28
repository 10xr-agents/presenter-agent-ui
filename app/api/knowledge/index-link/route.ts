/**
 * Link Indexing API
 *
 * POST /api/knowledge/index-link
 *
 * Indexes a URL or documentation site for RAG.
 * Supports single page, sitemap-based, and spider crawling.
 */

import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth/auth"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeDocument } from "@/lib/models/knowledge-document"

// Dynamic imports to avoid Turbopack issues with pdf-parse and crawlee
const getKnowledgeModule = async () => import("@/lib/knowledge")

// =============================================================================
// Request Schema
// =============================================================================

const indexLinkRequestSchema = z.object({
  /** URL to index */
  url: z.string().refine((val) => val.startsWith("http"), {
    message: "URL must start with http:// or https://",
  }),
  /** Indexing strategy */
  strategy: z.enum(["single", "sitemap", "spider"]).default("single"),
  /** Name for the knowledge document */
  name: z.string().min(1).max(200).optional(),
  /** Description */
  description: z.string().max(1000).optional(),
  /** Maximum pages to crawl (for sitemap/spider) */
  maxPages: z.number().min(1).max(500).optional().default(50),
  /** Maximum depth (for spider) */
  maxDepth: z.number().min(1).max(3).optional().default(2),
  /** Generate embeddings */
  generateEmbeddings: z.boolean().optional().default(true),
  /** Custom metadata to attach */
  metadata: z.record(z.string(), z.unknown()).optional(),
})

type IndexLinkRequest = z.infer<typeof indexLinkRequestSchema>

// =============================================================================
// POST Handler
// =============================================================================

export async function POST(request: NextRequest) {
  Sentry.logger.info("Knowledge index-link: request received")
  try {
    // Authenticate
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user?.id) {
      Sentry.logger.info("Knowledge index-link: unauthorized")
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Parse request body
    const body = (await request.json()) as unknown
    const parseResult = indexLinkRequestSchema.safeParse(body)

    if (!parseResult.success) {
      Sentry.logger.info("Knowledge index-link: body validation failed")
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.format() },
        { status: 400 }
      )
    }

    const data = parseResult.data
    Sentry.logger.info("Knowledge index-link: starting indexing", {
      strategy: data.strategy,
    })

    // Connect to database
    await connectDB()

    // Get tenant ID from session
    const tenantId = (session.user as { activeTenantId?: string }).activeTenantId || session.user.id

    // Create initial knowledge document record
    const documentName = data.name || new URL(data.url).hostname
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const knowledgeDoc = await (KnowledgeDocument as any).create({
      tenantId,
      userId: session.user.id,
      name: documentName,
      description: data.description,
      type: "url",
      status: "processing",
      originalUrl: data.url,
      metadata: {
        strategy: data.strategy,
        maxPages: data.maxPages,
        ...data.metadata,
      },
    })

    // Process based on strategy
    let result

    try {
      // Dynamically import to avoid Turbopack issues
      const { ingestUrl, ingestDocumentationSite } = await getKnowledgeModule()

      if (data.strategy === "single") {
        // Single page indexing
        const doc = await ingestUrl(data.url, {
          generateEmbeddings: data.generateEmbeddings,
          metadata: data.metadata,
        })

        result = {
          documentsIndexed: 1,
          totalChunks: doc.chunks.length,
          documents: [
            {
              id: doc.id,
              source: doc.source,
              title: doc.title,
              wordCount: doc.metadata.wordCount,
            },
          ],
        }

        // Update knowledge document with extracted content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (KnowledgeDocument as any).findByIdAndUpdate(knowledgeDoc._id, {
          $set: {
            status: "ready",
            extractedTextContent: doc.text,
            summary: doc.title,
            keyTopics: doc.chunks.slice(0, 5).map((c) => c.text.substring(0, 100)),
            extractedMetadata: doc.metadata,
            embeddingVectors: doc.chunks
              .filter((c) => c.embedding)
              .map((c) => c.embedding),
          },
        })
      } else {
        // Multi-page indexing (sitemap or spider)
        const crawlResult = await ingestDocumentationSite(data.url, {
          maxPages: data.maxPages,
          generateEmbeddings: data.generateEmbeddings,
        })

        result = {
          documentsIndexed: crawlResult.totalSuccess,
          totalFailed: crawlResult.totalFailed,
          totalChunks: crawlResult.documents.reduce(
            (sum: number, d) => sum + d.chunks.length,
            0
          ),
          documents: crawlResult.documents.slice(0, 10).map((d) => ({
            id: d.id,
            source: d.source,
            title: d.title,
            wordCount: d.metadata.wordCount,
          })),
          processingMs: crawlResult.totalProcessingMs,
        }

        // Update knowledge document
        const allText = crawlResult.documents
          .map((d) => d.text)
          .join("\n\n---\n\n")
          .substring(0, 100000) // Limit stored text

        const allChunks = crawlResult.documents.flatMap((d) => d.chunks)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (KnowledgeDocument as any).findByIdAndUpdate(knowledgeDoc._id, {
          $set: {
            status: "ready",
            extractedTextContent: allText,
            summary: `Indexed ${crawlResult.totalSuccess} pages from ${new URL(data.url).hostname}`,
            keyTopics: crawlResult.documents
              .slice(0, 10)
              .map((d) => d.title)
              .filter(Boolean),
            extractedMetadata: {
              pagesIndexed: crawlResult.totalSuccess,
              pagesFailed: crawlResult.totalFailed,
              totalChunks: allChunks.length,
              processingMs: crawlResult.totalProcessingMs,
            },
            embeddingVectors: allChunks
              .filter((c) => c.embedding)
              .slice(0, 100) // Limit stored embeddings
              .map((c) => c.embedding),
          },
        })

        // If there were failures, log them (no URL or content)
        if (crawlResult.failures.length > 0) {
          Sentry.logger.warn("Knowledge index-link: indexing had failures", {
            failureCount: crawlResult.failures.length,
          })
        }
      }

      Sentry.logger.info("Knowledge index-link: indexing completed", {
        strategy: data.strategy,
        documentsIndexed: result.documentsIndexed,
        totalChunks: result.totalChunks,
      })
      return NextResponse.json({
        success: true,
        knowledgeDocumentId: knowledgeDoc._id.toString(),
        ...result,
      })
    } catch (processingError: unknown) {
      Sentry.logger.info("Knowledge index-link: indexing failed")
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
    Sentry.logger.info("Knowledge index-link: internal error")
    Sentry.captureException(error, {
      tags: { api: "knowledge/index-link" },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)

    return NextResponse.json(
      { error: "Failed to index link", details: errorMessage },
      { status: 500 }
    )
  }
}

// =============================================================================
// GET Handler - Check indexing status
// =============================================================================

export async function GET(request: NextRequest) {
  Sentry.logger.info("Knowledge index-link status: request received")
  try {
    // Authenticate
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user?.id) {
      Sentry.logger.info("Knowledge index-link status: unauthorized")
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get document ID from query params
    const { searchParams } = new URL(request.url)
    const documentId = searchParams.get("id")

    if (!documentId) {
      Sentry.logger.info("Knowledge index-link status: missing document id")
      return NextResponse.json(
        { error: "Missing document ID" },
        { status: 400 }
      )
    }

    await connectDB()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (KnowledgeDocument as any).findById(documentId)

    if (!doc) {
      Sentry.logger.info("Knowledge index-link status: document not found")
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      )
    }

    // Check ownership
    const tenantId = (session.user as { activeTenantId?: string }).activeTenantId || session.user.id
    if (doc.tenantId !== tenantId) {
      Sentry.logger.info("Knowledge index-link status: forbidden")
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    Sentry.logger.info("Knowledge index-link status: returning status", {
      status: doc.status,
    })
    return NextResponse.json({
      id: doc._id.toString(),
      name: doc.name,
      status: doc.status,
      type: doc.type,
      originalUrl: doc.originalUrl,
      metadata: doc.extractedMetadata,
      error: doc.processingError,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })
  } catch (error: unknown) {
    Sentry.logger.info("Knowledge index-link status: internal error")
    Sentry.captureException(error, {
      tags: { api: "knowledge/index-link" },
    })

    return NextResponse.json(
      { error: "Failed to get document status" },
      { status: 500 }
    )
  }
}
