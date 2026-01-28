import * as Sentry from "@sentry/nextjs"
import { OpenAI } from "openai"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { WebSearchResult } from "./web-search"

/**
 * Reasoning Engine
 *
 * Implements a "Human-Like Reasoning Loop" that:
 * 1. Analyzes task context to determine if search is needed
 * 2. Verifies information completeness after search
 * 3. Identifies missing information that requires user input
 */

/**
 * Task context analysis result
 */
export interface TaskContextAnalysis {
  hasSufficientContext: boolean // Can we proceed without search?
  missingFields: string[] // What information is missing? (e.g., ["patient_dob", "phone_number"])
  needsWebSearch: boolean // Should we search the web?
  searchQuery: string // Refined, high-fidelity query (e.g., "How to register new patient OpenEMR 7.0")
  reasoning: string // Explanation of the decision
}

/**
 * Information completeness verification result
 */
export interface InformationCompletenessCheck {
  canProceed: boolean // Can we proceed with execution?
  missingInformation: string[] // What information is still missing?
  userQuestion: string // Question to ask user (if canProceed is false)
  reasoning: string // Explanation
}

/**
 * Parameters for task context analysis
 */
export interface AnalyzeTaskContextParams {
  query: string
  url: string
  pageSummary?: string // Optional: brief page state summary
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean
}

/**
 * Parameters for information completeness verification
 */
export interface VerifyInformationCompletenessParams {
  query: string
  searchResults: WebSearchResult | null
  missingFields: string[]
  ragChunks: ResolveKnowledgeChunk[]
}

/**
 * Analyzes task context to determine if web search is needed and what information is missing.
 *
 * Uses a fast LLM to make intelligent decisions about:
 * - Whether we have sufficient context to proceed
 * - What information is missing
 * - Whether web search would help
 * - What refined search query to use
 *
 * @param params - Analysis parameters
 * @returns Task context analysis result
 */
export async function analyzeTaskContext(
  params: AnalyzeTaskContextParams
): Promise<TaskContextAnalysis> {
  const { query, url, pageSummary, ragChunks, hasOrgKnowledge } = params

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Fallback: conservative defaults if OpenAI not configured
    console.warn("[Reasoning] OpenAI API key not configured, using conservative defaults")
    return {
      hasSufficientContext: false,
      missingFields: [],
      needsWebSearch: true,
      searchQuery: query,
      reasoning: "OpenAI API key not configured, defaulting to search",
    }
  }

  try {
    const openai = new OpenAI({ apiKey })

    // Build context summary
    const ragSummary = ragChunks.length > 0
      ? `Available knowledge (${ragChunks.length} chunks):\n${ragChunks
          .slice(0, 3)
          .map((c, i) => `${i + 1}. ${c.content.substring(0, 200)}...`)
          .join("\n")}`
      : "No knowledge base available"

    const knowledgeType = hasOrgKnowledge ? "Organization-specific" : "Public"

    const pageContext = pageSummary || `Current page: ${url}`

    // Build prompt for context analysis
    const systemPrompt = `You are analyzing a user's task request to determine:
1. Do we have enough information to proceed without searching?
2. What information is missing that the user needs to provide?
3. Would web search help find the information we need?
4. If search is needed, what refined query would be most effective?

You must respond with valid JSON only, no additional text.`

    const userPrompt = `User Query: "${query}"
Current Page: ${pageContext}
Knowledge Type: ${knowledgeType}
${ragSummary}

Analyze this request and respond with JSON:
{
  "hasSufficientContext": boolean,
  "missingFields": string[],
  "needsWebSearch": boolean,
  "searchQuery": string,
  "reasoning": string
}

Guidelines:
- hasSufficientContext: true if the task is straightforward and we have enough info (e.g., "click login button")
- missingFields: List specific fields/info needed (e.g., ["patient_dob", "phone_number", "error_id"])
- needsWebSearch: true if we need documentation or examples to complete the task
- searchQuery: Refined query optimized for search (e.g., "How to register new patient OpenEMR 7.0" not just "add patient")
- reasoning: Brief explanation of your decision`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast model for analysis
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more consistent analysis
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("Empty response from LLM")
    }

    const analysis = JSON.parse(content) as TaskContextAnalysis

    // Validate and sanitize response
    return {
      hasSufficientContext: Boolean(analysis.hasSufficientContext),
      missingFields: Array.isArray(analysis.missingFields) ? analysis.missingFields : [],
      needsWebSearch: Boolean(analysis.needsWebSearch),
      searchQuery: analysis.searchQuery || query, // Fallback to original query
      reasoning: analysis.reasoning || "Analysis completed",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "reasoning-engine", operation: "analyzeTaskContext" },
      extra: { query, url, hasRagChunks: ragChunks.length > 0 },
    })
    console.error("[Reasoning] Error analyzing task context:", error)

    // Fallback: conservative defaults
    return {
      hasSufficientContext: false,
      missingFields: [],
      needsWebSearch: true,
      searchQuery: query,
      reasoning: "Analysis failed, defaulting to search for safety",
    }
  }
}

/**
 * Verifies if we have all required information to complete the task after search.
 *
 * Uses a fast LLM to check if search results and available knowledge provide
 * sufficient information, or if we need to ask the user for missing details.
 *
 * @param params - Verification parameters
 * @returns Information completeness check result
 */
export async function verifyInformationCompleteness(
  params: VerifyInformationCompletenessParams
): Promise<InformationCompletenessCheck> {
  const { query, searchResults, missingFields, ragChunks } = params

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Fallback: optimistic default if OpenAI not configured
    console.warn("[Reasoning] OpenAI API key not configured, assuming we can proceed")
    return {
      canProceed: true,
      missingInformation: [],
      userQuestion: "",
      reasoning: "OpenAI API key not configured, defaulting to proceed",
    }
  }

  try {
    const openai = new OpenAI({ apiKey })

    // Build search results summary
    const searchSummary = searchResults
      ? `Search Results:
- Query: ${searchResults.searchQuery}
- Summary: ${searchResults.summary}
- Top Results:
${searchResults.results.slice(0, 3).map((r, i) => `  ${i + 1}. ${r.title}: ${r.snippet.substring(0, 150)}...`).join("\n")}`
      : "No search results available"

    const ragSummary = ragChunks.length > 0
      ? `Available knowledge (${ragChunks.length} chunks):\n${ragChunks
          .slice(0, 3)
          .map((c, i) => `${i + 1}. ${c.content.substring(0, 200)}...`)
          .join("\n")}`
      : "No knowledge base available"

    const missingFieldsList = missingFields.length > 0 ? missingFields.join(", ") : "None identified"

    // Build prompt for completeness verification
    const systemPrompt = `You are verifying if we have all required information to complete a user's task.

You must respond with valid JSON only, no additional text.`

    const userPrompt = `User Query: "${query}"

Missing Fields Previously Identified: ${missingFieldsList}

${searchSummary}

${ragSummary}

Based on the search results and available knowledge, determine if we have all required information to perform the user's request.

Respond with JSON:
{
  "canProceed": boolean,
  "missingInformation": string[],
  "userQuestion": string,
  "reasoning": string
}

Guidelines:
- canProceed: true if we have enough information to attempt the task
- missingInformation: List of specific information still missing that only the user can provide
- userQuestion: If canProceed is false, provide a clear, user-friendly question asking for the missing information
- reasoning: Brief explanation of your decision

Examples:
- If search shows "Date of Birth is required" but user didn't provide it: canProceed=false, ask for DOB
- If search provides clear instructions and we have all required info: canProceed=true
- If search results are insufficient and we need more context: canProceed=false, ask user for clarification`

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast model for verification
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more consistent verification
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error("Empty response from LLM")
    }

    const verification = JSON.parse(content) as InformationCompletenessCheck

    // Validate and sanitize response
    return {
      canProceed: Boolean(verification.canProceed),
      missingInformation: Array.isArray(verification.missingInformation)
        ? verification.missingInformation
        : [],
      userQuestion: verification.userQuestion || "",
      reasoning: verification.reasoning || "Verification completed",
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "reasoning-engine", operation: "verifyInformationCompleteness" },
      extra: { query, hasSearchResults: !!searchResults, missingFieldsCount: missingFields.length },
    })
    console.error("[Reasoning] Error verifying information completeness:", error)

    // Fallback: optimistic default (assume we can proceed)
    return {
      canProceed: true,
      missingInformation: [],
      userQuestion: "",
      reasoning: "Verification failed, defaulting to proceed (optimistic)",
    }
  }
}
