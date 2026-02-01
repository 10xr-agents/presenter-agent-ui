import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { OUTCOME_PREDICTION_SCHEMA } from "@/lib/llm/response-schemas"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import { classifyActionType } from "./action-type"

/**
 * Outcome Prediction Engine (Task 9)
 *
 * Predicts what should happen after each action.
 * Generates expected outcome structure for verification.
 * Uses action-type classification: dropdown actions get a fixed template (no LLM
 * over-specification); others use LLM prediction.
 */

/**
 * Context for cost tracking and Langfuse trace linkage (optional)
 */
export interface OutcomePredictionContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
  langfuseTraceId?: string
}

/** Fixed expected outcome for dropdown/popup clicks. No elementShouldExist, elementShouldNotExist, or elementShouldHaveText. */
function dropdownExpectedOutcome(thought: string): ExpectedOutcome {
  const description =
    thought && thought.length > 0
      ? thought.replace(/\s+/g, " ").trim().slice(0, 200)
      : "A dropdown menu should open."
  return {
    description,
    domChanges: {
      urlShouldChange: false,
      attributeChanges: [{ attribute: "aria-expanded", expectedValue: "true" }],
      elementsToAppear: [{ role: "list" }, { role: "listitem" }],
    },
  }
}

/** Fixed expected outcome for navigate/goBack. URL should change. */
function navigationExpectedOutcome(thought: string): ExpectedOutcome {
  const description =
    thought && thought.length > 0
      ? thought.replace(/\s+/g, " ").trim().slice(0, 200)
      : "The page should navigate to the new URL."
  return {
    description,
    domChanges: { urlShouldChange: true },
  }
}

/**
 * Predict expected outcome for an action
 *
 * @param action - The action string (e.g., "click(123)", "setValue(456, 'text')")
 * @param thought - The LLM reasoning for this action
 * @param currentDom - Current DOM state
 * @param currentUrl - Current URL
 * @param ragChunks - RAG context chunks (if available)
 * @param hasOrgKnowledge - Whether org-specific knowledge was used
 * @param context - Cost tracking context (optional)
 * @returns Expected outcome structure
 */
export async function predictOutcome(
  action: string,
  thought: string,
  currentDom: string,
  currentUrl: string,
  ragChunks: ResolveKnowledgeChunk[] = [],
  hasOrgKnowledge = false,
  context?: OutcomePredictionContext
): Promise<ExpectedOutcome | null> {
  const actionType = classifyActionType(action, currentDom)

  // Log action type classification for debugging
  console.log(`[OutcomePrediction] Action "${action}" classified as: ${actionType}`)

  if (actionType === "dropdown") {
    console.log(`[OutcomePrediction] Using dropdown template (no elementShouldExist)`)
    return dropdownExpectedOutcome(thought)
  }
  if (actionType === "navigation") {
    console.log(`[OutcomePrediction] Using navigation template (urlShouldChange only)`)
    return navigationExpectedOutcome(thought)
  }

  const model = DEFAULT_PLANNING_MODEL
  const startTime = Date.now()

  const systemPrompt = `You are an outcome prediction AI that predicts what should happen after an action is executed.

Your job is to:
1. Analyze the action and its context
2. Predict what should happen after the action executes
3. Generate an expected outcome structure with:
   - User-friendly description of what should happen (avoid technical terms)
   - Page-based expectations (element existence, text matching, URL changes)

**CRITICAL: Use user-friendly, non-technical language in the <Description>.**

## Dropdown/Popup Elements (CRITICAL)

When clicking an element that has \`aria-haspopup\` or \`data-has-popup\` attribute:
1. The expected behavior is that a dropdown/popup opens (NOT page navigation)
2. The URL will NOT change - set <URLShouldChange>false</URLShouldChange>
3. New elements will appear with roles like 'menuitem', 'option', 'dialog'
4. The clicked element's \`aria-expanded\` will change to "true"
5. After the dropdown opens, you must select an option from the dropdown to proceed

Common patterns:
- Navigation buttons with hasPopup="menu" open dropdown menus
- Comboboxes with hasPopup="listbox" open option lists
- Buttons with hasPopup="dialog" open modal dialogs

For popup elements, include:
- <URLShouldChange>false</URLShouldChange>
- <AttributeChange>
  <Attribute>aria-expanded</Attribute>
  <ExpectedValue>true</ExpectedValue>
</AttributeChange>
- <ElementShouldAppear>
  <Role>list</Role> <!-- or 'listitem', 'menuitem', 'option', 'dialog' - many UIs use list/listitem -->
</ElementShouldAppear>
- Do NOT use <ElementShouldNotExist> for dropdowns. Other nav buttons stay collapsed; that check falsely fails.

Response Format:
You must respond in the following format:
<Description>
User-friendly description of what should happen after this action (e.g., "The form should open" not "Element with selector 'form' should exist in DOM")
</Description>
<DOMChanges>
<ElementShouldExist>selector</ElementShouldExist>
<ElementShouldNotExist>selector</ElementShouldNotExist>
<ElementShouldHaveText>
  <Selector>selector</Selector>
  <Text>expected text</Text>
</ElementShouldHaveText>
<URLShouldChange>true|false</URLShouldChange>
<!-- For popup/dropdown elements: -->
<AttributeChange>
  <Attribute>aria-expanded</Attribute>
  <ExpectedValue>true</ExpectedValue>
</AttributeChange>
<ElementShouldAppear>
  <Role>list</Role> <!-- or listitem, menuitem, option, dialog -->
  <Selector>optional-selector</Selector>
</ElementShouldAppear>
<ElementShouldDisappear>
  <Role>optional-role</Role>
  <Selector>optional-selector</Selector>
</ElementShouldDisappear>
</DOMChanges>
<!-- IMPORTANT: Look-Ahead Verification (predict what's needed for NEXT step) -->
<NextGoal>
  <Description>What element or state should be available for the next step</Description>
  <Selector>CSS selector for the element needed next (optional)</Selector>
  <TextContent>Text to look for in the next element (optional)</TextContent>
  <Role>ARIA role of the element needed (optional)</Role>
  <Required>true|false</Required> <!-- If true, missing next-goal causes failure -->
</NextGoal>

**Language Guidelines:**
- ❌ AVOID: "Element with selector 'form' should exist", "DOM structure should change", "Element ID 123 should appear"
- ✅ USE: "The form should open", "A new page should load", "The submit button should appear"

Guidelines:
- Be specific about what should change on the page
- Include element selectors that can be verified (for technical verification)
- Indicate if URL should change
- Consider the action type (click, setValue, etc.)
- Use knowledge context if available
- Write the description as if explaining to a non-technical user`

  // Build user message with context
  const userParts: string[] = []

  userParts.push(`Action to Execute:`)
  userParts.push(`- Action: ${action}`)
  userParts.push(`- Reasoning: ${thought}`)

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
    `\nBased on the action, reasoning, current page state, and knowledge context, predict what should happen after this action executes. Generate specific page-based expectations that can be verified.

Remember: Write the <Description> in user-friendly language that a non-technical user would understand. Avoid technical terms like "DOM", "element selector", etc. Focus on what the user would see (e.g., "The form should open" instead of "Element with selector 'form' should exist").`
  )

  const userPrompt = userParts.join("\n")

  try {
    const result = await generateWithGemini(systemPrompt, userPrompt, {
      model,
      temperature: 0.7,
      maxOutputTokens: 500,
      thinkingLevel: "high",
      responseJsonSchema: OUTCOME_PREDICTION_SCHEMA,
      generationName: "outcome_prediction",
      sessionId: context?.sessionId,
      userId: context?.userId,
      tags: ["prediction"],
      metadata: {
        action,
        actionType,
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
        actionType: "OUTCOME_PREDICTION",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        durationMs,
        metadata: {
          action,
          actionType,
        },
      }).catch((err: unknown) => {
        console.error("[Outcome Prediction] Cost tracking error:", err)
      })
    }

    if (!content) {
      Sentry.captureException(new Error("Empty outcome prediction LLM response"))
      return null
    }

    let parsed: {
      description?: string
      domChanges?: ExpectedOutcome["domChanges"]
      nextGoal?: ExpectedOutcome["nextGoal"]
    }
    try {
      parsed = JSON.parse(content) as typeof parsed
    } catch (e: unknown) {
      Sentry.captureException(e)
      return null
    }
    const description = (parsed.description ?? "").trim()
    if (!description) {
      return null
    }
    const domChanges = parsed.domChanges ?? {}
    const nextGoal = parsed.nextGoal
    return {
      description,
      ...(Object.keys(domChanges).length > 0 ? { domChanges } : {}),
      ...(nextGoal ? { nextGoal } : {}),
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    throw error
  }
}

