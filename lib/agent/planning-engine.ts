import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { PlanStep, TaskPlan } from "@/lib/models/task"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { PLANNING_RESPONSE_SCHEMA } from "@/lib/llm/response-schemas"
import type { VerificationSummary } from "@/lib/agent/verification/types"
import type { WebSearchResult } from "./web-search"

/**
 * Planning Engine (Task 6)
 *
 * Generates high-level action plans from user instructions.
 * Breaks down tasks into logical steps with tool types and expected outcomes.
 */

/**
 * Context for cost tracking and Langfuse trace linkage.
 */
export interface PlanningContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
  /** Optional verification outcome for "next step" context when regenerating plan. */
  verificationSummary?: VerificationSummary
  /** Langfuse trace ID for this interact request (costs attached to this trace). */
  langfuseTraceId?: string
}

/**
 * Generate action plan from user instructions.
 *
 * @param query - User query/instructions
 * @param url - Current page URL
 * @param dom - Current DOM (simplified, for context)
 * @param ragChunks - RAG context chunks (if available)
 * @param hasOrgKnowledge - Whether org-specific knowledge was used
 * @param webSearchResult - Web search results (if available, Task 1)
 * @param context - Cost tracking context (optional)
 * @returns Generated plan or null on error
 */
export async function generatePlan(
  query: string,
  url: string,
  dom: string,
  ragChunks: ResolveKnowledgeChunk[] = [],
  hasOrgKnowledge = false,
  webSearchResult?: WebSearchResult,
  context?: PlanningContext
): Promise<TaskPlan | null> {
  const model = DEFAULT_PLANNING_MODEL
  const startTime = Date.now()

  // Build planning prompt (Task 2: User-friendly language)
  const systemPrompt = `You are a planning AI that breaks down user tasks into high-level action steps.

Your job is to analyze the user's instructions and create a linear plan of steps needed to complete the task.

**CRITICAL: Use user-friendly, non-technical language in step descriptions.**

For each step, provide:
- A clear, user-friendly description of what needs to be done (avoid technical terms like "DOM", "element ID", etc.)
- Reasoning for why this step is needed (in plain language)
- Tool type: "DOM" (browser actions), "SERVER" (API calls), or "MIXED" (both)
- Expected outcome (what should happen after this step completes, described in user-friendly terms)

**Language Guidelines:**
- ❌ AVOID: "Click element ID 68", "Navigate to DOM structure", "Verify element exists"
- ✅ USE: "Click on the 'Patient' button", "Go to the patient registration page", "Check if the form is open"

Respond with JSON only. Schema: steps (array of { index, description, reasoning?, toolType?, expectedOutcome? }).
- index: 0-based step number
- description: user-friendly step description (required)
- reasoning: why this step is needed (optional)
- toolType: "DOM" | "SERVER" | "MIXED" (optional, default DOM)
- expectedOutcome: what should happen after this step (optional)

Guidelines:
- Keep steps high-level and logical; each step independent
- Aim for 3-10 steps depending on task complexity
- Write all descriptions as if explaining to a non-technical user`

  // Build user message with context
  const userParts: string[] = []

  if (
    context?.verificationSummary?.action_succeeded === true &&
    context?.verificationSummary?.task_completed === false
  ) {
    userParts.push(
      `Previous action succeeded; the full user goal is not yet achieved. Create or adjust the plan for the remaining steps.\n`
    )
  }

  userParts.push(`User Query: ${query}`)
  userParts.push(`Current URL: ${url}`)

  // Task 1: Add web search results if available
  if (webSearchResult) {
    userParts.push(`\n## Web Search Results`)
    userParts.push(`I searched the web to understand how to complete this task. Here's what I found:`)
    userParts.push(`\nSearch Query: ${webSearchResult.searchQuery}`)
    userParts.push(`\nSummary: ${webSearchResult.summary}`)
    userParts.push(`\nTop Results:`)
    webSearchResult.results.forEach((r, i) => {
      userParts.push(`${i + 1}. ${r.title}`)
      userParts.push(`   ${r.snippet}`)
      userParts.push(`   ${r.url}`)
    })
    userParts.push(`\nUse this information to create a more accurate plan.`)
  }

  // Add RAG context if available
  if (ragChunks.length > 0) {
    const knowledgeType = hasOrgKnowledge ? "Organization-specific knowledge" : "Public knowledge"
    userParts.push(`\n${knowledgeType} (for reference):`)
    ragChunks.forEach((chunk, idx) => {
      userParts.push(`${idx + 1}. [${chunk.documentTitle}] ${chunk.content}`)
    })
  }

  // Add simplified DOM for context (Task 2: Don't mention "DOM" - use "page structure")
  const domPreview = dom.length > 10000 ? dom.substring(0, 10000) + "... [truncated]" : dom
  userParts.push(`\n## Current Page Structure`)
  userParts.push(domPreview)

  userParts.push(
    `\nBased on the user query, knowledge context, and current page structure, create a linear action plan to complete the task. 

Remember: Write all step descriptions in user-friendly language that a non-technical user would understand. Avoid technical terms like "DOM", "element ID", "verification", etc.`
  )

  const userPrompt = userParts.join("\n")

  try {
    const result = await generateWithGemini(systemPrompt, userPrompt, {
      model,
      temperature: 0.7,
      maxOutputTokens: 2000,
      useGoogleSearchGrounding: true,
      thinkingLevel: "high",
      responseJsonSchema: PLANNING_RESPONSE_SCHEMA,
      generationName: "task_planning",
      sessionId: context?.sessionId,
      userId: context?.userId,
      tags: ["planning"],
      metadata: {
        query,
        url,
        hasOrgKnowledge,
        hasWebSearch: !!webSearchResult,
      },
    })

    const content = result?.content
    const durationMs = Date.now() - startTime

    if (context?.tenantId && context?.userId && result?.promptTokens != null) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        langfuseTraceId: context.langfuseTraceId,
        provider: "google",
        model,
        actionType: "PLANNING",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        durationMs,
        metadata: {
          query,
          url,
          hasOrgKnowledge,
          hasWebSearch: !!webSearchResult,
        },
      }).catch((err: unknown) => {
        console.error("[Planning] Cost tracking error:", err)
      })
    }

    if (!content) {
      Sentry.captureException(new Error("Empty planning LLM response"))
      return null
    }

    let parsed: { steps: Array<{ index: number; description: string; reasoning?: string; toolType?: string; expectedOutcome?: string }> }
    try {
      parsed = JSON.parse(content) as typeof parsed
    } catch (e: unknown) {
      Sentry.captureException(e)
      return null
    }
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      Sentry.captureException(new Error("Planning response had no steps"))
      return null
    }

    const steps: PlanStep[] = parsed.steps
      .filter((s) => s.description?.trim())
      .map((s) => {
        const toolTypeStr = (s.toolType ?? "DOM").toUpperCase()
        const toolType: "DOM" | "SERVER" | "MIXED" =
          toolTypeStr === "SERVER" || toolTypeStr === "MIXED" ? toolTypeStr : "DOM"
        return {
          index: Number(s.index),
          description: s.description.trim(),
          reasoning: s.reasoning?.trim() || undefined,
          toolType,
          status: "pending" as const,
          expectedOutcome: s.expectedOutcome?.trim()
            ? { description: s.expectedOutcome.trim() }
            : undefined,
        }
      })
      .sort((a, b) => a.index - b.index)

    return {
      steps,
      currentStepIndex: 0,
      createdAt: new Date(),
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    throw error
  }
}

