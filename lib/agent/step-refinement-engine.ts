import * as Sentry from "@sentry/nextjs"

import type { VerificationSummary } from "@/lib/agent/verification/types"
import { recordUsage } from "@/lib/cost"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import {
  formatScreenshotContext,
  formatSkeletonForPrompt,
  VISUAL_BRIDGE_PROMPT,
} from "@/lib/llm/multimodal-helpers"
import { STEP_REFINEMENT_SCHEMA } from "@/lib/llm/response-schemas"
import type { PlanStep } from "@/lib/models/task"

import { getAvailableActionsPrompt, validateActionName } from "./action-config"
import { getOrCreateSkeleton } from "./dom-skeleton"
import { shouldUseVisualMode } from "./mode-router"
import type { DomMode, SemanticNodeV3 } from "./schemas"

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
 * Hybrid vision + skeleton options for step refinement
 */
export interface HybridOptions {
  /** Base64-encoded JPEG screenshot for visual context */
  screenshot?: string | null
  /** Pre-extracted skeleton DOM (if not provided, extracted from full DOM) */
  skeletonDom?: string
  /** DOM processing mode hint */
  domMode?: DomMode
  /** User query (for mode detection) */
  query?: string
  // Semantic-first V3 (PRIMARY)
  interactiveTree?: SemanticNodeV3[]
  viewport?: { width: number; height: number }
  pageTitle?: string
  scrollPosition?: string
  recentEvents?: string[]
  hasErrors?: boolean
  hasSuccess?: boolean
}

const SEMANTIC_LEGEND = `LEGEND for interactiveTree (semantic) format:
- i: element id (use this in click(i) or setValue(i, "text"))
- r: role (btn=button, inp=input, link=link, chk=checkbox, sel=select, etc.)
- n: visible name/label
- v: current value (inputs)
- s: state (disabled/checked/expanded/etc.)
- xy: [x, y] center point on screen (if provided)
- box: [x, y, w, h] bounding box (if provided)
- scr: { depth: string, h: boolean } scroll info (if provided)
- occ: true if occluded/covered (avoid clicking)`

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
 * @param hybridOptions - Hybrid vision + skeleton options (optional)
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
  context?: RefinementContext,
  hybridOptions?: HybridOptions
): Promise<RefinedToolAction | null> {
  const model = DEFAULT_PLANNING_MODEL
  const startTime = Date.now()

  // Determine if using visual mode for enhanced system prompt
  const useVisualModeForPrompt =
    Boolean(hybridOptions?.screenshot) &&
    (hybridOptions?.domMode === "hybrid" ||
      (hybridOptions?.query && shouldUseVisualMode(hybridOptions.query, true)))

  const visualBridgeSection = useVisualModeForPrompt
    ? `\n\n${VISUAL_BRIDGE_PROMPT}\n`
    : ""

  const systemPrompt = `You are a step refinement AI that converts high-level plan steps into specific tool actions.

Your job is to:
1. Analyze the plan step description and reasoning
2. Determine the specific tool action needed
3. Generate tool parameters based on the current page state
4. Respect the tool type (DOM vs SERVER) from the plan step
${visualBridgeSection}
${getAvailableActionsPrompt()}

Available SERVER Tools (Phase 3+, not implemented yet):
- These will be handled separately

Response Format:
You must respond with a JSON object containing:
- "toolName": The tool name (e.g., "click", "setValue", "finish", "fail")
- "toolType": Either "DOM" (browser action) or "SERVER" (API action)
- "parameters": Object with tool parameters (e.g., {"elementId": "123", "text": "value"})
- "action": The full action string (e.g., "click(123)", "setValue(456, \"text\")", "finish(\"Done\")")

CRITICAL RULES:
1. You MUST only use actions from the Available Actions list above
2. For DOM tools, find the specific element ID from the DOM (the id attribute value, NOT a CSS selector)
3. Generate concrete parameters (element IDs as strings, text values, etc.)
4. Respect the toolType from the plan step (if DOM, use DOM tools; if SERVER, indicate SERVER)
5. For SERVER tools, return toolType="SERVER" but action will be handled separately (Phase 3+)
6. NEVER use CSS selectors - only use element IDs
7. NEVER invent new action names - only use the valid actions from the Available Actions list
8. Action format must exactly match the examples in Available Actions

**CRITICAL: Handling Analysis/Answer Steps:**
When the plan step asks to "analyze", "figure out", "find", "answer", "respond with", or extract information:
1. **DO NOT use screenshot()** - screenshots are for visual capture, not data analysis
2. **Analyze the current page content directly** - the DOM contains all the text data you need
3. **Use finish(answer) to provide the answer** - extract the relevant data from the page structure and return it
4. Example: For "Analyze the members list and respond with highest spender":
   - Look at the page structure for member names and spending amounts
   - Extract the relevant data (names, amounts, etc.)
   - Generate: finish("Based on the members list, [User Name] spent the most with [Amount]")
5. The DOM/page structure shows the data - use it directly, don't take a screenshot

Guidelines:
- For click(): Extract the element's ID attribute value from the page structure (e.g., if element has id="123", use click(123))
- For setValue(): Extract element ID and provide the text value to set
- Be specific about element IDs and values
- **CRITICAL: Menu Items in Dropdowns**: If the plan step mentions clicking a menu item (e.g., "New/Search") after a dropdown opened:
  1. Look for the menu item element in the DOM by searching for its text content (e.g., "New/Search")
  2. Menu items often have different IDs than the dropdown button - find the specific menu item element
  3. Menu items may have role="menuitem", role="listitem", or be in a list structure
  4. The element ID for "New/Search" menu item is different from the "Patient" dropdown button ID
- **For analysis/question steps**: Read the page content, extract the answer, and use finish(answer) - NOT screenshot()
- Remember: The plan step uses user-friendly language - your job is to convert it to a technical action while keeping the user-friendly description in mind

**CRITICAL: Compound Step Handling (type AND submit):**
If the plan step contains compound actions like "type X and press Enter" or "enter text and click search":
1. Check previous actions - if setValue/type was already done for this search, generate press("Enter") to submit
2. If the input field already contains the search text (visible in DOM), generate press("Enter") or click on the search/submit button
3. For search workflows: After typing, the NEXT action should be press("Enter") or clicking the search button
4. NEVER skip the submit/enter step - search boxes require both typing AND pressing Enter to work`

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
  // For analysis/answer steps, send more DOM context so the LLM can see the actual data
  const isAnalysisStep =
    planStep.description.toLowerCase().includes("analyze") ||
    planStep.description.toLowerCase().includes("figure out") ||
    planStep.description.toLowerCase().includes("find") ||
    planStep.description.toLowerCase().includes("identify") ||
    planStep.description.toLowerCase().includes("respond with") ||
    planStep.description.toLowerCase().includes("answer") ||
    planStep.description.toLowerCase().includes("determine") ||
    planStep.description.toLowerCase().includes("which")

  // Hybrid mode: Determine if we should use visual mode
  const useVisualMode =
    Boolean(hybridOptions?.screenshot) &&
    (hybridOptions?.domMode === "hybrid" ||
      (hybridOptions?.query && shouldUseVisualMode(hybridOptions.query, true)))

  // Get appropriate DOM content based on mode
  let domContent: string
  let domLabel: string

  const hasSkeletonDom =
    typeof hybridOptions?.skeletonDom === "string" && hybridOptions.skeletonDom.length > 0

  if (hasSkeletonDom || hybridOptions?.domMode === "skeleton" || hybridOptions?.domMode === "hybrid") {
    // Use skeleton DOM for action targeting (preferred when provided via negotiation)
    const skeletonDom = getOrCreateSkeleton(currentDom, hybridOptions?.skeletonDom)
    domContent = skeletonDom
    domLabel = useVisualMode ? "Interactive Elements (Skeleton DOM)" : "Page Structure"
  } else {
    // Use larger DOM preview for analysis steps (8000 chars) vs action steps (4000 chars)
    const domPreviewLimit = isAnalysisStep ? 8000 : 4000
    domContent =
      currentDom.length > domPreviewLimit
        ? currentDom.substring(0, domPreviewLimit) + "... [truncated]"
        : currentDom
    domLabel = "Page Structure"
  }

  userParts.push(`\nCurrent Page State:`)
  userParts.push(`- URL: ${currentUrl}`)

  // Prefer interactiveTree (semantic) when available (backend-driven contract)
  if (hybridOptions?.interactiveTree && hybridOptions.interactiveTree.length > 0) {
    const metaParts: string[] = []
    if (hybridOptions.pageTitle) metaParts.push(`Title: ${hybridOptions.pageTitle}`)
    if (hybridOptions.viewport) metaParts.push(`Viewport: ${hybridOptions.viewport.width}x${hybridOptions.viewport.height}`)
    if (hybridOptions.scrollPosition) metaParts.push(`Scroll: ${hybridOptions.scrollPosition}`)
    if (hybridOptions.hasErrors === true) metaParts.push(`Signals: hasErrors=true`)
    if (hybridOptions.hasSuccess === true) metaParts.push(`Signals: hasSuccess=true`)
    const metaLine = metaParts.length > 0 ? metaParts.join(" | ") : undefined

    userParts.push(`\nInteractive Elements (semantic):`)
    if (metaLine) userParts.push(metaLine)
    userParts.push(SEMANTIC_LEGEND)
    userParts.push(JSON.stringify(hybridOptions.interactiveTree))
    if (hybridOptions.recentEvents && hybridOptions.recentEvents.length > 0) {
      userParts.push(`\nRecent events:`)
      hybridOptions.recentEvents.slice(0, 10).forEach((e) => userParts.push(`- ${e}`))
    }
  }

  // Add visual context if using hybrid mode
  if (useVisualMode && hybridOptions?.screenshot) {
    userParts.push(formatScreenshotContext(true))
    userParts.push(`\n${formatSkeletonForPrompt(domContent)}`)
  } else {
    userParts.push(`- ${domLabel}:`)
    userParts.push(domContent)
  }

  userParts.push(
    `\nBased on the plan step, previous actions, current page state, and knowledge context, refine this step into a specific tool action. Generate concrete parameters (element IDs, text values) that can be executed.

Note: The plan step description is written in user-friendly language. When generating the action, focus on finding the correct element IDs from the page structure, but remember that the user-facing thought messages will use user-friendly descriptions.`
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
      maxOutputTokens: 500,
      thinkingLevel: "low",
      responseJsonSchema: STEP_REFINEMENT_SCHEMA,
      generationName: "step_refinement",
      sessionId: context?.sessionId,
      userId: context?.userId,
      images,
      tags: ["refinement", ...(useVisualMode ? ["hybrid_mode"] : [])],
      metadata: {
        stepIndex: planStep.index,
        stepDescription: planStep.description,
        toolType: planStep.toolType,
        domMode: hybridOptions?.domMode ?? "full",
        useVisualMode,
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

