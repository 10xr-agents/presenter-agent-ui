import * as Sentry from "@sentry/nextjs"
import type { TaskPlan, PlanStep } from "@/lib/models/task"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { WebSearchResult } from "./web-search"
import { getTracedOpenAIWithConfig } from "@/lib/observability"
import { recordUsage } from "@/lib/cost"

/**
 * Planning Engine (Task 6)
 *
 * Generates high-level action plans from user instructions.
 * Breaks down tasks into logical steps with tool types and expected outcomes.
 */

/**
 * Context for cost tracking (optional)
 */
export interface PlanningContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
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
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  // Use traced OpenAI client for LangFuse observability
  const openai = getTracedOpenAIWithConfig({
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

  // Use lightweight model for planning to reduce cost (as per requirements)
  const model = process.env.PLANNING_MODEL || "gpt-4o-mini"
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

Response Format:
You must respond in the following format:
<Plan>
<Step index="0">
<Description>User-friendly step description</Description>
<Reasoning>Why this step is needed (in plain language)</Reasoning>
<ToolType>DOM|SERVER|MIXED</ToolType>
<ExpectedOutcome>What should happen after this step (user-friendly description)</ExpectedOutcome>
</Step>
<Step index="1">
...
</Step>
</Plan>

Guidelines:
- Keep steps high-level and logical
- Each step should be independent (no complex dependencies initially)
- Use "DOM" for browser interactions (click, setValue, etc.)
- Use "SERVER" for API calls or data operations
- Use "MIXED" if step requires both DOM and server actions
- Keep plan linear (no complex DAGs initially)
- Aim for 3-10 steps depending on task complexity
- Write all descriptions as if explaining to a non-technical user`

  // Build user message with context
  const userParts: string[] = []

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
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    })

    const durationMs = Date.now() - startTime
    const content = response.choices[0]?.message?.content

    // Track cost (dual-write to MongoDB + LangFuse)
    if (context?.tenantId && context?.userId && response.usage) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        provider: "openai",
        model,
        actionType: "PLANNING",
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
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

    // Parse plan from LLM response
    const plan = parsePlanResponse(content)

    if (!plan) {
      Sentry.captureException(new Error("Failed to parse planning response"))
      return null
    }

    return {
      steps: plan.steps,
      currentStepIndex: 0,
      createdAt: new Date(),
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Parse LLM response to extract plan steps.
 *
 * @param content - LLM response content
 * @returns Parsed plan or null if parse fails
 */
function parsePlanResponse(content: string): { steps: PlanStep[] } | null {
  // Extract all Step blocks
  const stepRegex = /<Step\s+index="(\d+)">([\s\S]*?)<\/Step>/gi
  const steps: PlanStep[] = []

  let match
  while ((match = stepRegex.exec(content)) !== null) {
    const index = parseInt(match[1] || "0", 10)
    const stepContent = match[2] || ""

    // Extract fields from step content
    const descriptionMatch = stepContent.match(/<Description>([\s\S]*?)<\/Description>/i)
    const reasoningMatch = stepContent.match(/<Reasoning>([\s\S]*?)<\/Reasoning>/i)
    const toolTypeMatch = stepContent.match(/<ToolType>([\s\S]*?)<\/ToolType>/i)
    const expectedOutcomeMatch = stepContent.match(/<ExpectedOutcome>([\s\S]*?)<\/ExpectedOutcome>/i)

    const description = descriptionMatch?.[1]?.trim() || ""
    const reasoning = reasoningMatch?.[1]?.trim()
    const toolTypeStr = toolTypeMatch?.[1]?.trim()?.toUpperCase() || "DOM"
    const expectedOutcomeStr = expectedOutcomeMatch?.[1]?.trim()

    // Validate tool type
    const toolType = toolTypeStr === "SERVER" || toolTypeStr === "MIXED" ? toolTypeStr : "DOM"

    if (!description) {
      // Skip steps without description
      continue
    }

    steps.push({
      index,
      description,
      reasoning: reasoning || undefined,
      toolType,
      status: "pending",
      expectedOutcome: expectedOutcomeStr
        ? {
            description: expectedOutcomeStr,
          }
        : undefined,
    })
  }

  if (steps.length === 0) {
    return null
  }

  // Sort steps by index to ensure correct order
  steps.sort((a, b) => a.index - b.index)

  return { steps }
}
