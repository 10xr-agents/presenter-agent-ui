import * as Sentry from "@sentry/nextjs"
import { performWebSearch, type WebSearchResult } from "@/lib/agent/web-search"
import { recordUsage } from "@/lib/cost"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { SEARCH_EVALUATION_SCHEMA } from "@/lib/llm/response-schemas"

/**
 * Search Manager
 *
 * Implements the "Iterative Deep Dives" improvement:
 * - Executes Tavily search with refined queries
 * - Evaluates search results to determine if they solve the problem
 * - Refines query and searches again if results are insufficient (max 2-3 hops)
 * - Falls back to ASK_USER if search fails after retries
 */

/**
 * Search evaluation result
 */
export interface SearchEvaluationResult {
  solved: boolean // Did the search results solve the problem?
  refinedQuery?: string // Refined query for next search attempt (if solved is false)
  shouldRetry: boolean // Should we retry with refined query?
  shouldAskUser: boolean // Should we ask the user instead?
  reasoning: string // Explanation
  confidence: number // Confidence score (0-1)
}

/**
 * Search manager result
 */
export interface SearchManagerResult {
  searchResults: WebSearchResult | null
  evaluation: SearchEvaluationResult
  attempts: number // Number of search attempts made
  finalQuery: string // Final query used
}

/**
 * Optional context for cost tracking (used when calling from graph with state)
 */
export interface SearchUsageContext {
  userId: string
  sessionId?: string
  taskId?: string
  langfuseTraceId?: string
}

/**
 * Parameters for search manager
 */
export interface SearchManagerParams {
  query: string // Original user query
  searchQuery: string // Refined search query from context analyzer
  url: string // Current page URL
  tenantId: string // Tenant ID
  ragChunks: ResolveKnowledgeChunk[] // Available RAG knowledge
  maxAttempts?: number // Maximum search attempts (default: 3)
  /** Optional: for cost tracking and Langfuse trace linkage */
  usageContext?: SearchUsageContext
}

/**
 * Evaluates search results to determine if they solve the problem.
 *
 * @param params - Evaluation parameters (usageContext optional for cost tracking)
 * @returns Search evaluation result
 */
async function evaluateSearchResults(params: {
  query: string
  searchResults: WebSearchResult
  ragChunks: ResolveKnowledgeChunk[]
  tenantId?: string
  usageContext?: SearchUsageContext
}): Promise<SearchEvaluationResult> {
  const { query, searchResults, ragChunks, tenantId, usageContext } = params

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      solved: true,
      shouldRetry: false,
      shouldAskUser: false,
      reasoning: "Gemini API key not configured, assuming search solved the problem",
      confidence: 0.5,
    }
  }

  try {

    const ragSummary = ragChunks.length > 0
      ? `Available Knowledge (${ragChunks.length} chunks):\n${ragChunks
          .slice(0, 3)
          .map((c, i) => `${i + 1}. ${c.content.substring(0, 200)}...`)
          .join("\n")}`
      : "No knowledge base available"

    const searchSummary = `Search Query: ${searchResults.searchQuery}
Search Summary: ${searchResults.summary}
Top Results:
${searchResults.results.slice(0, 5).map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet.substring(0, 200)}...`).join("\n")}`

    const systemPrompt = `You are evaluating search results to determine if they solve the user's problem.

You must respond with valid JSON only, no additional text.`

    const userPrompt = `User Query: "${query}"

${searchSummary}

${ragSummary}

Based on these search results, determine:
1. Did these results solve the problem? (Can we proceed with the task?)
2. If not, can we refine the query and search again? (Is the problem that the query was too generic/broad?)
3. Or should we ask the user for more information? (Is the problem that we need private data or more context?)

Respond with JSON:
{
  "solved": boolean,
  "refinedQuery": string,
  "shouldRetry": boolean,
  "shouldAskUser": boolean,
  "reasoning": string,
  "confidence": number
}

Guidelines:
- solved: true if the search results provide enough information to complete the task
- refinedQuery: If shouldRetry is true, provide a more specific/refined query (e.g., "OpenEMR billing module error 505 logs" instead of "error 505")
- shouldRetry: true if the query was too generic and a refined query might help (max 2-3 retries total)
- shouldAskUser: true if we need private data or more context that search cannot provide
- reasoning: Explain your decision clearly
- confidence: 0.0 to 1.0

Examples:
- Results show "Error 505 is a server error" (too generic) → solved: false, shouldRetry: true, refinedQuery: "OpenEMR billing error 505 troubleshooting"
- Results show clear step-by-step instructions → solved: true, shouldRetry: false
- Results don't contain the specific error ID we need → solved: false, shouldRetry: false, shouldAskUser: true`

    const result = await generateWithGemini(systemPrompt, userPrompt, {
      model: DEFAULT_PLANNING_MODEL,
      temperature: 0.3,
      maxOutputTokens: 600,
      thinkingLevel: "low",
      responseJsonSchema: SEARCH_EVALUATION_SCHEMA,
    })

    if (tenantId && usageContext && result?.promptTokens != null) {
      recordUsage({
        tenantId,
        userId: usageContext.userId,
        sessionId: usageContext.sessionId,
        taskId: usageContext.taskId,
        langfuseTraceId: usageContext.langfuseTraceId,
        provider: "google",
        model: DEFAULT_PLANNING_MODEL,
        actionType: "MULTI_SOURCE_SYNTHESIS",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        metadata: { operation: "search_evaluation", query },
      }).catch((err: unknown) => {
        console.error("[SearchManager] Cost tracking error:", err)
      })
    }

    const content = result?.content
    if (!content) {
      throw new Error("Empty response from LLM")
    }

    const evaluation = JSON.parse(content) as SearchEvaluationResult

    // Validate and sanitize
    return {
      solved: Boolean(evaluation.solved),
      refinedQuery: evaluation.refinedQuery || undefined,
      shouldRetry: Boolean(evaluation.shouldRetry),
      shouldAskUser: Boolean(evaluation.shouldAskUser),
      reasoning: evaluation.reasoning || "Evaluation completed",
      confidence: Math.max(0, Math.min(1, Number(evaluation.confidence) || 0.5)),
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "search-manager", operation: "evaluateSearchResults" },
      extra: { query, hasSearchResults: !!searchResults },
    })
    console.error("[Search Manager] Error evaluating search results:", error)

    // Fallback: assume solved (optimistic)
    return {
      solved: true,
      shouldRetry: false,
      shouldAskUser: false,
      reasoning: "Evaluation failed, assuming search solved the problem",
      confidence: 0.3,
    }
  }
}

/**
 * Manages iterative web search with query refinement.
 *
 * Implements the "Iterative Deep Dives" improvement:
 * 1. Executes initial search with refined query
 * 2. Evaluates results to determine if they solve the problem
 * 3. If insufficient, refines query and searches again (max 2-3 hops)
 * 4. Falls back to ASK_USER if search fails after retries
 *
 * @param params - Search manager parameters
 * @returns Search manager result
 */
export async function manageSearch(
  params: SearchManagerParams
): Promise<SearchManagerResult> {
  const { query, searchQuery, url, tenantId, ragChunks, maxAttempts = 3, usageContext } = params

  let currentQuery = searchQuery
  let attempts = 0
  let lastSearchResults: WebSearchResult | null = null
  let lastEvaluation: SearchEvaluationResult | null = null

  // Iterative search loop (max attempts)
  while (attempts < maxAttempts) {
    attempts++

    try {
      // Execute search
      console.log(`[Search Manager] Attempt ${attempts}/${maxAttempts}: Searching with query: "${currentQuery}"`)
      const searchResults = await performWebSearch(currentQuery, url, tenantId, {
        strictDomainFilter: true,
        allowDomainExpansion: attempts > 1, // Allow expansion on retries
        usageContext: usageContext ? { tenantId, ...usageContext } : undefined,
      })

      if (!searchResults || searchResults.results.length === 0) {
        console.log(`[Search Manager] Attempt ${attempts}: No results found`)
        // If no results and we haven't tried expanding, try without domain filter
        if (attempts === 1) {
          console.log(`[Search Manager] Retrying without domain filter...`)
          const expandedResults = await performWebSearch(currentQuery, url, tenantId, {
            strictDomainFilter: false,
            allowDomainExpansion: false,
            usageContext: usageContext ? { tenantId, ...usageContext } : undefined,
          })
          if (expandedResults && expandedResults.results.length > 0) {
            lastSearchResults = expandedResults
            // Evaluate expanded results
            lastEvaluation = await evaluateSearchResults({
              query,
              searchResults: expandedResults,
              ragChunks,
              tenantId,
              usageContext,
            })
            break
          }
        }

        // No results after expansion - evaluate and decide
        lastEvaluation = {
          solved: false,
          shouldRetry: attempts < maxAttempts,
          shouldAskUser: attempts >= maxAttempts,
          reasoning: "No search results found",
          confidence: 0.3,
        }
        break
      }

      lastSearchResults = searchResults

      // Evaluate results
      console.log(`[Search Manager] Attempt ${attempts}: Evaluating ${searchResults.results.length} results...`)
      lastEvaluation = await evaluateSearchResults({
        query,
        searchResults,
        ragChunks,
        tenantId,
        usageContext,
      })

      // If solved or should ask user, break
      if (lastEvaluation.solved || lastEvaluation.shouldAskUser) {
        console.log(
          `[Search Manager] Attempt ${attempts}: ${lastEvaluation.solved ? "Solved" : "Should ask user"}`
        )
        break
      }

      // If should retry and we have a refined query, continue loop
      if (lastEvaluation.shouldRetry && lastEvaluation.refinedQuery) {
        console.log(
          `[Search Manager] Attempt ${attempts}: Refining query to: "${lastEvaluation.refinedQuery}"`
        )
        currentQuery = lastEvaluation.refinedQuery
        continue
      }

      // If should retry but no refined query, break (fallback)
      if (lastEvaluation.shouldRetry && !lastEvaluation.refinedQuery) {
        console.log(`[Search Manager] Attempt ${attempts}: Should retry but no refined query, breaking`)
        break
      }

      // Otherwise, break
      break
    } catch (error: unknown) {
      Sentry.captureException(error, {
        tags: { component: "search-manager", operation: "manageSearch" },
        extra: { query, searchQuery: currentQuery, attempt: attempts },
      })
      console.error(`[Search Manager] Error on attempt ${attempts}:`, error)

      // On error, break and return what we have
      lastEvaluation = {
        solved: false,
        shouldRetry: false,
        shouldAskUser: true,
        reasoning: `Search failed on attempt ${attempts}`,
        confidence: 0.2,
      }
      break
    }
  }

  // Return final result
  return {
    searchResults: lastSearchResults,
    evaluation: lastEvaluation || {
      solved: false,
      shouldRetry: false,
      shouldAskUser: true,
      reasoning: "Search evaluation failed",
      confidence: 0.1,
    },
    attempts,
    finalQuery: currentQuery,
  }
}
