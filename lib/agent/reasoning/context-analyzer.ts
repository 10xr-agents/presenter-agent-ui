import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { CONTEXT_ANALYSIS_SCHEMA } from "@/lib/llm/response-schemas"

/**
 * Context Analyzer
 *
 * Implements the "Memory & Visual Check" improvement:
 * - Checks Chat History (Memory) for previously provided information
 * - Checks Current Page (DOM/Visual) for visible information
 * - Classifies missing information as External Knowledge (search) vs Private Data (ask user)
 * - Determines the best source: MEMORY, PAGE, WEB_SEARCH, or ASK_USER
 */

/**
 * Information source classification
 */
export type InformationSource = "MEMORY" | "PAGE" | "WEB_SEARCH" | "ASK_USER"

/**
 * Missing information classification
 */
export interface MissingInfo {
  field: string // e.g., "patient_dob", "error_id"
  type: "EXTERNAL_KNOWLEDGE" | "PRIVATE_DATA" // Can be found via search vs must ask user
  description: string // Human-readable description
}

/**
 * Context analysis result
 *
 * Phase 4 Task 4: Multi-Source Synthesis
 * - Added `requiredSources` array for multi-source queries
 * - Single `source` maintained for backward compatibility
 */
export interface ContextAnalysisResult {
  source: InformationSource // Primary source (backward compatible)
  requiredSources: InformationSource[] // Phase 4: All sources needed for complex queries
  missingInfo: MissingInfo[] // What information is missing
  searchQuery: string // Refined query for Tavily (if source is WEB_SEARCH)
  reasoning: string // Explanation of the decision
  confidence: number // Confidence score (0-1)
}

/**
 * Optional context for cost tracking (tenantId, userId, sessionId, taskId, langfuseTraceId)
 */
export interface UsageContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
  langfuseTraceId?: string
}

/**
 * Parameters for context analysis
 */
export interface AnalyzeContextParams {
  query: string // User's task instructions
  url: string // Current page URL
  chatHistory: Array<{
    role: "user" | "assistant"
    content: string
    timestamp: Date
  }> // Chat history from session messages
  pageSummary: string // Summary of current page/DOM (extracted from DOM or provided)
  ragChunks: ResolveKnowledgeChunk[] // Available RAG knowledge
  hasOrgKnowledge: boolean // Whether org-specific knowledge exists
  /** Optional: for cost tracking and Langfuse trace linkage */
  usageContext?: UsageContext
}

/**
 * Analyzes context to determine the best source for information.
 *
 * Implements the "Memory & Visual Check" improvement:
 * 1. Checks if information is in chat history (MEMORY)
 * 2. Checks if information is visible on current page (PAGE)
 * 3. Classifies missing info as External Knowledge (WEB_SEARCH) vs Private Data (ASK_USER)
 * 4. Generates refined search query if WEB_SEARCH is needed
 *
 * @param params - Analysis parameters
 * @returns Context analysis result
 */
export async function analyzeContext(
  params: AnalyzeContextParams
): Promise<ContextAnalysisResult> {
  const { query, url, chatHistory, pageSummary, ragChunks, hasOrgKnowledge, usageContext } = params

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn("[Context Analyzer] Gemini API key not configured, defaulting to WEB_SEARCH")
    return {
      source: "WEB_SEARCH",
      requiredSources: ["WEB_SEARCH"],
      missingInfo: [],
      searchQuery: query,
      reasoning: "Gemini API key not configured, defaulting to search",
      confidence: 0.5,
    }
  }

  try {

    // Build chat history summary (last 10 messages for context)
    const recentHistory = chatHistory.slice(-10)
    const historySummary =
      recentHistory.length > 0
        ? `Recent Chat History (${recentHistory.length} messages):\n${recentHistory
            .map((m, i) => `${i + 1}. [${m.role}]: ${m.content.substring(0, 200)}`)
            .join("\n")}`
        : "No chat history available"

    // Build RAG summary
    const ragSummary = ragChunks.length > 0
      ? `Available Knowledge (${ragChunks.length} chunks):\n${ragChunks
          .slice(0, 3)
          .map((c, i) => `${i + 1}. ${c.content.substring(0, 200)}...`)
          .join("\n")}`
      : "No knowledge base available"

    const knowledgeType = hasOrgKnowledge ? "Organization-specific" : "Public"

    // Build prompt for context analysis
    // Phase 4 Task 4: Multi-Source Synthesis - analyze for multiple required sources
    const systemPrompt = `You are analyzing a user's task request to determine the BEST SOURCE(s) for information.

IMPORTANT: Complex tasks may require MULTIPLE sources. For example:
- "Add patient John Doe with his insurance info" may need MEMORY (for prior context) + WEB_SEARCH (for insurance codes)
- "Fill out the form using the data from our records" may need MEMORY + PAGE

You must check FOUR sources:
1. MEMORY (Chat History): Has the user already provided this information in previous messages?
2. PAGE (Current Screen): Is the information visible on the current page (error messages, form fields, displayed text)?
3. WEB_SEARCH (External Knowledge): Can this information be found via web search (documentation, examples, public knowledge)?
4. ASK_USER (Private Data): Is this information that only the user can provide (personal data, specific IDs, user preferences)?

You must respond with valid JSON only, no additional text.`

    const userPrompt = `User Query: "${query}"
Current Page: ${url}
Page Summary: ${pageSummary}

${historySummary}

${ragSummary}
Knowledge Type: ${knowledgeType}

Analyze this request and determine:
1. Can I answer this using Chat History (MEMORY)?
2. Is the answer visible on the current screen (PAGE)?
3. Do I need external knowledge/documentation (WEB_SEARCH)?
4. Do I need private data that only the user can provide (ASK_USER)?

Respond with JSON:
{
  "source": "MEMORY" | "PAGE" | "WEB_SEARCH" | "ASK_USER",
  "requiredSources": ["MEMORY" | "PAGE" | "WEB_SEARCH" | "ASK_USER", ...],
  "missingInfo": [
    {
      "field": string,
      "type": "EXTERNAL_KNOWLEDGE" | "PRIVATE_DATA",
      "description": string
    }
  ],
  "searchQuery": string,
  "reasoning": string,
  "confidence": number
}

Guidelines:
- source: Primary source for backward compatibility. Choose the MOST IMPORTANT source.
- requiredSources: ALL sources needed for this task. Complex queries may need multiple (e.g., ["MEMORY", "WEB_SEARCH"])
  * If only ONE source is needed, requiredSources = [source]
  * IMPORTANT: List multiple sources only when genuinely needed - don't pad unnecessarily
- missingInfo: List ALL missing information, classified as:
  * EXTERNAL_KNOWLEDGE: Can be found via search (e.g., "ICD-10 code for flu", "OpenEMR error 505 solution")
  * PRIVATE_DATA: Only user can provide (e.g., "patient phone number", "user's account ID", "specific error ID from their system")
- searchQuery: If WEB_SEARCH is in requiredSources, provide a refined, high-fidelity query (e.g., "OpenEMR billing module error 505 troubleshooting" not just "error 505")
- reasoning: Explain your decision clearly
- confidence: 0.0 to 1.0 (how confident you are in this classification)

Examples:
- Query: "Add patient Jaswanth" + History shows "Jaswanth's DOB is 1990-01-01" → source: MEMORY, requiredSources: ["MEMORY"]
- Query: "Fix the error" + Page shows "Error: Invalid ID format: Must be 9 digits" → source: PAGE, requiredSources: ["PAGE"]
- Query: "What's the ICD-10 code for flu?" → source: WEB_SEARCH, requiredSources: ["WEB_SEARCH"]
- Query: "Add patient" + Missing DOB that user hasn't provided → source: ASK_USER, requiredSources: ["ASK_USER"]
- Query: "Add patient John with insurance Blue Cross" + MEMORY has John's DOB but needs insurance codes → source: MEMORY, requiredSources: ["MEMORY", "WEB_SEARCH"]`

    const result = await generateWithGemini(systemPrompt, userPrompt, {
      model: DEFAULT_PLANNING_MODEL,
      temperature: 0.3,
      maxOutputTokens: 800,
      thinkingLevel: "low",
      responseJsonSchema: CONTEXT_ANALYSIS_SCHEMA,
    })

    if (usageContext && result?.promptTokens != null) {
      recordUsage({
        tenantId: usageContext.tenantId,
        userId: usageContext.userId,
        sessionId: usageContext.sessionId,
        taskId: usageContext.taskId,
        langfuseTraceId: usageContext.langfuseTraceId,
        provider: "google",
        model: DEFAULT_PLANNING_MODEL,
        actionType: "CONTEXT_ANALYSIS",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        metadata: { query, url },
      }).catch((err: unknown) => {
        console.error("[ContextAnalyzer] Cost tracking error:", err)
      })
    }

    const content = result?.content
    if (!content) {
      throw new Error("Empty response from LLM")
    }

    const analysis = JSON.parse(content) as ContextAnalysisResult

    // Validate and sanitize response
    const validSources: InformationSource[] = ["MEMORY", "PAGE", "WEB_SEARCH", "ASK_USER"]
    const source = validSources.includes(analysis.source) ? analysis.source : "WEB_SEARCH"

    // Phase 4 Task 4: Validate requiredSources array
    let requiredSources: InformationSource[] = [source] // Default to single source
    if (Array.isArray(analysis.requiredSources) && analysis.requiredSources.length > 0) {
      requiredSources = analysis.requiredSources.filter((s): s is InformationSource =>
        validSources.includes(s as InformationSource)
      )
      // Ensure at least one source
      if (requiredSources.length === 0) {
        requiredSources = [source]
      }
    }

    return {
      source,
      requiredSources,
      missingInfo: Array.isArray(analysis.missingInfo)
        ? analysis.missingInfo.map((info) => ({
            field: String(info.field || ""),
            type:
              info.type === "EXTERNAL_KNOWLEDGE" || info.type === "PRIVATE_DATA"
                ? info.type
                : "PRIVATE_DATA",
            description: String(info.description || ""),
          }))
        : [],
      searchQuery: analysis.searchQuery || query,
      reasoning: analysis.reasoning || "Analysis completed",
      confidence: Math.max(0, Math.min(1, Number(analysis.confidence) || 0.5)),
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "context-analyzer", operation: "analyzeContext" },
      extra: { query, url, hasHistory: chatHistory.length > 0, hasRagChunks: ragChunks.length > 0 },
    })
    console.error("[Context Analyzer] Error analyzing context:", error)

    // Fallback: conservative defaults
    return {
      source: "WEB_SEARCH",
      requiredSources: ["WEB_SEARCH"],
      missingInfo: [],
      searchQuery: query,
      reasoning: "Analysis failed, defaulting to search for safety",
      confidence: 0.3,
    }
  }
}
