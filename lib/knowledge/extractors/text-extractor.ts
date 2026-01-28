/**
 * Plain Text Extractor
 *
 * Handles plain text files (.txt, .csv, .json, .xml, etc.)
 * Provides basic text processing and metadata extraction.
 */

import * as Sentry from "@sentry/nextjs"

export interface TextExtractionResult {
  text: string
  metadata?: {
    encoding?: string
    lineCount?: number
    wordCount?: number
    charCount?: number
    fileType?: string
  }
}

export interface TextExtractionOptions {
  /** Maximum characters to extract (0 = no limit) */
  maxLength?: number
  /** Strip HTML tags if detected */
  stripHtml?: boolean
  /** Normalize whitespace */
  normalizeWhitespace?: boolean
}

/**
 * Extract text from a plain text file
 *
 * @param source - URL, file path, or raw text content
 * @param options - Extraction options
 * @returns Extracted text and metadata
 */
export async function extractTextContent(
  source: string | Buffer,
  options: TextExtractionOptions = {}
): Promise<TextExtractionResult> {
  try {
    let text: string
    let fileType: string | undefined

    if (Buffer.isBuffer(source)) {
      text = source.toString("utf-8")
    } else if (source.startsWith("http://") || source.startsWith("https://")) {
      // Fetch from URL
      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(`Failed to fetch text: ${response.status} ${response.statusText}`)
      }
      text = await response.text()

      // Try to determine file type from URL or content-type
      const contentType = response.headers.get("content-type")
      if (contentType) {
        if (contentType.includes("json")) fileType = "json"
        else if (contentType.includes("xml")) fileType = "xml"
        else if (contentType.includes("csv")) fileType = "csv"
        else if (contentType.includes("html")) fileType = "html"
        else fileType = "text"
      }

      // Also check URL extension
      if (!fileType) {
        fileType = getFileTypeFromPath(source)
      }
    } else if (source.includes("\n") || source.length > 500) {
      // Likely raw content
      text = source
    } else {
      // Assume it's a file path
      try {
        const fs = await import("fs/promises")
        text = await fs.readFile(source, "utf-8")
        fileType = getFileTypeFromPath(source)
      } catch {
        // If file read fails, treat as raw content
        text = source
      }
    }

    // Process the text
    if (options.stripHtml) {
      text = stripHtmlTags(text)
    }

    if (options.normalizeWhitespace !== false) {
      text = normalizeWhitespace(text)
    }

    // Apply length limit
    if (options.maxLength && options.maxLength > 0 && text.length > options.maxLength) {
      text = text.substring(0, options.maxLength)
    }

    // Calculate metadata
    const lines = text.split("\n")
    const words = text.split(/\s+/).filter((w) => w.length > 0)

    return {
      text,
      metadata: {
        lineCount: lines.length,
        wordCount: words.length,
        charCount: text.length,
        fileType,
      },
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "text-extractor" },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract text: ${errorMessage}`)
  }
}

/**
 * Extract text from JSON file with pretty printing
 */
export async function extractJsonText(
  source: string | Buffer
): Promise<TextExtractionResult> {
  try {
    const baseResult = await extractTextContent(source, {
      normalizeWhitespace: false,
    })

    // Try to parse and pretty-print JSON
    try {
      const parsed = JSON.parse(baseResult.text)
      const prettyJson = JSON.stringify(parsed, null, 2)

      // Also extract string values for semantic search
      const stringValues = extractJsonStrings(parsed)
      const semanticText = stringValues.join("\n")

      return {
        text: semanticText || prettyJson,
        metadata: {
          ...baseResult.metadata,
          fileType: "json",
        },
      }
    } catch {
      // Not valid JSON, return as-is
      return baseResult
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract JSON: ${errorMessage}`)
  }
}

/**
 * Extract text from CSV file
 */
export async function extractCsvText(
  source: string | Buffer
): Promise<TextExtractionResult> {
  try {
    const baseResult = await extractTextContent(source, {
      normalizeWhitespace: false,
    })

    // Parse CSV to extract meaningful text
    const lines = baseResult.text.split("\n").filter((line) => line.trim())
    const rows: string[][] = []

    for (const line of lines) {
      // Simple CSV parsing (handles basic cases)
      const row = parseSimpleCsvLine(line)
      rows.push(row)
    }

    // Convert to readable text format
    let text = ""
    const headers = rows[0]

    if (headers && rows.length > 1) {
      // If we have headers, format as key: value pairs
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (row) {
          const pairs: string[] = []
          for (let j = 0; j < headers.length; j++) {
            const header = headers[j]
            const value = row[j]
            if (header && value) {
              pairs.push(`${header}: ${value}`)
            }
          }
          text += pairs.join(", ") + "\n"
        }
      }
    } else {
      // No headers, just join cells
      text = rows.map((row) => row.join(", ")).join("\n")
    }

    return {
      text: text.trim(),
      metadata: {
        ...baseResult.metadata,
        fileType: "csv",
        lineCount: rows.length,
      },
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract CSV: ${errorMessage}`)
  }
}

/**
 * Simple CSV line parser (handles basic quoting)
 */
function parseSimpleCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/**
 * Extract string values from JSON object (for semantic search)
 */
function extractJsonStrings(obj: unknown, depth = 0): string[] {
  if (depth > 10) return [] // Prevent infinite recursion

  const strings: string[] = []

  if (typeof obj === "string" && obj.length > 2) {
    strings.push(obj)
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      strings.push(...extractJsonStrings(item, depth + 1))
    }
  } else if (obj && typeof obj === "object") {
    for (const value of Object.values(obj)) {
      strings.push(...extractJsonStrings(value, depth + 1))
    }
  }

  return strings
}

/**
 * Strip HTML tags from text
 */
function stripHtmlTags(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/**
 * Normalize whitespace in text
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * Determine file type from path/URL
 */
function getFileTypeFromPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase()

  const typeMap: Record<string, string> = {
    txt: "text",
    json: "json",
    xml: "xml",
    csv: "csv",
    tsv: "tsv",
    html: "html",
    htm: "html",
    md: "markdown",
    markdown: "markdown",
    yml: "yaml",
    yaml: "yaml",
    log: "log",
    ini: "ini",
    cfg: "config",
    conf: "config",
    env: "env",
    gitignore: "gitignore",
    dockerfile: "dockerfile",
  }

  return ext ? typeMap[ext] : undefined
}
