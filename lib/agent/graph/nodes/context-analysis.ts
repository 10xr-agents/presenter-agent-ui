/**
 * Context Analysis Node
 *
 * Implements the 4-step reasoning pipeline's first step:
 * "Context & Gap Analysis (Memory & Visual Check)"
 *
 * Determines the best source for information:
 * - MEMORY: Information from chat history
 * - PAGE: Information visible on current page
 * - WEB_SEARCH: External knowledge needed
 * - ASK_USER: Private data needed from user
 */

import * as Sentry from "@sentry/nextjs"
import { analyzeContext, type ContextAnalysisResult } from "@/lib/agent/reasoning/context-analyzer"
import { manageSearch, type SearchManagerResult } from "@/lib/agent/reasoning/search-manager"
import type { InteractGraphState } from "../types"

/**
 * Extract page summary from DOM for context analysis
 */
function extractPageSummary(url: string, dom: string): string {
  let pageSummary = `Current page: ${url}`
  try {
    // Extract visible text from DOM (first 500 chars)
    const textMatch = dom.match(/<[^>]*>([^<]+)<\/[^>]*>/g)
    if (textMatch) {
      const extractedText = textMatch
        .slice(0, 20)
        .map((match) => match.replace(/<[^>]*>/g, ""))
        .join(" ")
        .substring(0, 500)
      if (extractedText) {
        pageSummary = `Current page: ${url}\nVisible content: ${extractedText}`
      }
    }
  } catch {
    // Fallback to URL only
    pageSummary = `Current page: ${url}`
  }
  return pageSummary
}

/**
 * Context analysis node - analyzes context and determines information source
 *
 * @param state - Current graph state
 * @returns Updated state with context analysis result
 */
export async function contextAnalysisNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const { query, url, dom, previousMessages, ragChunks, hasOrgKnowledge, tenantId } = state

  console.log(`[Graph:context_analysis] Starting context analysis`)
  console.log(`[Graph:context_analysis] ${previousMessages.length} history messages, ${ragChunks.length} RAG chunks`)

  // Convert messages to chat history format
  const chatHistoryForAnalysis = previousMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
    timestamp: m.timestamp,
  }))

  // Extract page summary
  const pageSummary = extractPageSummary(url, dom)

  let contextAnalysis: ContextAnalysisResult
  try {
    contextAnalysis = await analyzeContext({
      query,
      url,
      chatHistory: chatHistoryForAnalysis,
      pageSummary,
      ragChunks,
      hasOrgKnowledge,
    })

    console.log(
      `[Graph:context_analysis] Analysis complete: source=${contextAnalysis.source}, ` +
      `confidence=${contextAnalysis.confidence.toFixed(2)}, missingInfo=${contextAnalysis.missingInfo.length}`
    )
  } catch (error: unknown) {
    console.error(`[Graph:context_analysis] Context analysis failed:`, error)
    Sentry.captureException(error, {
      tags: { component: "graph-context-analysis" },
      extra: { query, url, tenantId },
    })

    // Fallback: conservative defaults
    contextAnalysis = {
      source: "WEB_SEARCH",
      requiredSources: ["WEB_SEARCH"],
      missingInfo: [],
      searchQuery: query,
      reasoning: "Analysis failed, defaulting to search",
      confidence: 0.3,
    }
  }

  // Handle ASK_USER result
  if (contextAnalysis.source === "ASK_USER") {
    console.log(`[Graph:context_analysis] ASK_USER needed`)
    return {
      contextAnalysis,
      status: "needs_user_input",
    }
  }

  // Handle WEB_SEARCH - execute search
  if (contextAnalysis.source === "WEB_SEARCH") {
    console.log(`[Graph:context_analysis] Executing web search: "${contextAnalysis.searchQuery.substring(0, 50)}..."`)
    try {
      const searchManagerResult: SearchManagerResult = await manageSearch({
        query,
        searchQuery: contextAnalysis.searchQuery,
        url,
        tenantId,
        ragChunks,
        maxAttempts: 3,
      })

      console.log(
        `[Graph:context_analysis] Search completed: ${searchManagerResult.attempts} attempts, ` +
        `solved=${searchManagerResult.evaluation.solved}, results=${searchManagerResult.searchResults?.results.length || 0}`
      )

      // Check if search evaluation says we should ask user
      if (searchManagerResult.evaluation.shouldAskUser && !searchManagerResult.evaluation.solved) {
        console.log(`[Graph:context_analysis] Search suggests ASK_USER`)
        return {
          contextAnalysis: {
            ...contextAnalysis,
            source: "ASK_USER",
            reasoning: searchManagerResult.evaluation.reasoning || "Search couldn't find the information",
          },
          webSearchResult: searchManagerResult.searchResults,
          status: "needs_user_input",
        }
      }

      return {
        contextAnalysis,
        webSearchResult: searchManagerResult.searchResults,
        status: "planning",
      }
    } catch (error: unknown) {
      console.error(`[Graph:context_analysis] Search failed:`, error)
      Sentry.captureException(error, {
        tags: { component: "graph-context-analysis", operation: "search" },
        extra: { query, url, tenantId, searchQuery: contextAnalysis.searchQuery },
      })

      // Continue without search - it's optional
      return {
        contextAnalysis,
        webSearchResult: null,
        status: "planning",
      }
    }
  }

  // MEMORY or PAGE - no search needed
  console.log(`[Graph:context_analysis] Source is ${contextAnalysis.source}, skipping search`)
  return {
    contextAnalysis,
    webSearchResult: null,
    status: "planning",
  }
}

/**
 * Router function after context analysis
 *
 * @param state - Current graph state
 * @returns Next node name
 */
export function routeAfterContextAnalysis(
  state: InteractGraphState
): "planning" | "finalize" {
  if (state.status === "needs_user_input") {
    console.log(`[Graph:router] Routing to finalize (needs_user_input)`)
    return "finalize"
  }

  console.log(`[Graph:router] Routing to planning`)
  return "planning"
}
