/**
 * Markdown Text Extractor
 *
 * Processes markdown files to extract plain text and metadata.
 * Uses marked for parsing and handles frontmatter.
 */

import * as Sentry from "@sentry/nextjs"
import { marked } from "marked"

export interface MarkdownExtractionResult {
  text: string
  html?: string
  frontmatter?: Record<string, unknown>
  metadata?: {
    title?: string
    headings?: Array<{ level: number; text: string }>
    links?: Array<{ href: string; text: string }>
    codeBlocks?: number
    wordCount?: number
  }
}

export interface MarkdownExtractionOptions {
  /** Also return HTML version */
  includeHtml?: boolean
  /** Parse YAML frontmatter */
  parseFrontmatter?: boolean
  /** Extract structural metadata */
  extractMetadata?: boolean
}

/**
 * Extract text from a Markdown file
 *
 * @param source - URL, file path, or raw markdown string
 * @param options - Extraction options
 * @returns Extracted text and optional metadata
 */
export async function extractMarkdownText(
  source: string,
  options: MarkdownExtractionOptions = {}
): Promise<MarkdownExtractionResult> {
  try {
    let markdown: string

    if (source.startsWith("http://") || source.startsWith("https://")) {
      // Fetch from URL
      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(`Failed to fetch Markdown: ${response.status} ${response.statusText}`)
      }
      markdown = await response.text()
    } else if (source.includes("\n") || source.length > 500) {
      // Likely raw markdown content
      markdown = source
    } else {
      // Assume it's a file path
      try {
        const fs = await import("fs/promises")
        markdown = await fs.readFile(source, "utf-8")
      } catch {
        // If file read fails, treat as raw markdown
        markdown = source
      }
    }

    const result: MarkdownExtractionResult = {
      text: "",
    }

    // Parse frontmatter if requested
    if (options.parseFrontmatter !== false) {
      const { content, frontmatter } = parseFrontmatter(markdown)
      markdown = content
      if (Object.keys(frontmatter).length > 0) {
        result.frontmatter = frontmatter
      }
    }

    // Convert to HTML if requested
    if (options.includeHtml) {
      result.html = await marked.parse(markdown)
    }

    // Extract plain text
    result.text = markdownToPlainText(markdown)

    // Extract metadata if requested
    if (options.extractMetadata) {
      result.metadata = extractMarkdownMetadata(markdown, result.text)
    }

    return result
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "markdown-extractor" },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract Markdown text: ${errorMessage}`)
  }
}

/**
 * Parse YAML frontmatter from markdown
 */
function parseFrontmatter(markdown: string): {
  content: string
  frontmatter: Record<string, unknown>
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = markdown.match(frontmatterRegex)

  if (!match || !match[1]) {
    return { content: markdown, frontmatter: {} }
  }

  try {
    // Simple YAML parsing for common frontmatter patterns
    const frontmatter: Record<string, unknown> = {}
    const lines = match[1].split("\n")

    for (const line of lines) {
      const colonIndex = line.indexOf(":")
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim()
        let value: string | boolean | number = line.substring(colonIndex + 1).trim()

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }

        // Parse booleans
        if (value === "true") value = true as unknown as string
        else if (value === "false") value = false as unknown as string
        // Parse numbers
        else if (!isNaN(Number(value)) && value !== "") value = Number(value) as unknown as string

        frontmatter[key] = value
      }
    }

    const content = markdown.substring(match[0].length)
    return { content, frontmatter }
  } catch {
    // If parsing fails, return original content
    return { content: markdown, frontmatter: {} }
  }
}

/**
 * Convert markdown to plain text
 * Removes markdown syntax while preserving content
 */
function markdownToPlainText(markdown: string): string {
  let text = markdown

  // Remove code blocks first (to avoid processing code as markdown)
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    const lines = match.split("\n")
    // Remove first and last lines (the ```)
    return lines.slice(1, -1).join("\n")
  })

  // Remove inline code
  text = text.replace(/`([^`]+)`/g, "$1")

  // Remove headers (keep content)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, "$1")

  // Remove bold/italic markers
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "$1")
  text = text.replace(/\*\*(.+?)\*\*/g, "$1")
  text = text.replace(/\*(.+?)\*/g, "$1")
  text = text.replace(/___(.+?)___/g, "$1")
  text = text.replace(/__(.+?)__/g, "$1")
  text = text.replace(/_(.+?)_/g, "$1")

  // Remove strikethrough
  text = text.replace(/~~(.+?)~~/g, "$1")

  // Convert links to just text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

  // Remove images (or convert to alt text)
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")

  // Remove horizontal rules
  text = text.replace(/^[-*_]{3,}$/gm, "")

  // Remove blockquote markers
  text = text.replace(/^>\s?/gm, "")

  // Remove list markers
  text = text.replace(/^[\s]*[-*+]\s+/gm, "")
  text = text.replace(/^[\s]*\d+\.\s+/gm, "")

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, "")

  // Collapse multiple newlines
  text = text.replace(/\n{3,}/g, "\n\n")

  // Trim whitespace
  text = text.trim()

  return text
}

/**
 * Extract structural metadata from markdown
 */
function extractMarkdownMetadata(
  markdown: string,
  plainText: string
): MarkdownExtractionResult["metadata"] {
  const metadata: MarkdownExtractionResult["metadata"] = {}

  // Extract headings
  const headings: Array<{ level: number; text: string }> = []
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  let match
  while ((match = headingRegex.exec(markdown)) !== null) {
    if (match[1] && match[2]) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
      })
    }
  }
  if (headings.length > 0) {
    metadata.headings = headings
    // First h1 is likely the title
    const h1 = headings.find((h) => h.level === 1)
    if (h1) {
      metadata.title = h1.text
    }
  }

  // Extract links
  const links: Array<{ href: string; text: string }> = []
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  while ((match = linkRegex.exec(markdown)) !== null) {
    if (match[1] && match[2]) {
      links.push({
        text: match[1],
        href: match[2],
      })
    }
  }
  if (links.length > 0) {
    metadata.links = links
  }

  // Count code blocks
  const codeBlockMatches = markdown.match(/```[\s\S]*?```/g)
  if (codeBlockMatches) {
    metadata.codeBlocks = codeBlockMatches.length
  }

  // Word count
  const words = plainText.split(/\s+/).filter((w) => w.length > 0)
  metadata.wordCount = words.length

  return metadata
}
