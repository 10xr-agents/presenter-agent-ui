/**
 * Documentation Crawler Service
 *
 * Uses Crawlee for robust web crawling with anti-blocking features.
 * Supports single page, sitemap-based, and spider crawling strategies.
 */

// Import only cheerio crawler to avoid puppeteer dependency
import { CheerioCrawler, Configuration, RequestQueue } from "@crawlee/cheerio"
import * as Sentry from "@sentry/nextjs"
import { v4 as uuidv4 } from "uuid"
import { discoverSitemap, fetchAllSitemapUrls, filterDocsUrls } from "./sitemap-parser"
import {
  type CrawlConfig,
  type CrawledPage,
  type CrawlProgress,
  type CrawlProgressCallback,
  type CrawlResult,
  DEFAULT_EXCLUDE_PATTERNS,
} from "./types"
import { extractHtmlContent } from "../extractors/html-extractor"

// =============================================================================
// Crawler Service
// =============================================================================

/**
 * Crawl a website and extract documentation content
 */
export async function crawlWebsite(
  config: CrawlConfig,
  onProgress?: CrawlProgressCallback
): Promise<CrawlResult> {
  const jobId = uuidv4()
  const startedAt = new Date()

  // Parse base URL
  const baseUrl = new URL(config.url)
  const domain = baseUrl.hostname

  // Initialize result
  const result: CrawlResult = {
    jobId,
    startUrl: config.url,
    domain,
    strategy: config.strategy,
    pagesDiscovered: 0,
    pagesSuccess: 0,
    pagesFailed: 0,
    pagesSkipped: 0,
    pages: [],
    failures: [],
    startedAt,
    truncated: false,
  }

  // Track progress
  const updateProgress = (
    status: CrawlProgress["status"],
    currentUrl?: string
  ): void => {
    if (onProgress) {
      const completed = result.pagesSuccess + result.pagesFailed
      const progress = result.pagesDiscovered > 0
        ? Math.round((completed / Math.min(result.pagesDiscovered, config.maxPages || 100)) * 100)
        : 0

      onProgress({
        jobId,
        status,
        progress,
        currentUrl,
        pagesDiscovered: result.pagesDiscovered,
        pagesCompleted: completed,
        maxPages: config.maxPages || 100,
      })
    }
  }

  try {
    updateProgress("running")

    // Determine URLs to crawl based on strategy
    let urlsToCrawl: string[] = []

    switch (config.strategy) {
      case "single":
        urlsToCrawl = [config.url]
        break

      case "sitemap": {
        updateProgress("running", "Discovering sitemap...")

        const sitemap = await discoverSitemap(config.url)
        if (sitemap && sitemap.entries.length > 0) {
          result.sitemapUrl = sitemap.url
          urlsToCrawl = sitemap.entries.map((e) => e.loc)
        } else if (sitemap?.childSitemaps) {
          result.sitemapUrl = sitemap.url
          urlsToCrawl = await fetchAllSitemapUrls(config.url, config.maxPages || 100)
        }

        // Filter URLs
        const includePatterns = config.includePatterns?.map((p) => new RegExp(p, "i"))
        const excludePatterns = [
          ...DEFAULT_EXCLUDE_PATTERNS,
          ...(config.excludePatterns?.map((p) => new RegExp(p, "i")) || []),
        ]

        urlsToCrawl = filterDocsUrls(urlsToCrawl, config.url, includePatterns, excludePatterns)

        if (urlsToCrawl.length === 0) {
          // No sitemap found, fall back to single page
          Sentry.logger.warn("No sitemap found, falling back to single page", { url: config.url })
          urlsToCrawl = [config.url]
        }
        break
      }

      case "spider":
        // Spider will discover URLs during crawl
        urlsToCrawl = [config.url]
        break
    }

    result.pagesDiscovered = urlsToCrawl.length

    // Limit pages
    const maxPages = config.maxPages || 100
    if (urlsToCrawl.length > maxPages) {
      urlsToCrawl = urlsToCrawl.slice(0, maxPages)
      result.truncated = true
    }

    // Run the crawler
    await runCrawler(config, urlsToCrawl, result, updateProgress)

    // Finalize result
    result.completedAt = new Date()
    result.durationMs = result.completedAt.getTime() - startedAt.getTime()

    updateProgress("completed")

    return result
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "crawler-service" },
      extra: { config },
    })

    result.completedAt = new Date()
    result.durationMs = result.completedAt.getTime() - startedAt.getTime()

    updateProgress("failed")

    throw error
  }
}

/**
 * Run the Crawlee crawler
 */
async function runCrawler(
  config: CrawlConfig,
  initialUrls: string[],
  result: CrawlResult,
  updateProgress: (status: CrawlProgress["status"], currentUrl?: string) => void
): Promise<void> {
  const baseUrl = new URL(config.url)
  const maxPages = config.maxPages || 100
  const visitedUrls = new Set<string>()

  // Build exclude patterns
  const excludePatterns = [
    ...DEFAULT_EXCLUDE_PATTERNS,
    ...(config.excludePatterns?.map((p) => new RegExp(p, "i")) || []),
  ]

  // Build include patterns
  const includePatterns = config.includePatterns?.map((p) => new RegExp(p, "i"))

  // Create in-memory request queue
  const requestQueue = await RequestQueue.open(result.jobId)

  // Add initial URLs
  for (const url of initialUrls) {
    await requestQueue.addRequest({ url, userData: { depth: 0 } })
  }

  // Configure Crawlee to use in-memory storage
  const crawlerConfig = new Configuration({
    persistStorage: false,
    purgeOnStart: true,
  })

  // Create crawler
  const crawler = new CheerioCrawler(
    {
      requestQueue,
      maxConcurrency: config.concurrency || 5,
      requestHandlerTimeoutSecs: (config.timeout || 30000) / 1000,
      maxRequestRetries: 2,
      navigationTimeoutSecs: (config.timeout || 30000) / 1000,

      // Optional delay between requests
      minConcurrency: 1,

      async requestHandler({ request, $, response }) {
        const url = request.url
        const depth = (request.userData?.depth as number) || 0

        // Check if we've hit the limit
        if (result.pagesSuccess + result.pagesFailed >= maxPages) {
          result.truncated = true
          return
        }

        // Skip if already visited
        if (visitedUrls.has(url)) {
          result.pagesSkipped++
          return
        }
        visitedUrls.add(url)

        updateProgress("running", url)

        try {
          // Get the HTML content
          const html = $.html()

          // Extract content using our HTML extractor
          const extracted = await extractHtmlContent(html, {
            baseUrl: url,
            extractLinks: config.strategy === "spider",
          })

          // Create page result
          const page: CrawledPage = {
            url: request.url,
            finalUrl: response?.url || request.url,
            title: extracted.metadata?.title,
            text: extracted.text,
            markdown: extracted.markdown,
            statusCode: response?.statusCode || 200,
            contentType: response?.headers?.["content-type"] as string,
            depth,
            crawledAt: new Date(),
            metadata: {
              description: extracted.metadata?.description,
              author: extracted.metadata?.author,
              siteName: extracted.metadata?.siteName,
              language: extracted.metadata?.language,
              wordCount: extracted.metadata?.wordCount,
            },
          }

          // Spider mode: discover and enqueue new links
          if (config.strategy === "spider" && depth < (config.maxDepth || 2)) {
            const links = extracted.metadata?.links || []
            page.links = links.map((l) => l.href)

            for (const link of links) {
              try {
                const linkUrl = new URL(link.href)

                // Only follow same-origin links
                if (linkUrl.origin !== baseUrl.origin) continue

                // Skip if already visited
                if (visitedUrls.has(link.href)) continue

                // Check exclude patterns
                let excluded = false
                for (const pattern of excludePatterns) {
                  if (pattern.test(link.href)) {
                    excluded = true
                    break
                  }
                }
                if (excluded) continue

                // Check include patterns (if specified)
                if (includePatterns && includePatterns.length > 0) {
                  const included = includePatterns.some((p) => p.test(link.href))
                  if (!included) continue
                }

                // Add to queue
                await requestQueue.addRequest({
                  url: link.href,
                  userData: { depth: depth + 1 },
                })
                result.pagesDiscovered++
              } catch {
                // Invalid URL, skip
              }
            }
          }

          result.pages.push(page)
          result.pagesSuccess++
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          result.failures.push({ url, error: errorMessage })
          result.pagesFailed++
        }
      },

      async failedRequestHandler({ request }, error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        result.failures.push({ url: request.url, error: errorMessage })
        result.pagesFailed++
      },
    },
    crawlerConfig
  )

  // Run crawler
  await crawler.run()

  // Cleanup
  await requestQueue.drop()
}

/**
 * Crawl a single URL (convenience function)
 */
export async function crawlSinglePage(url: string): Promise<CrawledPage | null> {
  const result = await crawlWebsite({
    url,
    strategy: "single",
    maxPages: 1,
  })

  return result.pages[0] || null
}

/**
 * Crawl documentation using sitemap (convenience function)
 */
export async function crawlDocumentation(
  url: string,
  options: {
    maxPages?: number
    onProgress?: CrawlProgressCallback
  } = {}
): Promise<CrawlResult> {
  return crawlWebsite(
    {
      url,
      strategy: "sitemap",
      maxPages: options.maxPages || 100,
    },
    options.onProgress
  )
}

/**
 * Spider crawl a website (convenience function)
 */
export async function spiderWebsite(
  url: string,
  options: {
    maxPages?: number
    maxDepth?: number
    onProgress?: CrawlProgressCallback
  } = {}
): Promise<CrawlResult> {
  return crawlWebsite(
    {
      url,
      strategy: "spider",
      maxPages: options.maxPages || 50,
      maxDepth: options.maxDepth || 2,
    },
    options.onProgress
  )
}
