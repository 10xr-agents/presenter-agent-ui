import * as Sentry from "@sentry/nextjs"

import type { VerificationSummary } from "@/lib/agent/verification/types"
import { recordUsage } from "@/lib/cost"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { formatScreenshotContext } from "@/lib/llm/multimodal-helpers"
import { PLANNING_RESPONSE_SCHEMA } from "@/lib/llm/response-schemas"
import type { PlanStep, TaskPlan } from "@/lib/models/task"

import { getOrCreateSkeleton } from "./dom-skeleton"
import { shouldUseVisualMode } from "./mode-router"
import type { DomMode } from "./schemas"
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
 * Hybrid vision + skeleton options for planning
 */
export interface PlanningHybridOptions {
  /** Base64-encoded JPEG screenshot for visual context */
  screenshot?: string | null
  /** Pre-extracted skeleton DOM (if not provided, extracted from full DOM) */
  skeletonDom?: string
  /** DOM processing mode hint */
  domMode?: DomMode
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
 * @param hybridOptions - Hybrid vision + skeleton options (optional)
 * @returns Generated plan or null on error
 */
export async function generatePlan(
  query: string,
  url: string,
  dom: string,
  ragChunks: ResolveKnowledgeChunk[] = [],
  hasOrgKnowledge = false,
  webSearchResult?: WebSearchResult,
  context?: PlanningContext,
  hybridOptions?: PlanningHybridOptions
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

**CRITICAL: Handling Questions and Analysis Tasks:**
When the user asks a question or wants to find/figure out information (e.g., "figure out which...", "find out...", "what is the...", "which user..."):
1. Navigate to the relevant page/section first (if needed)
2. **DO NOT create "Review" or "Look at" steps** - these are ambiguous
3. **Instead, create an "Answer" step** that explicitly states to analyze the visible content and respond with the answer
4. Example: Instead of "Review the list to find highest spender", use "Analyze the members list and respond with the name of the user who spent the most"
5. The answer step should indicate the specific information to extract and return

Respond with JSON only. Schema: steps (array of { index, description, reasoning?, toolType?, expectedOutcome? }).
- index: 0-based step number
- description: user-friendly step description (required)
- reasoning: why this step is needed (optional)
- toolType: "DOM" | "SERVER" | "MIXED" (optional, default DOM)
- expectedOutcome: what should happen after this step (optional)

Guidelines:
- Keep steps high-level and logical; each step independent
- Aim for 3-10 steps depending on task complexity
- Write all descriptions as if explaining to a non-technical user
- For questions/analysis: Create explicit "Answer with [specific info]" steps, not vague "Review" steps

**CRITICAL: ONE action per step - NO compound actions:**
- Each step must represent exactly ONE browser action (one click, one text input, one navigation, etc.)
- ❌ WRONG: "Type 'search query' and press Enter" (this is TWO actions)
- ✅ CORRECT: Step 1: "Type 'search query' in the search box", Step 2: "Press Enter to submit the search"
- ❌ WRONG: "Fill in the form and click Submit" (this is MULTIPLE actions)
- ✅ CORRECT: Separate steps for each field, then a step for clicking Submit
- Search workflows require TWO steps: (1) Type in search box, (2) Press Enter or click search button

**CRITICAL: Every action-oriented plan must end with a completion step**
- For form submissions: Include "Verify the form was submitted successfully and the confirmation appears"
- For invitations: Include "Verify the invitation was sent and confirm the action"
- For any action: The final step should verify the action was completed, NOT just click a button
- Example: If step 3 is "Click Send", step 4 should be "Verify the invitation was sent successfully"
- NEVER end a plan with just a button click - always include verification of the outcome`

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

  // Determine if we should use visual mode
  const useVisualMode =
    hybridOptions?.domMode === "hybrid" ||
    (hybridOptions?.screenshot && shouldUseVisualMode(query, true))

  // Add page content based on mode
  if (useVisualMode && hybridOptions?.screenshot) {
    // Hybrid mode: screenshot for visual context, skeleton for structure
    userParts.push(formatScreenshotContext(true))
    
    // Use skeleton DOM for page structure
    const skeletonDom = getOrCreateSkeleton(dom, hybridOptions?.skeletonDom)
    userParts.push(`\n## Interactive Elements`)
    userParts.push(`The following elements are available for interaction:`)
    userParts.push(skeletonDom)
  } else {
    // Full DOM mode (traditional)
    const domPreview = dom.length > 10000 ? dom.substring(0, 10000) + "... [truncated]" : dom
    userParts.push(`\n## Current Page Structure`)
    userParts.push(domPreview)
  }

  userParts.push(
    `\nBased on the user query, knowledge context, and current page structure, create a linear action plan to complete the task. 

Remember: Write all step descriptions in user-friendly language that a non-technical user would understand. Avoid technical terms like "DOM", "element ID", "verification", etc.`
  )

  const userPrompt = userParts.join("\n")

  try {
    // Include screenshot for visual mode
    const images =
      useVisualMode && hybridOptions?.screenshot
        ? [{ data: hybridOptions.screenshot, mimeType: "image/jpeg" }]
        : undefined

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
      images,
      tags: ["planning", ...(useVisualMode ? ["hybrid_mode"] : [])],
      metadata: {
        query,
        url,
        hasOrgKnowledge,
        hasWebSearch: !!webSearchResult,
        domMode: hybridOptions?.domMode ?? "full",
        useVisualMode,
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

