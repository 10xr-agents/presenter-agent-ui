/**
 * File Context Processing
 *
 * Handles file attachment processing for tasks:
 * - Downloads files from S3
 * - Extracts content using appropriate extractors
 * - Formats content for LLM prompt injection
 *
 * @see docs/INTERACT_FLOW_WALKTHROUGH.md
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import * as Sentry from "@sentry/nextjs"
import { env } from "@/env.mjs"
import { extractPdfText } from "@/lib/knowledge/extractors/pdf-extractor"
import { extractCsvText, extractJsonText, extractTextContent } from "@/lib/knowledge/extractors/text-extractor"
import type { TaskAttachment } from "@/lib/models/task"

// Maximum content size to include in prompts (5KB)
const MAX_CONTENT_FOR_PROMPT = 5000

// Lazy S3 client initialization
let s3ClientInstance: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    const nodeEnv = process.env.NODE_ENV || "development"
    const provider = env.S3_PROVIDER || (nodeEnv === "development" ? "digitalocean" : "aws")
    const _bucket = env.S3_BUCKET
    const endpoint = env.S3_ENDPOINT
    const accessKeyId = env.S3_ACCESS_KEY_ID
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY

    let region: string
    if (env.S3_REGION) {
      region = env.S3_REGION
    } else if (provider === "digitalocean" && endpoint) {
      try {
        const url = new URL(endpoint)
        const hostname = url.hostname
        const match = hostname.match(/^([^.]+)\.digitaloceanspaces\.com$/)
        region = match?.[1] || "nyc3"
      } catch {
        region = "nyc3"
      }
    } else {
      region = "us-east-1"
    }

    s3ClientInstance = new S3Client({
      region,
      endpoint,
      credentials: accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
      forcePathStyle: provider === "digitalocean",
    })
  }

  return s3ClientInstance
}

/**
 * Input for processing a task attachment
 */
export interface ProcessAttachmentInput {
  s3Key: string
  filename: string
  mimeType: string
  size: number
}

/**
 * Download file from S3
 */
async function downloadFromS3(s3Key: string): Promise<Buffer> {
  const client = getS3Client()
  const bucket = env.S3_BUCKET

  if (!bucket) {
    throw new Error("S3_BUCKET environment variable is required")
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: s3Key,
  })

  const response = await client.send(command)

  if (!response.Body) {
    throw new Error("Empty response from S3")
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = []
  const bodyStream = response.Body as AsyncIterable<Uint8Array>
  for await (const chunk of bodyStream) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

/**
 * Process a task attachment - download and extract content
 *
 * @param input - Attachment details
 * @returns Processed TaskAttachment with extracted content
 */
export async function processTaskAttachment(
  input: ProcessAttachmentInput
): Promise<TaskAttachment> {
  const { s3Key, filename, mimeType, size } = input
  const attachmentId = crypto.randomUUID()

  try {
    // Download file from S3
    const fileBuffer = await downloadFromS3(s3Key)

    // Extract content based on MIME type
    let extractedContent: string | undefined
    let extractedMetadata: Record<string, unknown> | undefined

    if (mimeType === "application/pdf") {
      const result = await extractPdfText(fileBuffer)
      extractedContent = result.text
      extractedMetadata = result.metadata
    } else if (mimeType === "text/csv" || filename.endsWith(".csv")) {
      const result = await extractCsvText(fileBuffer)
      extractedContent = result.text
      extractedMetadata = result.metadata
    } else if (mimeType === "application/json" || filename.endsWith(".json")) {
      const result = await extractJsonText(fileBuffer)
      extractedContent = result.text
      extractedMetadata = result.metadata
    } else if (
      mimeType.startsWith("text/") ||
      mimeType === "application/xml" ||
      filename.endsWith(".txt") ||
      filename.endsWith(".md") ||
      filename.endsWith(".xml")
    ) {
      const result = await extractTextContent(fileBuffer)
      extractedContent = result.text
      extractedMetadata = result.metadata
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      filename.endsWith(".docx")
    ) {
      // Import docx extractor dynamically to avoid loading mammoth when not needed
      try {
        const { extractDocxText } = await import("@/lib/knowledge/extractors/docx-extractor")
        const result = await extractDocxText(fileBuffer)
        extractedContent = result.text
        extractedMetadata = result.metadata
      } catch (err: unknown) {
        console.warn("[File Context] DOCX extraction failed:", err)
        extractedContent = `[DOCX file: ${filename} - extraction not available]`
      }
    } else {
      // Unsupported file type - store a placeholder
      extractedContent = `[Binary file: ${filename} (${mimeType}) - content not extractable]`
      extractedMetadata = { warning: "Content extraction not supported for this file type" }
    }

    return {
      id: attachmentId,
      filename,
      mimeType,
      s3Key,
      size,
      extractedContent,
      extractedMetadata,
      uploadedAt: new Date(),
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "file-context", operation: "processTaskAttachment" },
      extra: { s3Key, filename, mimeType },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)

    // Return attachment with error info
    return {
      id: attachmentId,
      filename,
      mimeType,
      s3Key,
      size,
      extractedContent: `[Error extracting content: ${errorMessage}]`,
      extractedMetadata: { error: errorMessage },
      uploadedAt: new Date(),
    }
  }
}

/**
 * Format file attachments for LLM prompt injection
 *
 * @param attachments - Array of task attachments
 * @param maxContentLength - Maximum content length per file (default 5000)
 * @returns Formatted string for LLM prompt
 */
export function formatFileContextForPrompt(
  attachments: TaskAttachment[],
  maxContentLength: number = MAX_CONTENT_FOR_PROMPT
): string {
  if (!attachments || attachments.length === 0) {
    return ""
  }

  const parts: string[] = []
  parts.push("\n--- Attached Files ---")

  for (const attachment of attachments) {
    parts.push(`\nFile: ${attachment.filename}`)
    parts.push(`Type: ${attachment.mimeType}`)
    parts.push(`Size: ${formatFileSize(attachment.size)}`)

    if (attachment.extractedMetadata) {
      const meta = attachment.extractedMetadata
      if (meta.pages) parts.push(`Pages: ${meta.pages}`)
      if (meta.title) parts.push(`Title: ${meta.title}`)
      if (meta.lineCount) parts.push(`Lines: ${meta.lineCount}`)
    }

    if (attachment.extractedContent) {
      parts.push("\nContent:")
      // Truncate if too long
      if (attachment.extractedContent.length > maxContentLength) {
        parts.push(
          attachment.extractedContent.substring(0, maxContentLength) +
            `\n... [truncated, ${attachment.extractedContent.length - maxContentLength} more characters]`
        )
      } else {
        parts.push(attachment.extractedContent)
      }
    }

    parts.push("") // Empty line between files
  }

  parts.push("--- End Attached Files ---\n")

  return parts.join("\n")
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Get a summary of attachments (for logging/display)
 */
export function getAttachmentsSummary(attachments: TaskAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return "No attachments"
  }

  return attachments
    .map((a) => `${a.filename} (${formatFileSize(a.size)})`)
    .join(", ")
}

/**
 * Check if attachments contain extractable content
 */
export function hasExtractableContent(attachments: TaskAttachment[]): boolean {
  if (!attachments || attachments.length === 0) {
    return false
  }

  return attachments.some(
    (a) =>
      a.extractedContent &&
      !a.extractedContent.startsWith("[Binary file:") &&
      !a.extractedContent.startsWith("[Error")
  )
}

/**
 * Get total extracted content size
 */
export function getTotalExtractedSize(attachments: TaskAttachment[]): number {
  if (!attachments || attachments.length === 0) {
    return 0
  }

  return attachments.reduce(
    (total, a) => total + (a.extractedContent?.length || 0),
    0
  )
}
