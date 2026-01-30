import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { PlanStep } from "@/lib/models/task"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { STEP_REFINEMENT_SCHEMA } from "@/lib/llm/response-schemas"
import type { VerificationSummary } from "@/lib/agent/verification/types"
import { getAvailableActionsPrompt, validateActionName } from "./action-config"

/**
 * Step Refinement Engine (Task 10)
 *
 * Converts high-level plan steps into specific tool actions.
 * Determines tool type (DOM vs SERVER) and generates tool parameters.
 */

/**
 * Context for cost tracking and Langfuse trace linkage (optional)
 */
export interface RefinementContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
  langfuseTraceId?: string
}

/**
 * Refined tool action
 */
export interface RefinedToolAction {
  toolName: string // e.g., "click", "setValue", "finish", "fail"
  toolType: "DOM" | "SERVER" // Tool type
  parameters: Record<string, unknown> // Tool parameters
  action: string // Full action string (e.g., "click(123)", "setValue(456, 'text')")
}

/**
 * Refine plan step to specific tool action
 *
 * @param planStep - The plan step to refine
 * @param currentDom - Current DOM state
 * @param currentUrl - Current URL
 * @param previousActions - Previous actions for context
 * @param ragChunks - RAG context chunks (if available)
 * @param hasOrgKnowledge - Whether org-specific knowledge was used
 * @param verificationSummary - Optional verification outcome (action_succeeded, task_completed) for "next step" context
 * @param previousActionsSummary - When rolling context is used, summary of earlier steps (e.g. "20 earlier steps completed.")
 * @param context - Cost tracking context (optional)
 * @returns Refined tool action
 */
export async function refineStep(
  planStep: PlanStep,
  currentDom: string,
  currentUrl: string,
  previousActions: Array<{ stepIndex: number; thought: string; action: string }> = [],
  ragChunks: ResolveKnowledgeChunk[] = [],
  hasOrgKnowledge = false,
  verificationSummary?: VerificationSummary,
  previousActionsSummary?: string,
  context?: RefinementContext
): Promise<RefinedToolAction | null> {
  const model = DEFAULT_PLANNING_MODEL
  const startTime = Date.now()

  const systemPrompt = `You are a step refinement AI that converts high-level plan steps into specific tool actions.

Your job is to:
1. Analyze the plan step description and reasoning
2. Determine the specific tool action needed
3. Generate tool parameters based on the current DOM
4. Respect the tool type (DOM vs SERVER) from the plan step

${getAvailableActionsPrompt()}

Available SERVER Tools (Phase 3+, not implemented yet):
- These will be handled separately

Response Format:
You must respond in the following format:
<ToolName>
toolName
</ToolName>
<ToolType>
DOM|SERVER
</ToolType>
<Parameters>
{
  "elementId": "123",
  "text": "value",
  "reason": "reason"
}
</Parameters>
<Action>
actionName(params)
</Action>

CRITICAL RULES:
1. You MUST only use actions from the Available Actions list above
2. For DOM tools, find the specific element ID from the DOM (the id attribute value, NOT a CSS selector)
3. Generate concrete parameters (element IDs as strings, text values, etc.)
4. Respect the toolType from the plan step (if DOM, use DOM tools; if SERVER, indicate SERVER)
5. For SERVER tools, return toolType="SERVER" but action will be handled separately (Phase 3+)
6. NEVER use CSS selectors - only use element IDs
7. NEVER invent new action names - only use: click, setValue, finish, fail
8. Action format must exactly match the examples in Available Actions

Guidelines:
- For click(): Extract the element's ID attribute value from the page structure (e.g., if element has id="123", use click(123))
- For setValue(): Extract element ID and provide the text value to set
- Be specific about element IDs and values
- **CRITICAL: Menu Items in Dropdowns**: If the plan step mentions clicking a menu item (e.g., "New/Search") after a dropdown opened:
  1. Look for the menu item element in the DOM by searching for its text content (e.g., "New/Search")
  2. Menu items often have different IDs than the dropdown button - find the specific menu item element
  3. Menu items may have role="menuitem", role="listitem", or be in a list structure
  4. The element ID for "New/Search" menu item is different from the "Patient" dropdown button ID
- Remember: The plan step uses user-friendly language - your job is to convert it to a technical action while keeping the user-friendly description in mind`

  // Build user message with context
  const userParts: string[] = []

  if (previousActionsSummary) {
    userParts.push(`Earlier progress: ${previousActionsSummary}\n`)
  }

  if (
    verificationSummary?.action_succeeded === true &&
    verificationSummary?.task_completed === false
  ) {
    userParts.push(
      `Previous action succeeded; the full user goal is not yet achieved. Continue with the next step.\n`
    )
  }

  userParts.push(`Plan Step to Refine:`)
  userParts.push(`- Description: ${planStep.description}`)
  if (planStep.reasoning) {
    userParts.push(`- Reasoning: ${planStep.reasoning}`)
  }
  userParts.push(`- Tool Type: ${planStep.toolType}`)
  userParts.push(`- Step Index: ${planStep.index}`)

  // Add previous actions for context
  if (previousActions.length > 0) {
    userParts.push(`\nPrevious Actions:`)
    previousActions.slice(-5).forEach((prevAction) => {
      userParts.push(`${prevAction.stepIndex}. ${prevAction.thought} -> ${prevAction.action}`)
    })
  }

  // Add RAG context if available
  if (ragChunks.length > 0) {
    const knowledgeType = hasOrgKnowledge ? "Organization-specific knowledge" : "Public knowledge"
    userParts.push(`\n${knowledgeType} (for reference):`)
    ragChunks.forEach((chunk, idx) => {
      userParts.push(`${idx + 1}. [${chunk.documentTitle}] ${chunk.content}`)
    })
  }

  // Add current DOM for context (Task 2: Don't mention "DOM")
  const domPreview = currentDom.length > 10000 ? currentDom.substring(0, 10000) + "... [truncated]" : currentDom
  userParts.push(`\nCurrent Page State:`)
  userParts.push(`- URL: ${currentUrl}`)
  userParts.push(`- Page Structure Preview: ${domPreview.substring(0, 2000)}`)

  userParts.push(
    `\nBased on the plan step, previous actions, current page state, and knowledge context, refine this step into a specific tool action. Generate concrete parameters (element IDs, text values) that can be executed.

Note: The plan step description is written in user-friendly language. When generating the action, focus on finding the correct element IDs from the page structure, but remember that the user-facing thought messages will use user-friendly descriptions.`
  )

  const userPrompt = userParts.join("\n")

  try {
    const result = await generateWithGemini(systemPrompt, userPrompt, {
      model,
      temperature: 0.7,
      maxOutputTokens: 500,
      thinkingLevel: "low",
      responseJsonSchema: STEP_REFINEMENT_SCHEMA,
      generationName: "step_refinement",
      sessionId: context?.sessionId,
      userId: context?.userId,
      tags: ["refinement"],
      metadata: {
        stepIndex: planStep.index,
        stepDescription: planStep.description,
        toolType: planStep.toolType,
      },
    })

    const durationMs = Date.now() - startTime
    const content = result?.content

    if (context?.tenantId && context?.userId && result?.promptTokens != null) {
      recordUsage({
        tenantId: context.tenantId,
        userId: context.userId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        langfuseTraceId: context.langfuseTraceId,
        provider: "google",
        model,
        actionType: "REFINEMENT",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        durationMs,
        metadata: {
          stepIndex: planStep.index,
          stepDescription: planStep.description,
          toolType: planStep.toolType,
        },
      }).catch((err: unknown) => {
        console.error("[Step Refinement] Cost tracking error:", err)
      })
    }

    if (!content) {
      Sentry.captureException(new Error("Empty step refinement LLM response"))
      return null
    }

    let parsed: { toolName: string; toolType: string; parameters?: Record<string, unknown>; action?: string }
    try {
      parsed = JSON.parse(content) as typeof parsed
    } catch (e: unknown) {
      Sentry.captureException(e)
      return null
    }
    const toolName = parsed.toolName?.trim() ?? ""
    if (!toolName) {
      return null
    }
    const toolTypeStr = (parsed.toolType ?? planStep.toolType).toString().toUpperCase()
    const toolType: "DOM" | "SERVER" = toolTypeStr === "SERVER" ? "SERVER" : "DOM"
    const parameters =
      typeof parsed.parameters === "object" && parsed.parameters !== null && !Array.isArray(parsed.parameters)
        ? (parsed.parameters as Record<string, unknown>)
        : {}

    if (toolType === "SERVER") {
      return {
        toolName,
        toolType: "SERVER",
        parameters: {},
        action: "",
      }
    }

    let action = (parsed.action ?? "").trim()
    const isJustToolName = action && !action.includes("(")
    if (!action || isJustToolName) {
      if (toolName === "click" && parameters.elementId != null) {
        action = `click(${parameters.elementId})`
      } else if (toolName === "setValue" && parameters.elementId != null && parameters.text != null) {
        action = `setValue(${parameters.elementId}, ${JSON.stringify(parameters.text)})`
      } else if (toolName === "finish") {
        action = "finish()"
      } else if (toolName === "fail" && parameters.reason != null) {
        action = `fail(${JSON.stringify(parameters.reason)})`
      } else {
        if (isJustToolName && action === toolName) {
          console.error(`[Step Refinement] Action is just tool name "${action}" but missing required parameters`, {
            toolName,
            parameters,
          })
        }
        return null
      }
    }

    const validation = validateActionName(action)
    if (!validation.valid) {
      const errorMessage = `Invalid refined action generated: "${action}". ${validation.error}`
      Sentry.captureException(new Error(errorMessage), {
        tags: { component: "step-refinement-engine", action, toolName, toolType },
        extra: { planStep: planStep ? { description: planStep.description, toolType: planStep.toolType, index: planStep.index } : undefined, parameters },
      })
      console.error(`[Step Refinement] ${errorMessage}`)
      return null
    }

    return {
      toolName,
      toolType: "DOM",
      parameters,
      action,
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    throw error
  }
}

