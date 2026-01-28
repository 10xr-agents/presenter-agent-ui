/**
 * Dynamic Interrupt (Phase 4 Task 5)
 *
 * Mid-flight RAG/ask trigger for handling MISSING_INFO during action generation.
 * When the LLM needs information that wasn't available at context analysis time,
 * it can signal MISSING_INFO to pause and fetch targeted data.
 *
 * Flow:
 * 1. During step refinement or action generation, LLM outputs MISSING_INFO: [parameter]
 * 2. Orchestrator pauses action response
 * 3. Run targeted WEB_SEARCH or RAG for that parameter
 * 4. Re-run action generation with enriched context
 * 5. Or return NeedsUserInput if ASK_USER is appropriate
 *
 * @see INTERACT_FLOW_WALKTHROUGH.md - Phase 4 Task 5
 */

import * as Sentry from "@sentry/nextjs"
import { performWebSearch, type WebSearchResult } from "./web-search"
import { recordUsage } from "@/lib/cost"

// =============================================================================
// Types
// =============================================================================

/**
 * Detected missing information from LLM output
 */
export interface DetectedMissingInfo {
  /** Parameter name (e.g., "insurance_code", "zip_code") */
  parameter: string
  /** Type of information needed */
  type: "EXTERNAL_KNOWLEDGE" | "PRIVATE_DATA"
  /** Context for why this is needed */
  context?: string
}

/**
 * Individual search result item
 */
export interface SearchResultItem {
  title: string
  url: string
  content?: string
  snippet?: string
}

/**
 * Result of processing a dynamic interrupt
 */
export interface DynamicInterruptResult {
  /** Whether interrupt was handled */
  handled: boolean
  /** Type of resolution */
  resolution: "DATA_FOUND" | "ASK_USER" | "NO_DATA" | "NO_INTERRUPT"
  /** Retrieved data (if any) */
  data?: string
  /** Refined search results (if web search was performed) */
  searchResults?: SearchResultItem[]
  /** User prompt (if ASK_USER) */
  userPrompt?: string
  /** Error message (if failed) */
  error?: string
}

/**
 * Context for dynamic interrupt processing
 */
export interface DynamicInterruptContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
  currentUrl?: string
  goal?: string
}

// =============================================================================
// Detection
// =============================================================================

/**
 * Pattern for detecting MISSING_INFO in LLM output
 *
 * Supports formats:
 * - MISSING_INFO: parameter_name (captures until space, comma, period, or newline)
 * - MISSING_INFO: [parameter_name] (captures content within brackets)
 * - <MISSING_INFO>parameter_name</MISSING_INFO>
 */
const MISSING_INFO_PATTERNS = [
  /MISSING_INFO:\s*\[([^\]]+)\]/gi, // [parameter_name] format
  /MISSING_INFO:\s*([a-zA-Z_][a-zA-Z0-9_]*)/gi, // parameter_name format (identifier)
  /<MISSING_INFO>([^<]+)<\/MISSING_INFO>/gi, // XML format
  /NEED_INFO:\s*\[([^\]]+)\]/gi, // NEED_INFO with brackets
  /NEED_INFO:\s*([a-zA-Z_][a-zA-Z0-9_]*)/gi, // NEED_INFO identifier
]

/**
 * Keywords that indicate private data (ASK_USER instead of search)
 */
const PRIVATE_DATA_KEYWORDS = [
  "password",
  "ssn",
  "social security",
  "credit card",
  "account number",
  "personal",
  "private",
  "user id",
  "patient id",
  "phone number",
  "email address",
  "date of birth",
  "dob",
  "address",
]

/**
 * Detect MISSING_INFO signals in LLM output
 *
 * @param llmOutput - Raw LLM output string
 * @returns Array of detected missing info items
 */
export function detectMissingInfo(llmOutput: string): DetectedMissingInfo[] {
  const detected: DetectedMissingInfo[] = []
  const seen = new Set<string>()

  for (const pattern of MISSING_INFO_PATTERNS) {
    let match: RegExpExecArray | null
    // Reset regex state
    pattern.lastIndex = 0

    while ((match = pattern.exec(llmOutput)) !== null) {
      const parameter = match[1]?.trim()
      if (!parameter || seen.has(parameter.toLowerCase())) continue

      seen.add(parameter.toLowerCase())

      // Determine if this is private data
      const isPrivate = PRIVATE_DATA_KEYWORDS.some((kw) =>
        parameter.toLowerCase().includes(kw)
      )

      detected.push({
        parameter,
        type: isPrivate ? "PRIVATE_DATA" : "EXTERNAL_KNOWLEDGE",
      })
    }
  }

  return detected
}

/**
 * Check if LLM output contains MISSING_INFO signals
 *
 * @param llmOutput - Raw LLM output string
 * @returns Whether missing info was detected
 */
export function hasMissingInfo(llmOutput: string): boolean {
  return detectMissingInfo(llmOutput).length > 0
}

// =============================================================================
// Resolution
// =============================================================================

/**
 * Process a dynamic interrupt by fetching missing information
 *
 * @param missingInfo - Detected missing information
 * @param context - Processing context
 * @returns Interrupt processing result
 */
export async function processDynamicInterrupt(
  missingInfo: DetectedMissingInfo[],
  context: DynamicInterruptContext
): Promise<DynamicInterruptResult> {
  if (missingInfo.length === 0) {
    return { handled: false, resolution: "NO_INTERRUPT" }
  }

  console.log(
    `[DynamicInterrupt] Processing ${missingInfo.length} missing info items: ` +
      missingInfo.map((m) => m.parameter).join(", ")
  )

  // Separate private data from external knowledge
  const privateData = missingInfo.filter((m) => m.type === "PRIVATE_DATA")
  const externalKnowledge = missingInfo.filter((m) => m.type === "EXTERNAL_KNOWLEDGE")

  // If any private data is needed, ask user
  if (privateData.length > 0) {
    const userPrompt = buildUserPrompt(privateData, context.goal)
    console.log(`[DynamicInterrupt] Requesting user input for: ${privateData.map((p) => p.parameter).join(", ")}`)
    return {
      handled: true,
      resolution: "ASK_USER",
      userPrompt,
    }
  }

  // For external knowledge, perform targeted web search
  if (externalKnowledge.length > 0) {
    try {
      const searchQuery = buildSearchQuery(externalKnowledge, context)
      console.log(`[DynamicInterrupt] Performing targeted search: "${searchQuery}"`)

      const searchResult = await performWebSearch(
        searchQuery,
        context.currentUrl || "",
        context.tenantId
      )

      if (searchResult && searchResult.summary) {
        // Track usage
        recordUsage({
          tenantId: context.tenantId,
          userId: context.userId,
          sessionId: context.sessionId,
          taskId: context.taskId,
          provider: "openai",
          model: "tavily-search",
          actionType: "DYNAMIC_INTERRUPT",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          metadata: {
            query: searchQuery,
            parameters: externalKnowledge.map((m) => m.parameter),
          },
        }).catch(console.error)

        // Map search results to our interface
        const mappedResults: SearchResultItem[] = searchResult.results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.snippet,
          snippet: r.snippet,
        }))

        return {
          handled: true,
          resolution: "DATA_FOUND",
          data: formatSearchData(
            { answer: searchResult.summary, results: mappedResults },
            externalKnowledge
          ),
          searchResults: mappedResults,
        }
      }

      return {
        handled: true,
        resolution: "NO_DATA",
        error: "Web search returned no relevant results",
      }
    } catch (error: unknown) {
      Sentry.captureException(error, {
        tags: { component: "dynamic-interrupt", operation: "processDynamicInterrupt" },
        extra: { missingInfo, context },
      })

      return {
        handled: true,
        resolution: "NO_DATA",
        error: error instanceof Error ? error.message : "Search failed",
      }
    }
  }

  return { handled: false, resolution: "NO_INTERRUPT" }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build a user prompt for requesting private data
 */
function buildUserPrompt(
  privateData: DetectedMissingInfo[],
  goal?: string
): string {
  const parts = [
    "I need some additional information to continue:",
    "",
  ]

  privateData.forEach((item, i) => {
    parts.push(`${i + 1}. ${formatParameterName(item.parameter)}`)
    if (item.context) {
      parts.push(`   (${item.context})`)
    }
  })

  if (goal) {
    parts.push("")
    parts.push(`This information is needed to complete: "${goal}"`)
  }

  return parts.join("\n")
}

/**
 * Build a search query for external knowledge
 */
function buildSearchQuery(
  externalKnowledge: DetectedMissingInfo[],
  context: DynamicInterruptContext
): string {
  const parameters = externalKnowledge.map((m) => m.parameter)

  // Build contextual query
  let query = parameters.join(" ")

  // Add domain context from URL if available
  if (context.currentUrl) {
    try {
      const domain = new URL(context.currentUrl).hostname
      // Extract meaningful domain context (e.g., "openemr" from "demo.openemr.io")
      const domainParts = domain.split(".").filter((p) => p !== "www" && p !== "demo")
      const meaningfulPart = domainParts[0]
      if (meaningfulPart && meaningfulPart.length > 2) {
        query = `${meaningfulPart} ${query}`
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  // Add goal context if available
  if (context.goal) {
    const goalKeywords = context.goal
      .toLowerCase()
      .split(" ")
      .filter((w) => w.length > 3)
      .slice(0, 3)
    if (goalKeywords.length > 0) {
      query = `${query} ${goalKeywords.join(" ")}`
    }
  }

  return query.trim()
}

/**
 * Format search data for context enrichment
 */
function formatSearchData(
  searchResult: { answer?: string; results?: Array<{ title: string; snippet?: string; content?: string }> },
  parameters: DetectedMissingInfo[]
): string {
  const parts = ["RETRIEVED INFORMATION:"]

  if (searchResult.answer) {
    parts.push("")
    parts.push(searchResult.answer)
  }

  if (searchResult.results && searchResult.results.length > 0) {
    parts.push("")
    parts.push("Sources:")
    searchResult.results.slice(0, 3).forEach((r, i) => {
      parts.push(`${i + 1}. ${r.title}: ${r.content?.substring(0, 200)}...`)
    })
  }

  parts.push("")
  parts.push(`This information was retrieved for: ${parameters.map((p) => p.parameter).join(", ")}`)

  return parts.join("\n")
}

/**
 * Format parameter name for user display
 */
function formatParameterName(param: string): string {
  return param
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Enrich context with dynamic interrupt data
 *
 * Merges retrieved data into the existing context for re-running action generation.
 *
 * @param originalContext - Original context string
 * @param interruptResult - Result from dynamic interrupt processing
 * @returns Enriched context string
 */
export function enrichContextWithInterruptData(
  originalContext: string,
  interruptResult: DynamicInterruptResult
): string {
  if (!interruptResult.data) {
    return originalContext
  }

  return `${originalContext}\n\n--- DYNAMICALLY RETRIEVED ---\n${interruptResult.data}\n--- END RETRIEVED ---`
}
