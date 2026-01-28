/**
 * PDF Text Extractor
 *
 * Uses pdf-parse v2 to extract text content from PDF files.
 * Handles both local files and remote URLs.
 */

import * as Sentry from "@sentry/nextjs"
import { PDFParse } from "pdf-parse"

export interface PdfExtractionResult {
  text: string
  metadata?: {
    pages: number
    title?: string
    author?: string
    subject?: string
    keywords?: string
    creator?: string
    producer?: string
    creationDate?: Date
    modificationDate?: Date
  }
}

/**
 * Extract text from a PDF file
 *
 * @param source - URL, file path, or Buffer containing the PDF
 * @returns Extracted text and metadata
 */
export async function extractPdfText(
  source: string | Buffer
): Promise<PdfExtractionResult> {
  let parser: PDFParse | undefined

  try {
    let buffer: Buffer

    if (Buffer.isBuffer(source)) {
      buffer = source
    } else if (source.startsWith("http://") || source.startsWith("https://")) {
      // Fetch from URL
      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else {
      // Assume it's a file path - read from filesystem
      // Note: In serverless environments, this may not work for all paths
      const fs = await import("fs/promises")
      buffer = await fs.readFile(source)
    }

    // Create PDFParse instance with the buffer
    parser = new PDFParse({ data: buffer })

    // Get text content
    const textResult = await parser.getText()

    // Get document info
    const infoResult = await parser.getInfo()

    // Build metadata
    const metadata: PdfExtractionResult["metadata"] = {
      pages: textResult.total,
    }

    // Extract info if available
    const info = infoResult.info as {
      Title?: string
      Author?: string
      Subject?: string
      Keywords?: string
      Creator?: string
      Producer?: string
      CreationDate?: string
      ModDate?: string
    } | undefined

    if (info) {
      if (info.Title) metadata.title = info.Title
      if (info.Author) metadata.author = info.Author
      if (info.Subject) metadata.subject = info.Subject
      if (info.Keywords) metadata.keywords = info.Keywords
      if (info.Creator) metadata.creator = info.Creator
      if (info.Producer) metadata.producer = info.Producer
      if (info.CreationDate) {
        try {
          metadata.creationDate = new Date(info.CreationDate)
        } catch {
          // Ignore invalid dates
        }
      }
      if (info.ModDate) {
        try {
          metadata.modificationDate = new Date(info.ModDate)
        } catch {
          // Ignore invalid dates
        }
      }
    }

    // Combine page texts
    const pages = textResult.pages as Array<{ text: string }> | undefined
    const text = pages
      ? pages.map((p) => p.text).join("\n\n")
      : ""

    // Clean up extracted text
    const cleanedText = cleanPdfText(text)

    return {
      text: cleanedText,
      metadata,
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "pdf-extractor" },
      extra: { source: typeof source === "string" ? source : "Buffer" },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract PDF text: ${errorMessage}`)
  } finally {
    // Cleanup parser
    if (parser) {
      try {
        await parser.destroy()
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Clean up extracted PDF text
 * - Normalize whitespace
 * - Remove excessive blank lines
 * - Handle common PDF artifacts
 */
function cleanPdfText(text: string): string {
  return text
    // Normalize line endings
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Remove page break markers that pdf-parse sometimes leaves
    .replace(/\f/g, "\n\n")
    // Collapse multiple spaces (but not newlines)
    .replace(/[^\S\n]+/g, " ")
    // Remove trailing spaces from lines
    .replace(/ +\n/g, "\n")
    // Collapse more than 2 consecutive newlines to 2
    .replace(/\n{3,}/g, "\n\n")
    // Trim
    .trim()
}

/**
 * Extract text from PDF with page-by-page breakdown
 * Useful for very large documents where you need chunking by page
 */
export async function extractPdfTextByPage(
  source: string | Buffer
): Promise<{ pages: string[]; metadata: PdfExtractionResult["metadata"] }> {
  let parser: PDFParse | undefined

  try {
    let buffer: Buffer

    if (Buffer.isBuffer(source)) {
      buffer = source
    } else if (source.startsWith("http://") || source.startsWith("https://")) {
      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else {
      const fs = await import("fs/promises")
      buffer = await fs.readFile(source)
    }

    // Create PDFParse instance
    parser = new PDFParse({ data: buffer })

    // Get text with page details
    const textResult = await parser.getText()
    const infoResult = await parser.getInfo()

    const metadata: PdfExtractionResult["metadata"] = {
      pages: textResult.total,
    }

    const info = infoResult.info as { Title?: string; Author?: string } | undefined
    if (info) {
      if (info.Title) metadata.title = info.Title
      if (info.Author) metadata.author = info.Author
    }

    // Extract per-page text
    const pagesData = textResult.pages as Array<{ text: string }> | undefined
    const pages = pagesData
      ? pagesData.map((p) => cleanPdfText(p.text))
      : []

    return { pages, metadata }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "pdf-extractor" },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract PDF pages: ${errorMessage}`)
  } finally {
    if (parser) {
      try {
        await parser.destroy()
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
