/**
 * Web Crawler Types
 *
 * Types for documentation crawler and link indexing.
 */

import { z } from "zod"

// =============================================================================
// Crawl Configuration
// =============================================================================

export type CrawlStrategy = "single" | "sitemap" | "spider"

export interface CrawlConfig {
  /** Starting URL */
  url: string
  /** Crawl strategy */
  strategy: CrawlStrategy
  /** Maximum pages to crawl (default: 100) */
  maxPages?: number
  /** Maximum depth for spider strategy (default: 2) */
  maxDepth?: number
  /** URL patterns to include (regex strings) */
  includePatterns?: string[]
  /** URL patterns to exclude (regex strings) */
  excludePatterns?: string[]
  /** Concurrent requests (default: 5) */
  concurrency?: number
  /** Request timeout in ms (default: 30000) */
  timeout?: number
  /** Delay between requests in ms (default: 100) */
  requestDelay?: number
  /** Custom headers for requests */
  headers?: Record<string, string>
}

export const crawlConfigSchema = z.object({
  url: z.string().refine((val) => val.startsWith("http"), {
    message: "URL must start with http:// or https://",
  }),
  strategy: z.enum(["single", "sitemap", "spider"]),
  maxPages: z.number().min(1).max(1000).optional().default(100),
  maxDepth: z.number().min(1).max(5).optional().default(2),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  concurrency: z.number().min(1).max(20).optional().default(5),
  timeout: z.number().min(5000).max(120000).optional().default(30000),
  requestDelay: z.number().min(0).max(5000).optional().default(100),
  headers: z.record(z.string(), z.string()).optional(),
})

// =============================================================================
// Crawl Results
// =============================================================================

export interface CrawledPage {
  /** Original URL */
  url: string
  /** Final URL (after redirects) */
  finalUrl: string
  /** Page title */
  title?: string
  /** Extracted text content */
  text: string
  /** Markdown conversion */
  markdown: string
  /** HTTP status code */
  statusCode: number
  /** Content type */
  contentType?: string
  /** Crawl depth from start URL */
  depth: number
  /** Crawl timestamp */
  crawledAt: Date
  /** Page metadata */
  metadata?: {
    description?: string
    author?: string
    siteName?: string
    language?: string
    wordCount?: number
  }
  /** Links found on this page */
  links?: string[]
  /** Processing error if any */
  error?: string
}

export interface CrawlResult {
  /** Crawl job ID */
  jobId: string
  /** Starting URL */
  startUrl: string
  /** Domain being crawled */
  domain: string
  /** Crawl strategy used */
  strategy: CrawlStrategy
  /** Total pages discovered */
  pagesDiscovered: number
  /** Total pages successfully crawled */
  pagesSuccess: number
  /** Total pages failed */
  pagesFailed: number
  /** Total pages skipped (filtered out) */
  pagesSkipped: number
  /** Crawled pages data */
  pages: CrawledPage[]
  /** Failed URLs with errors */
  failures: Array<{ url: string; error: string }>
  /** Sitemap URL if found */
  sitemapUrl?: string
  /** Crawl started at */
  startedAt: Date
  /** Crawl completed at */
  completedAt?: Date
  /** Total duration in ms */
  durationMs?: number
  /** Was the crawl stopped early (max pages reached) */
  truncated: boolean
}

// =============================================================================
// Crawl Progress
// =============================================================================

export interface CrawlProgress {
  /** Crawl job ID */
  jobId: string
  /** Current status */
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  /** Progress percentage (0-100) */
  progress: number
  /** Current URL being crawled */
  currentUrl?: string
  /** Pages discovered so far */
  pagesDiscovered: number
  /** Pages completed (success + failed) */
  pagesCompleted: number
  /** Maximum pages to crawl */
  maxPages: number
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number
  /** Error message if failed */
  error?: string
}

export type CrawlProgressCallback = (progress: CrawlProgress) => void

// =============================================================================
// Sitemap Types
// =============================================================================

export interface SitemapEntry {
  loc: string
  lastmod?: string
  changefreq?: string
  priority?: number
}

export interface SitemapResult {
  /** Sitemap URL */
  url: string
  /** Entries found */
  entries: SitemapEntry[]
  /** Child sitemaps (for sitemap index) */
  childSitemaps?: string[]
  /** Fetch error if any */
  error?: string
}

// =============================================================================
// Default Patterns
// =============================================================================

/** Common patterns to exclude from crawling */
export const DEFAULT_EXCLUDE_PATTERNS = [
  // Assets and media
  /\.(css|js|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|tar|gz)$/i,
  // API and data endpoints
  /\/(api|graphql|webhook|_next|static)\//i,
  // Authentication and user pages
  /\/(login|logout|signup|register|auth|account|settings)\//i,
  // Pagination and filters
  /[?&](page|sort|filter|q)=/i,
  // External links
  /^(mailto:|tel:|javascript:)/i,
  // Social media
  /(twitter|facebook|linkedin|youtube)\.com/i,
  // Common non-doc paths
  /\/(blog|news|press|careers|jobs|pricing|contact)\//i,
]

/** Common documentation path patterns */
export const DOCS_INCLUDE_PATTERNS = [
  /\/docs?\//i,
  /\/documentation\//i,
  /\/guide/i,
  /\/tutorial/i,
  /\/reference/i,
  /\/api-reference/i,
  /\/getting-started/i,
  /\/quickstart/i,
]
