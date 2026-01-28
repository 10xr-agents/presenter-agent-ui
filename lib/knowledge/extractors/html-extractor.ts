/**
 * HTML Text Extractor
 *
 * Uses Cheerio for parsing, Readability for content extraction,
 * and Turndown for HTML-to-Markdown conversion.
 *
 * This is the core of "Cursor-style" documentation indexing.
 */

import { Readability } from "@mozilla/readability"
import * as Sentry from "@sentry/nextjs"
import * as cheerio from "cheerio"
import { parseHTML } from "linkedom"
import TurndownService from "turndown"

export interface HtmlExtractionResult {
  /** Plain text content */
  text: string
  /** Markdown conversion */
  markdown: string
  /** Cleaned HTML (after Readability) */
  cleanHtml?: string
  /** Page metadata */
  metadata?: {
    title?: string
    description?: string
    author?: string
    publishedTime?: string
    siteName?: string
    url?: string
    language?: string
    wordCount?: number
    links?: Array<{ href: string; text: string }>
  }
}

export interface HtmlExtractionOptions {
  /** URL for relative link resolution */
  baseUrl?: string
  /** Keep the cleaned HTML */
  includeCleanHtml?: boolean
  /** Custom selectors to remove (in addition to defaults) */
  removeSelectors?: string[]
  /** Only extract content from these selectors (if found) */
  contentSelectors?: string[]
  /** Extract links */
  extractLinks?: boolean
  /** Maximum text length (0 = no limit) */
  maxLength?: number
}

// Default selectors to remove (navigation, ads, etc.)
const DEFAULT_REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "header:not(article header)",
  "footer:not(article footer)",
  ".sidebar",
  ".navigation",
  ".nav",
  ".menu",
  ".advertisement",
  ".ad",
  ".ads",
  ".social-share",
  ".share-buttons",
  ".comments",
  ".comment-section",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[data-testid='header']",
  "[data-testid='footer']",
  "[data-testid='sidebar']",
]

// Common documentation content selectors
const DOCS_CONTENT_SELECTORS = [
  "main",
  "article",
  ".content",
  ".documentation",
  ".docs-content",
  ".markdown-body",
  ".prose",
  "[role='main']",
  "#content",
  "#main-content",
  ".main-content",
]

/**
 * Extract text and markdown from HTML content
 *
 * @param source - URL or raw HTML string
 * @param options - Extraction options
 * @returns Extracted content in multiple formats
 */
export async function extractHtmlContent(
  source: string,
  options: HtmlExtractionOptions = {}
): Promise<HtmlExtractionResult> {
  try {
    let html: string
    let resolvedUrl: string | undefined = options.baseUrl

    // Fetch HTML if URL provided
    if (source.startsWith("http://") || source.startsWith("https://")) {
      resolvedUrl = source
      const response = await fetch(source, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; KnowledgeBot/1.0)",
          "Accept": "text/html,application/xhtml+xml",
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch HTML: ${response.status} ${response.statusText}`)
      }

      html = await response.text()
    } else {
      html = source
    }

    // Step 1: Pre-process with Cheerio (remove noise)
    const $ = cheerio.load(html)

    // Remove default unwanted elements
    const selectorsToRemove = [
      ...DEFAULT_REMOVE_SELECTORS,
      ...(options.removeSelectors || []),
    ]

    for (const selector of selectorsToRemove) {
      try {
        $(selector).remove()
      } catch {
        // Ignore invalid selectors
      }
    }

    // Extract metadata before Readability processing
    const metadata = extractMetadata($, resolvedUrl)

    // Try to find main content area
    let contentHtml = $.html()

    if (options.contentSelectors && options.contentSelectors.length > 0) {
      for (const selector of options.contentSelectors) {
        const content = $(selector).first()
        if (content.length > 0) {
          contentHtml = content.html() || contentHtml
          break
        }
      }
    } else {
      // Try common documentation selectors
      for (const selector of DOCS_CONTENT_SELECTORS) {
        const content = $(selector).first()
        if (content.length > 0 && (content.text()?.length || 0) > 100) {
          contentHtml = content.html() || contentHtml
          break
        }
      }
    }

    // Step 2: Use Readability for intelligent content extraction
    const { document } = parseHTML(`<!DOCTYPE html><html><body>${contentHtml}</body></html>`)

    const reader = new Readability(document, {
      charThreshold: 100,
    })

    const article = reader.parse()

    let cleanHtml: string
    let textContent: string

    if (article && article.content) {
      cleanHtml = article.content
      textContent = article.textContent || ""

      // Update metadata from Readability
      if (metadata) {
        if (article.title && !metadata.title) {
          metadata.title = article.title
        }
        if (article.byline && !metadata.author) {
          metadata.author = article.byline
        }
        if (article.siteName && !metadata.siteName) {
          metadata.siteName = article.siteName
        }
      }
    } else {
      // Fallback to Cheerio extraction
      cleanHtml = contentHtml
      textContent = $.text()
    }

    // Step 3: Convert to Markdown using Turndown
    const turndownService = createTurndownService(resolvedUrl)
    let markdown = turndownService.turndown(cleanHtml)

    // Clean up markdown
    markdown = cleanMarkdown(markdown)

    // Clean up text
    textContent = cleanText(textContent)

    // Apply length limit if specified
    if (options.maxLength && options.maxLength > 0) {
      if (textContent.length > options.maxLength) {
        textContent = textContent.substring(0, options.maxLength)
      }
      if (markdown.length > options.maxLength) {
        markdown = markdown.substring(0, options.maxLength)
      }
    }

    // Extract links if requested
    if (options.extractLinks && metadata) {
      const links = extractLinks($, resolvedUrl)
      metadata.links = links
    }

    // Calculate word count
    if (metadata) {
      metadata.wordCount = textContent.split(/\s+/).filter((w) => w.length > 0).length
    }

    const result: HtmlExtractionResult = {
      text: textContent,
      markdown,
      metadata,
    }

    if (options.includeCleanHtml) {
      result.cleanHtml = cleanHtml
    }

    return result
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "html-extractor" },
      extra: { source: source.substring(0, 100) },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to extract HTML content: ${errorMessage}`)
  }
}

/**
 * Create a configured Turndown service
 */
function createTurndownService(baseUrl?: string): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
  })

  // Preserve code blocks with language hints
  turndownService.addRule("codeBlock", {
    filter: (node) => {
      return (
        node.nodeName === "PRE" &&
        node.firstChild?.nodeName === "CODE"
      )
    },
    replacement: (content, node) => {
      const codeElement = node.firstChild as HTMLElement
      const className = codeElement?.className || ""
      const langMatch = className.match(/language-(\w+)/)
      const lang = langMatch?.[1] || ""

      // Get raw text content
      const code = codeElement?.textContent || content
      return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`
    },
  })

  // Handle tables better
  turndownService.addRule("table", {
    filter: "table",
    replacement: (content, node) => {
      // Try to create a markdown table
      const table = node as HTMLTableElement
      const rows = Array.from(table.querySelectorAll("tr"))

      if (rows.length === 0) return content

      const markdownRows: string[] = []

      rows.forEach((row, index) => {
        const cells = Array.from(row.querySelectorAll("th, td"))
        const cellTexts = cells.map((cell) =>
          (cell.textContent || "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim()
        )

        markdownRows.push(`| ${cellTexts.join(" | ")} |`)

        // Add separator after header row
        if (index === 0) {
          markdownRows.push(`| ${cells.map(() => "---").join(" | ")} |`)
        }
      })

      return `\n\n${markdownRows.join("\n")}\n\n`
    },
  })

  // Convert relative URLs to absolute
  if (baseUrl) {
    turndownService.addRule("absoluteLinks", {
      filter: ["a"],
      replacement: (content, node) => {
        const element = node as HTMLAnchorElement
        let href = element.getAttribute("href") || ""

        if (href && !href.startsWith("http") && !href.startsWith("mailto:") && !href.startsWith("#")) {
          try {
            href = new URL(href, baseUrl).toString()
          } catch {
            // Keep original if URL parsing fails
          }
        }

        const title = element.getAttribute("title")
        if (title) {
          return `[${content}](${href} "${title}")`
        }
        return `[${content}](${href})`
      },
    })

    turndownService.addRule("absoluteImages", {
      filter: ["img"],
      replacement: (content, node) => {
        const element = node as HTMLImageElement
        let src = element.getAttribute("src") || ""
        const alt = element.getAttribute("alt") || ""

        if (src && !src.startsWith("http") && !src.startsWith("data:")) {
          try {
            src = new URL(src, baseUrl).toString()
          } catch {
            // Keep original if URL parsing fails
          }
        }

        return src ? `![${alt}](${src})` : ""
      },
    })
  }

  return turndownService
}

/**
 * Extract metadata from HTML
 */
function extractMetadata(
  $: cheerio.CheerioAPI,
  url?: string
): HtmlExtractionResult["metadata"] {
  const metadata: HtmlExtractionResult["metadata"] = {}

  // Title
  metadata.title =
    $('meta[property="og:title"]').attr("content") ||
    $('meta[name="twitter:title"]').attr("content") ||
    $("title").text() ||
    $("h1").first().text()

  // Description
  metadata.description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    $('meta[name="twitter:description"]').attr("content")

  // Author
  metadata.author =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content")

  // Published time
  metadata.publishedTime =
    $('meta[property="article:published_time"]').attr("content") ||
    $('meta[name="date"]').attr("content") ||
    $("time").first().attr("datetime")

  // Site name
  metadata.siteName = $('meta[property="og:site_name"]').attr("content")

  // URL
  metadata.url =
    url ||
    $('meta[property="og:url"]').attr("content") ||
    $('link[rel="canonical"]').attr("href")

  // Language
  metadata.language =
    $("html").attr("lang") ||
    $('meta[property="og:locale"]').attr("content")

  // Clean up
  if (metadata.title) metadata.title = metadata.title.trim()
  if (metadata.description) metadata.description = metadata.description.trim()
  if (metadata.author) metadata.author = metadata.author.trim()
  if (metadata.siteName) metadata.siteName = metadata.siteName.trim()

  return metadata
}

/**
 * Extract links from HTML
 */
function extractLinks(
  $: cheerio.CheerioAPI,
  baseUrl?: string
): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = []
  const seen = new Set<string>()

  $("a[href]").each((_, element) => {
    let href = $(element).attr("href") || ""
    const text = $(element).text().trim()

    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      return
    }

    // Convert to absolute URL
    if (baseUrl && !href.startsWith("http") && !href.startsWith("mailto:")) {
      try {
        href = new URL(href, baseUrl).toString()
      } catch {
        return
      }
    }

    // Deduplicate
    if (seen.has(href)) return
    seen.add(href)

    if (text && text.length > 0) {
      links.push({ href, text })
    }
  })

  return links
}

/**
 * Clean up markdown output
 */
function cleanMarkdown(markdown: string): string {
  return markdown
    // Remove excessive newlines
    .replace(/\n{4,}/g, "\n\n\n")
    // Remove trailing whitespace from lines
    .replace(/ +\n/g, "\n")
    // Remove leading/trailing whitespace
    .trim()
}

/**
 * Clean up text output
 */
function cleanText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, " ")
    // Remove multiple spaces
    .replace(/ {2,}/g, " ")
    // Trim
    .trim()
}

/**
 * Quick extraction - just get plain text from HTML
 * Useful for simple cases where you don't need markdown
 */
export async function extractHtmlText(source: string): Promise<string> {
  const result = await extractHtmlContent(source, {
    extractLinks: false,
    includeCleanHtml: false,
  })
  return result.text
}

/**
 * Extract and convert HTML to clean markdown
 * This is the primary function for documentation indexing
 */
export async function htmlToMarkdown(
  source: string,
  baseUrl?: string
): Promise<{ markdown: string; title?: string }> {
  const result = await extractHtmlContent(source, {
    baseUrl,
    extractLinks: false,
    includeCleanHtml: false,
  })
  return {
    markdown: result.markdown,
    title: result.metadata?.title,
  }
}
