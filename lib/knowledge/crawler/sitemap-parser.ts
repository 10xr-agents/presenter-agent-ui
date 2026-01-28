/**
 * Sitemap Parser
 *
 * Parses sitemap.xml files to discover URLs for documentation sites.
 * Handles both regular sitemaps and sitemap indexes.
 */

import * as Sentry from "@sentry/nextjs"
import * as cheerio from "cheerio"
import type { SitemapEntry, SitemapResult } from "./types"

/**
 * Discover and parse sitemap for a domain
 *
 * @param baseUrl - Base URL of the site (e.g., https://docs.example.com)
 * @returns Sitemap result with URLs
 */
export async function discoverSitemap(baseUrl: string): Promise<SitemapResult | null> {
  const base = new URL(baseUrl)
  const potentialLocations = [
    `${base.origin}/sitemap.xml`,
    `${base.origin}/sitemap_index.xml`,
    `${base.origin}/sitemap-index.xml`,
    `${base.origin}/sitemaps/sitemap.xml`,
    `${base.origin}/docs/sitemap.xml`,
  ]

  // Also check robots.txt for sitemap location
  try {
    const robotsUrl = `${base.origin}/robots.txt`
    const robotsResponse = await fetchWithTimeout(robotsUrl, 10000)

    if (robotsResponse.ok) {
      const robotsText = await robotsResponse.text()
      const sitemapMatch = robotsText.match(/Sitemap:\s*(.+)/gi)

      if (sitemapMatch) {
        for (const match of sitemapMatch) {
          const url = match.replace(/Sitemap:\s*/i, "").trim()
          if (url && !potentialLocations.includes(url)) {
            potentialLocations.unshift(url) // Add to front (highest priority)
          }
        }
      }
    }
  } catch {
    // Ignore robots.txt errors
  }

  // Try each potential location
  for (const sitemapUrl of potentialLocations) {
    try {
      const result = await parseSitemap(sitemapUrl)
      if (result && (result.entries.length > 0 || (result.childSitemaps?.length ?? 0) > 0)) {
        return result
      }
    } catch {
      // Try next location
      continue
    }
  }

  return null
}

/**
 * Parse a sitemap from a URL
 */
export async function parseSitemap(url: string): Promise<SitemapResult> {
  try {
    const response = await fetchWithTimeout(url, 30000)

    if (!response.ok) {
      throw new Error(`Failed to fetch sitemap: ${response.status}`)
    }

    const xml = await response.text()

    // Detect if this is a sitemap index or regular sitemap
    if (xml.includes("<sitemapindex")) {
      return parseSitemapIndex(url, xml)
    }

    return parseSitemapUrls(url, xml)
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "sitemap-parser" },
      extra: { url },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      url,
      entries: [],
      error: errorMessage,
    }
  }
}

/**
 * Parse a sitemap index (contains links to other sitemaps)
 */
function parseSitemapIndex(url: string, xml: string): SitemapResult {
  const $ = cheerio.load(xml, { xmlMode: true })
  const childSitemaps: string[] = []

  $("sitemap loc").each((_, element) => {
    const loc = $(element).text().trim()
    if (loc) {
      childSitemaps.push(loc)
    }
  })

  return {
    url,
    entries: [],
    childSitemaps,
  }
}

/**
 * Parse URL entries from a sitemap
 */
function parseSitemapUrls(url: string, xml: string): SitemapResult {
  const $ = cheerio.load(xml, { xmlMode: true })
  const entries: SitemapEntry[] = []

  $("url").each((_, element) => {
    const $url = $(element)
    const loc = $url.find("loc").text().trim()

    if (loc) {
      const entry: SitemapEntry = { loc }

      const lastmod = $url.find("lastmod").text().trim()
      if (lastmod) entry.lastmod = lastmod

      const changefreq = $url.find("changefreq").text().trim()
      if (changefreq) entry.changefreq = changefreq

      const priority = $url.find("priority").text().trim()
      if (priority) entry.priority = parseFloat(priority)

      entries.push(entry)
    }
  })

  return {
    url,
    entries,
  }
}

/**
 * Recursively fetch all URLs from a sitemap (including child sitemaps)
 */
export async function fetchAllSitemapUrls(
  baseUrl: string,
  maxUrls: number = 1000
): Promise<string[]> {
  const allUrls: string[] = []
  const processedSitemaps = new Set<string>()

  async function processSitemap(sitemapUrl: string): Promise<void> {
    if (processedSitemaps.has(sitemapUrl) || allUrls.length >= maxUrls) {
      return
    }

    processedSitemaps.add(sitemapUrl)

    try {
      const result = await parseSitemap(sitemapUrl)

      // Add URLs from this sitemap
      for (const entry of result.entries) {
        if (allUrls.length >= maxUrls) break
        if (!allUrls.includes(entry.loc)) {
          allUrls.push(entry.loc)
        }
      }

      // Process child sitemaps
      if (result.childSitemaps) {
        for (const childUrl of result.childSitemaps) {
          if (allUrls.length >= maxUrls) break
          await processSitemap(childUrl)
        }
      }
    } catch {
      // Skip failed sitemaps
    }
  }

  // Start with discovery
  const sitemap = await discoverSitemap(baseUrl)

  if (sitemap) {
    // Add direct entries
    for (const entry of sitemap.entries) {
      if (allUrls.length >= maxUrls) break
      allUrls.push(entry.loc)
    }

    // Process child sitemaps
    if (sitemap.childSitemaps) {
      for (const childUrl of sitemap.childSitemaps) {
        if (allUrls.length >= maxUrls) break
        await processSitemap(childUrl)
      }
    }
  }

  return allUrls
}

/**
 * Filter sitemap URLs to only include documentation pages
 */
export function filterDocsUrls(
  urls: string[],
  baseUrl: string,
  includePatterns?: RegExp[],
  excludePatterns?: RegExp[]
): string[] {
  const base = new URL(baseUrl)

  return urls.filter((url) => {
    try {
      const parsed = new URL(url)

      // Must be same origin
      if (parsed.origin !== base.origin) {
        return false
      }

      // Check exclude patterns
      if (excludePatterns) {
        for (const pattern of excludePatterns) {
          if (pattern.test(url)) {
            return false
          }
        }
      }

      // Check include patterns (if specified, URL must match at least one)
      if (includePatterns && includePatterns.length > 0) {
        return includePatterns.some((pattern) => pattern.test(url))
      }

      return true
    } catch {
      return false
    }
  })
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KnowledgeBot/1.0)",
        Accept: "application/xml,text/xml,*/*",
      },
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}
