/**
 * Crawler Module Exports
 *
 * Web crawling for documentation indexing.
 */

// Types
export type {
  CrawlStrategy,
  CrawlConfig,
  CrawledPage,
  CrawlResult,
  CrawlProgress,
  CrawlProgressCallback,
  SitemapEntry,
  SitemapResult,
} from "./types"

export {
  crawlConfigSchema,
  DEFAULT_EXCLUDE_PATTERNS,
  DOCS_INCLUDE_PATTERNS,
} from "./types"

// Sitemap Parser
export {
  discoverSitemap,
  parseSitemap,
  fetchAllSitemapUrls,
  filterDocsUrls,
} from "./sitemap-parser"

// Crawler Service
export {
  crawlWebsite,
  crawlSinglePage,
  crawlDocumentation,
  spiderWebsite,
} from "./crawler-service"
