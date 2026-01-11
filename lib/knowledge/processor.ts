import { connectDB } from "@/lib/db/mongoose"
import type { IKnowledgeDocument } from "@/lib/models/knowledge-document"
import { KnowledgeDocument } from "@/lib/models/knowledge-document"
import { generateEmbeddings } from "./embeddings"
import { transcribeAudio } from "./extractors/audio-extractor"
import { extractPdfText } from "./extractors/pdf-extractor"
import { transcribeVideo } from "./extractors/video-extractor"

export interface ProcessingResult {
  extractedText?: string
  embeddings?: number[][]
  summary?: string
  keyTopics?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>
  error?: string
}

/**
 * Process a knowledge document
 */
export async function processKnowledgeDocument(
  documentId: string,
  documentType: "pdf" | "video" | "audio" | "text" | "url",
  storageLocation: string
): Promise<ProcessingResult> {
  await connectDB()

  // Get document
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const document = await (KnowledgeDocument as any).findById(documentId)
  if (!document) {
    throw new Error("Knowledge document not found")
  }

  // Update status to processing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (KnowledgeDocument as any).findByIdAndUpdate(documentId, {
    $set: { status: "processing" },
  })

  try {
    let extractedText: string | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metadata: Record<string, any> | undefined

    // Extract content based on document type
    switch (documentType) {
      case "pdf":
        const pdfResult = await extractPdfText(storageLocation)
        extractedText = pdfResult.text
        metadata = pdfResult.metadata
        break

      case "video":
        const videoResult = await transcribeVideo(storageLocation)
        extractedText = videoResult.transcript
        metadata = videoResult.metadata
        break

      case "audio":
        const audioResult = await transcribeAudio(storageLocation)
        extractedText = audioResult.transcript
        metadata = audioResult.metadata
        break

      case "text":
        // For text files, fetch and use as-is
        try {
          const response = await fetch(storageLocation)
          if (response.ok) {
            extractedText = await response.text()
          }
        } catch (error: unknown) {
          console.error("Failed to fetch text file:", error)
        }
        break

      case "url":
        // For URLs, fetch and extract text from HTML
        try {
          const response = await fetch(storageLocation)
          if (response.ok) {
            const html = await response.text()
            // Basic HTML text extraction (can be enhanced)
            extractedText = html.replace(/<[^>]*>/g, "").trim()
          }
        } catch (error: unknown) {
          console.error("Failed to fetch URL:", error)
        }
        break

      default:
        throw new Error(`Unsupported document type: ${documentType}`)
    }

    if (!extractedText) {
      throw new Error("Failed to extract text content")
    }

    // Generate embeddings
    const embeddings = await generateEmbeddings(extractedText)

    // Generate summary (placeholder - can be enhanced with AI)
    const summary = generateSummary(extractedText)

    // Extract key topics (placeholder - can be enhanced with AI)
    const keyTopics = extractKeyTopics(extractedText)

    // Update document with processed data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (KnowledgeDocument as any).findByIdAndUpdate(documentId, {
      $set: {
        status: "ready",
        extractedTextContent: extractedText,
        embeddingVectors: embeddings,
        summary,
        keyTopics,
        extractedMetadata: metadata,
        processingError: undefined,
      },
    })

    return {
      extractedText,
      embeddings,
      summary,
      keyTopics,
      metadata,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Update document with error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (KnowledgeDocument as any).findByIdAndUpdate(documentId, {
      $set: {
        status: "failed",
        processingError: errorMessage,
      },
    })

    return {
      error: errorMessage,
    }
  }
}

/**
 * Generate a simple summary from text (placeholder)
 * TODO: Enhance with AI-powered summarization
 */
function generateSummary(text: string): string {
  // Simple summary: first 200 characters
  const summary = text.substring(0, 200).trim()
  return summary.length < text.length ? `${summary}...` : summary
}

/**
 * Extract key topics from text (placeholder)
 * TODO: Enhance with AI-powered topic extraction
 */
function extractKeyTopics(text: string): string[] {
  // Simple topic extraction: extract capitalized words
  // This is a placeholder - should be replaced with proper NLP/AI
  const words = text.split(/\s+/)
  const topics = new Set<string>()

  for (const word of words) {
    if (word.length > 3 && /^[A-Z]/.test(word)) {
      topics.add(word)
      if (topics.size >= 10) break // Limit to 10 topics
    }
  }

  return Array.from(topics)
}
