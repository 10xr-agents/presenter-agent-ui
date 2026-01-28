import * as Sentry from "@sentry/nextjs"
import axios from "axios"
import { OpenAI } from "openai"
import { getRAGChunks } from "@/lib/knowledge-extraction/rag-helper"

/**
 * Web Search Module (Task 1)
 *
 * Performs web search to understand how to complete tasks.
 * Uses Option C: Checks RAG knowledge first, only searches if knowledge is insufficient.
 * 
 * Search Provider: Tavily API (AI-native, domain-restricted)
 * 
 * Domain Restriction: Search results are restricted to the domain from the API call URL.
 * This ensures we only get relevant results from the website the user is working on.
 */

/**
 * Web search result structure
 */
export type WebSearchResult = {
  searchQuery: string // The query used for search
  results: Array<{
    title: string
    url: string
    snippet: string // Brief summary from search result
    relevanceScore?: number // Optional relevance score (0-1)
  }>
  summary: string // LLM-generated summary of search results
  timestamp: Date
}

/**
 * Web search options
 */
export interface WebSearchOptions {
  strictDomainFilter?: boolean // Default: true, filter results to domain from URL
  allowDomainExpansion?: boolean // Default: false, if true, retry without filter if results poor
}

/**
 * Performs web search using a refined query (from reasoning engine).
 * 
 * This is the new implementation that accepts refined queries instead of
 * hardcoded "how to" formatting. The reasoning engine should call this
 * with a well-crafted search query.
 *
 * @param refinedQuery - Refined search query from reasoning engine (e.g., "How to register new patient OpenEMR 7.0")
 * @param url - Current page URL (for context and domain restriction)
 * @param tenantId - Tenant ID (for logging)
 * @param options - Search options (domain filtering behavior)
 * @returns Search results with relevant information, or null if search skipped/failed
 */
export async function performWebSearch(
  refinedQuery: string,
  url: string,
  tenantId: string,
  options?: WebSearchOptions
): Promise<WebSearchResult | null> {
  const { strictDomainFilter = true, allowDomainExpansion = false } = options || {}

  try {
    // Perform web search with refined query
    const result = await performTavilySearch(refinedQuery, url, {
      strictDomainFilter,
      allowDomainExpansion,
    })

    if (result) {
      console.log(`[Web Search] Search completed with refined query: ${refinedQuery}`)
    } else {
      console.log(`[Web Search] Search returned no results for query: ${refinedQuery}`)
    }

    return result
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "web-search", operation: "performWebSearch" },
      extra: { refinedQuery, url, tenantId },
    })
    console.error("[Web Search] Error during web search:", error)
    return null // Return null to indicate search was skipped/failed
  }
}

/**
 * Performs web search using Tavily API (AI-native, domain-restricted).
 * Search results can be restricted to the domain from the URL parameter.
 *
 * @param refinedQuery - Refined search query (not raw user input)
 * @param url - Current page URL (for context and domain restriction)
 * @param options - Search options (domain filtering behavior)
 * @returns Search results with relevant information, or null if search failed
 */
async function performTavilySearch(
  refinedQuery: string,
  url: string,
  options?: { strictDomainFilter?: boolean; allowDomainExpansion?: boolean }
): Promise<WebSearchResult | null> {
  const { strictDomainFilter = true, allowDomainExpansion = false } = options || {}
  const tavilyApiKey = process.env.TAVILY_API_KEY

  if (!tavilyApiKey) {
    console.log("[Web Search] Tavily API key not configured, skipping search")
    return null
  }

  try {
    // First attempt: with domain filter if enabled
    let result = await performTavilyAPI(refinedQuery, url, tavilyApiKey, strictDomainFilter)

    // If domain expansion is allowed and we got poor results, retry without filter
    if (allowDomainExpansion && strictDomainFilter && result && result.results.length < 3) {
      console.log(
        `[Web Search] Few results with domain filter (${result.results.length}), retrying without filter`
      )
      const expandedResult = await performTavilyAPI(refinedQuery, url, tavilyApiKey, false)
      if (expandedResult && expandedResult.results.length > result.results.length) {
        console.log(
          `[Web Search] Expanded search found ${expandedResult.results.length} results (vs ${result.results.length} with filter)`
        )
        result = expandedResult
      }
    }

    return result
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "web-search", operation: "performTavilySearch" },
      extra: { refinedQuery, url },
    })
    console.error("[Web Search] Tavily search failed:", error)
    return null
  }
}

/**
 * Performs web search using Tavily API (AI-native search for agents).
 * Search results can be restricted to the domain from the URL parameter.
 *
 * @param refinedQuery - Refined search query (from reasoning engine, not raw user input)
 * @param url - Current page URL (for context and domain restriction)
 * @param apiKey - Tavily API key
 * @param strictDomainFilter - Whether to filter results to the domain from URL (default: true)
 * @returns Search results with relevant information, or null if search failed
 */
async function performTavilyAPI(
  refinedQuery: string,
  url: string,
  apiKey: string,
  strictDomainFilter: boolean = true
): Promise<WebSearchResult | null> {
  try {
    // Extract domain from URL for restriction (if enabled)
    let baseDomain: string | null = null
    if (strictDomainFilter) {
      const urlObj = new URL(url)
      const domain = urlObj.hostname
      baseDomain = domain.replace(/^www\./, "") // Remove www. prefix if present
    }

    // Use the refined query directly (no hardcoded "how to" formatting)
    const searchQuery = refinedQuery

    // Call Tavily Search API
    const response = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: apiKey,
        query: searchQuery,
        search_depth: "basic", // "basic" or "advanced"
        include_answer: true, // Include AI-generated answer
        include_raw_content: false, // Don't include full page content
        max_results: 10, // Get more results to filter by domain
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      }
    )

    const data = response.data

    if (!data.results || data.results.length === 0) {
      console.log("[Web Search] No Tavily search results found")
      return null
    }

    // Filter results by domain if strict filtering is enabled
    let filteredResults = data.results
    if (strictDomainFilter && baseDomain) {
      filteredResults = data.results.filter((item: any) => {
        if (!item.url) return false
        try {
          const resultUrl = new URL(item.url)
          const resultDomain = resultUrl.hostname.replace(/^www\./, "")
          // Match exact domain or subdomain
          return resultDomain === baseDomain || resultDomain.endsWith(`.${baseDomain}`)
        } catch {
          // If URL parsing fails, check if URL contains the domain
          return item.url.includes(baseDomain)
        }
      })

      if (filteredResults.length === 0) {
        console.log(`[Web Search] No results found for domain: ${baseDomain}`)
        return null
      }
    }

    // Limit to top 5 results
    const limitedResults = filteredResults.slice(0, 5)

    // Map Tavily results to our format
    const results = limitedResults.map((item: any) => ({
      title: item.title || "",
      url: item.url || "",
      snippet: item.content || item.snippet || "", // Tavily provides content directly
    }))

    // Use Tavily's AI-generated answer if available, otherwise generate summary
    const summary = data.answer
      ? data.answer
      : await generateSearchSummary(refinedQuery, results)

    const domainInfo = strictDomainFilter && baseDomain ? ` for domain: ${baseDomain}` : ""
    console.log(`[Web Search] Found ${results.length} results${domainInfo}`)

    return {
      searchQuery,
      results,
      summary,
      timestamp: new Date(),
    }
  } catch (error: unknown) {
    // Handle specific error cases
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error("[Web Search] Tavily API key invalid or unauthorized")
      } else if (error.response?.status === 429) {
        console.error("[Web Search] Tavily API rate limit exceeded")
      } else {
        console.error("[Web Search] Tavily API error:", error.message)
      }
    } else {
      console.error("[Web Search] Unexpected error during Tavily search:", error)
    }

    Sentry.captureException(error, {
      tags: { component: "web-search", operation: "performTavilyAPI" },
      extra: { refinedQuery, url, hasApiKey: !!apiKey },
    })

    throw error
  }
}


/**
 * Generates a summary of search results using LLM.
 *
 * @param query - Original user query
 * @param results - Search results to summarize
 * @returns LLM-generated summary
 */
async function generateSearchSummary(
  query: string,
  results: Array<{ title: string; url: string; snippet: string }>
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    // If OpenAI API key is not configured, return a simple summary
    return `Found ${results.length} relevant results about how to complete this task.`
  }

  try {
    const openai = new OpenAI({
      apiKey,
    })

    const resultsText = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`)
      .join("\n\n")

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use lightweight model for summary
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes web search results to help understand how to complete a task.",
        },
        {
          role: "user",
          content: `User wants to: ${query}

I found these search results:
${resultsText}

Provide a concise summary (2-3 sentences) of the key information from these results that will help complete the task. Focus on actionable steps and important details.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    })

    const summary = response.choices[0]?.message?.content?.trim()

    return summary || `Found ${results.length} relevant results about how to complete this task.`
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "web-search", operation: "generateSearchSummary" },
      extra: { query, resultCount: results.length },
    })
    console.error("[Web Search] Error generating summary:", error)
    // Return fallback summary
    return `Found ${results.length} relevant results about how to complete this task.`
  }
}
