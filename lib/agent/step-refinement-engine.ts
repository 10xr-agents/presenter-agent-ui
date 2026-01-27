import { OpenAI } from "openai"
import * as Sentry from "@sentry/nextjs"
import type { PlanStep } from "@/lib/models/task"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import { getAvailableActionsPrompt, validateActionName } from "./action-config"

/**
 * Step Refinement Engine (Task 10)
 *
 * Converts high-level plan steps into specific tool actions.
 * Determines tool type (DOM vs SERVER) and generates tool parameters.
 */

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
 * @returns Refined tool action
 */
export async function refineStep(
  planStep: PlanStep,
  currentDom: string,
  currentUrl: string,
  previousActions: Array<{ stepIndex: number; thought: string; action: string }> = [],
  ragChunks: ResolveKnowledgeChunk[] = [],
  hasOrgKnowledge = false
): Promise<RefinedToolAction | null> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  const openai = new OpenAI({
    apiKey,
  })

  // Use lightweight model for refinement to reduce cost
  const model = process.env.STEP_REFINEMENT_MODEL || "gpt-4o-mini"

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
- Remember: The plan step uses user-friendly language - your job is to convert it to a technical action while keeping the user-friendly description in mind`

  // Build user message with context
  const userParts: string[] = []

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
      max_tokens: 500,
    })

    const content = response.choices[0]?.message?.content

    if (!content) {
      Sentry.captureException(new Error("Empty step refinement LLM response"))
      return null
    }

    // Parse refined tool action from LLM response
    const refinedAction = parseRefinementResponse(content, planStep.toolType, planStep)

    if (!refinedAction) {
      Sentry.captureException(new Error("Failed to parse step refinement response"))
      return null
    }

    return refinedAction
  } catch (error: unknown) {
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Parse LLM response to extract refined tool action
 */
function parseRefinementResponse(
  content: string,
  planToolType: "DOM" | "SERVER" | "MIXED",
  planStep?: PlanStep
): RefinedToolAction | null {
  // Extract tool name
  const toolNameMatch = content.match(/<ToolName>([\s\S]*?)<\/ToolName>/i)
  const toolName = toolNameMatch?.[1]?.trim() || ""

  if (!toolName) {
    return null
  }

  // Extract tool type
  const toolTypeMatch = content.match(/<ToolType>([\s\S]*?)<\/ToolType>/i)
  let toolTypeStr = toolTypeMatch?.[1]?.trim()?.toUpperCase() || planToolType.toUpperCase()

  // Validate tool type (must be DOM or SERVER)
  const toolType: "DOM" | "SERVER" = toolTypeStr === "SERVER" ? "SERVER" : "DOM"

  // For SERVER tools, we don't generate actions yet (Phase 3+)
  if (toolType === "SERVER") {
    // Return SERVER tool indication but action will be handled separately
    return {
      toolName,
      toolType: "SERVER",
      parameters: {},
      action: "", // SERVER tools handled separately (Phase 3+)
    }
  }

  // Extract parameters
  const parametersMatch = content.match(/<Parameters>([\s\S]*?)<\/Parameters>/i)
  let parameters: Record<string, unknown> = {}
  if (parametersMatch?.[1]?.trim()) {
    try {
      const parsed = JSON.parse(parametersMatch[1].trim())
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        parameters = parsed as Record<string, unknown>
      }
    } catch {
      // If JSON parse fails, try to extract parameters from action string
      parameters = {}
    }
  }

  // Extract action string
  const actionMatch = content.match(/<Action>([\s\S]*?)<\/Action>/i)
  let action = actionMatch?.[1]?.trim() || ""

  if (!action) {
    // If no action provided, try to construct from toolName and parameters
    if (toolName === "click" && parameters.elementId) {
      action = `click(${parameters.elementId})`
    } else if (toolName === "setValue" && parameters.elementId && parameters.text) {
      action = `setValue(${parameters.elementId}, ${JSON.stringify(parameters.text)})`
    } else if (toolName === "finish") {
      action = "finish()"
    } else if (toolName === "fail" && parameters.reason) {
      action = `fail(${JSON.stringify(parameters.reason)})`
    } else {
      return null
    }
  }

  // CRITICAL: Validate action against configuration
  const validation = validateActionName(action)
  if (!validation.valid) {
    // Log error and reject invalid action
    const errorMessage = `Invalid refined action generated: "${action}". ${validation.error}`
    Sentry.captureException(new Error(errorMessage), {
      tags: {
        component: "step-refinement-engine",
        action,
        toolName,
        toolType,
      },
      extra: {
        planStep: planStep
          ? {
              description: planStep.description,
              toolType: planStep.toolType,
              index: planStep.index,
            }
          : undefined,
        parameters,
      },
    })
    console.error(`[Step Refinement] ${errorMessage}`)
    // Return null to reject invalid action
    return null
  }

  return {
    toolName,
    toolType: "DOM",
    parameters,
    action,
  }
}
