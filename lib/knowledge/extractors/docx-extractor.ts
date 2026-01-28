/**
 * DOCX Text Extractor
 *
 * Uses mammoth to extract text and HTML content from Word documents (.docx).
 * Supports both local files and remote URLs.
 */

import * as Sentry from "@sentry/nextjs"
import mammoth from "mammoth"

export interface DocxExtractionResult {
  text: string
  html?: string
  markdown?: string
  metadata?: {
    messages?: Array<{ type: string; message: string }>
    images?: number
  }
}

export interface DocxExtractionOptions {
  /** Extract as HTML in addition to text */
  includeHtml?: boolean
  /** Extract as Markdown (requires turndown) */
  includeMarkdown?: boolean
  /** Style map for custom conversions */
  styleMap?: string[]
}

/**
 * Extract text from a DOCX file
 *
 * @param source - URL, file path, or Buffer containing the DOCX
 * @param options - Extraction options
 * @returns Extracted text and optional HTML/markdown
 */
export async function extractDocxText(
  source: string | Buffer,
  options: DocxExtractionOptions = {}
): Promise<DocxExtractionResult> {
  try {
    let buffer: Buffer

    if (Buffer.isBuffer(source)) {
      buffer = source
    } else if (source.startsWith("http://") || source.startsWith("https://")) {
      // Fetch from URL
      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(`Failed to fetch DOCX: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else {
      // Assume it's a file path - read from filesystem
      const fs = await import("fs/promises")
      buffer = await fs.readFile(source)
    }

    // Extract as raw text
    const textResult = await mammoth.extractRawText({ buffer })
    const text = cleanDocxText(textResult.value)

    const result: DocxExtractionResult = {
      text,
      metadata: {
        messages: textResult.messages.map((m) => ({
          type: m.type,
          message: m.message,
        })),
      },
    }

    // Optionally extract HTML
    if (options.includeHtml) {
      const mammothOptions: { styleMap?: string[] } = {}
      if (options.styleMap) {
        mammothOptions.styleMap = options.styleMap
      }

      const htmlResult = await mammoth.convertToHtml({ buffer }, mammothOptions)
      result.html = htmlResult.value
    }

    // Optionally convert to Markdown
    if (options.includeMarkdown && result.html) {
      try {
        const TurndownService = (await import("turndown")).default
        const turndownService = new TurndownService({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
        })
        result.markdown = turndownService.turndown(result.html)
      } catch (error: unknown) {
        Sentry.logger.warn("Failed to convert DOCX HTML to Markdown", { error })
      }
    }

    return result
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "docx-extractor" },
      extra: { source: typeof source === "string" ? source : "Buffer" },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract DOCX text: ${errorMessage}`)
  }
}

/**
 * Clean up extracted DOCX text
 */
function cleanDocxText(text: string): string {
  return text
    // Normalize line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Collapse multiple spaces
    .replace(/[^\S\n]+/g, " ")
    // Remove trailing spaces
    .replace(/ +\n/g, "\n")
    // Collapse more than 2 consecutive newlines
    .replace(/\n{3,}/g, "\n\n")
    // Trim
    .trim()
}

/**
 * Extract images from a DOCX file
 * Returns image buffers with content types
 */
export async function extractDocxImages(
  source: string | Buffer
): Promise<Array<{ contentType: string; buffer: Buffer }>> {
  try {
    let buffer: Buffer

    if (Buffer.isBuffer(source)) {
      buffer = source
    } else if (source.startsWith("http://") || source.startsWith("https://")) {
      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(`Failed to fetch DOCX: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else {
      const fs = await import("fs/promises")
      buffer = await fs.readFile(source)
    }

    const images: Array<{ contentType: string; buffer: Buffer }> = []

    await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement((image) => {
          return image.read("base64").then((imageBuffer) => {
            images.push({
              contentType: image.contentType,
              buffer: Buffer.from(imageBuffer, "base64"),
            })
            // Return empty src since we just want to extract images
            return { src: "" }
          })
        }),
      }
    )

    return images
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "docx-extractor" },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract DOCX images: ${errorMessage}`)
  }
}
