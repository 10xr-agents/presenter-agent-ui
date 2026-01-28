import * as Sentry from "@sentry/nextjs"
import { recordUsage } from "@/lib/cost"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import { getTracedOpenAIWithConfig } from "@/lib/observability"
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
 * Context for cost tracking (optional)
 */
export interface OutcomePredictionContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
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

  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  // Use traced OpenAI client for LangFuse observability
  const openai = getTracedOpenAIWithConfig({
    generationName: "outcome_prediction",
    sessionId: context?.sessionId,
    userId: context?.userId,
    tags: ["prediction"],
    metadata: {
      action,
      actionType,
    },
  })

  // Use lightweight model for prediction to reduce cost
  const model = process.env.OUTCOME_PREDICTION_MODEL || "gpt-4o-mini"
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
        actionType: "OUTCOME_PREDICTION",
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
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

    // Parse expected outcome from LLM response
    const expectedOutcome = parseOutcomeResponse(content)

    if (!expectedOutcome) {
      Sentry.captureException(new Error("Failed to parse outcome prediction response"))
      return null
    }

    return expectedOutcome
  } catch (error: unknown) {
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Parse LLM response to extract expected outcome structure
 */
function parseOutcomeResponse(content: string): ExpectedOutcome | null {
  // Extract description
  const descriptionMatch = content.match(/<Description>([\s\S]*?)<\/Description>/i)
  const description = descriptionMatch?.[1]?.trim() || ""

  if (!description) {
    // If no description provided, return null
    return null
  }

  // Extract DOM changes
  const domChanges: ExpectedOutcome["domChanges"] = {}

  // Element should exist
  const elementShouldExistMatch = content.match(/<ElementShouldExist>([\s\S]*?)<\/ElementShouldExist>/i)
  if (elementShouldExistMatch?.[1]?.trim()) {
    domChanges.elementShouldExist = elementShouldExistMatch[1].trim()
  }

  // Element should not exist
  const elementShouldNotExistMatch = content.match(/<ElementShouldNotExist>([\s\S]*?)<\/ElementShouldNotExist>/i)
  if (elementShouldNotExistMatch?.[1]?.trim()) {
    domChanges.elementShouldNotExist = elementShouldNotExistMatch[1].trim()
  }

  // Element should have text
  const elementShouldHaveTextMatch = content.match(
    /<ElementShouldHaveText>[\s\S]*?<Selector>([\s\S]*?)<\/Selector>[\s\S]*?<Text>([\s\S]*?)<\/Text>[\s\S]*?<\/ElementShouldHaveText>/i
  )
  if (elementShouldHaveTextMatch?.[1]?.trim() && elementShouldHaveTextMatch?.[2]?.trim()) {
    domChanges.elementShouldHaveText = {
      selector: elementShouldHaveTextMatch[1].trim(),
      text: elementShouldHaveTextMatch[2].trim(),
    }
  }

  // URL should change
  const urlShouldChangeMatch = content.match(/<URLShouldChange>([\s\S]*?)<\/URLShouldChange>/i)
  if (urlShouldChangeMatch?.[1]?.trim()) {
    const urlShouldChangeStr = urlShouldChangeMatch[1].trim().toLowerCase()
    domChanges.urlShouldChange = urlShouldChangeStr === "true" || urlShouldChangeStr === "yes"
  }

  // Attribute changes (for popup/dropdown elements)
  const attributeChangeMatches = Array.from(
    content.matchAll(/<AttributeChange>[\s\S]*?<Attribute>([\s\S]*?)<\/Attribute>[\s\S]*?<ExpectedValue>([\s\S]*?)<\/ExpectedValue>[\s\S]*?<\/AttributeChange>/gi)
  )
  const attributeChanges: Array<{ attribute: string; expectedValue: string }> = []
  for (const match of attributeChangeMatches) {
    if (match[1]?.trim() && match[2]?.trim()) {
      attributeChanges.push({
        attribute: match[1].trim(),
        expectedValue: match[2].trim(),
      })
    }
  }
  if (attributeChanges.length > 0) {
    domChanges.attributeChanges = attributeChanges
  }

  // Elements to appear (for popup/dropdown verification)
  const elementShouldAppearMatches = Array.from(
    content.matchAll(/<ElementShouldAppear>[\s\S]*?(?:<Role>([\s\S]*?)<\/Role>)?[\s\S]*?(?:<Selector>([\s\S]*?)<\/Selector>)?[\s\S]*?<\/ElementShouldAppear>/gi)
  )
  const elementsToAppear: Array<{ role?: string; selector?: string }> = []
  for (const match of elementShouldAppearMatches) {
    if (match[1]?.trim() || match[2]?.trim()) {
      elementsToAppear.push({
        role: match[1]?.trim(),
        selector: match[2]?.trim(),
      })
    }
  }
  if (elementsToAppear.length > 0) {
    domChanges.elementsToAppear = elementsToAppear
  }

  // Elements to disappear
  const elementShouldDisappearMatches = Array.from(
    content.matchAll(/<ElementShouldDisappear>[\s\S]*?(?:<Role>([\s\S]*?)<\/Role>)?[\s\S]*?(?:<Selector>([\s\S]*?)<\/Selector>)?[\s\S]*?<\/ElementShouldDisappear>/gi)
  )
  const elementsToDisappear: Array<{ role?: string; selector?: string }> = []
  for (const match of elementShouldDisappearMatches) {
    if (match[1]?.trim() || match[2]?.trim()) {
      elementsToDisappear.push({
        role: match[1]?.trim(),
        selector: match[2]?.trim(),
      })
    }
  }
  if (elementsToDisappear.length > 0) {
    domChanges.elementsToDisappear = elementsToDisappear
  }

  // Phase 3 Task 3: Parse NextGoal for look-ahead verification
  const nextGoalMatch = content.match(/<NextGoal>([\s\S]*?)<\/NextGoal>/i)
  let nextGoal: ExpectedOutcome["nextGoal"] | undefined
  
  if (nextGoalMatch?.[1]) {
    const nextGoalContent = nextGoalMatch[1]
    
    const ngDescriptionMatch = nextGoalContent.match(/<Description>([\s\S]*?)<\/Description>/i)
    const ngSelectorMatch = nextGoalContent.match(/<Selector>([\s\S]*?)<\/Selector>/i)
    const ngTextContentMatch = nextGoalContent.match(/<TextContent>([\s\S]*?)<\/TextContent>/i)
    const ngRoleMatch = nextGoalContent.match(/<Role>([\s\S]*?)<\/Role>/i)
    const ngRequiredMatch = nextGoalContent.match(/<Required>([\s\S]*?)<\/Required>/i)
    
    const ngDescription = ngDescriptionMatch?.[1]?.trim()
    const ngSelector = ngSelectorMatch?.[1]?.trim()
    const ngTextContent = ngTextContentMatch?.[1]?.trim()
    const ngRole = ngRoleMatch?.[1]?.trim()
    const ngRequiredStr = ngRequiredMatch?.[1]?.trim()?.toLowerCase()
    const ngRequired = ngRequiredStr === "true" || ngRequiredStr === "yes"
    
    if (ngDescription) {
      nextGoal = {
        description: ngDescription,
        selector: ngSelector || undefined,
        textContent: ngTextContent || undefined,
        role: ngRole || undefined,
        required: ngRequired,
      }
    }
  }

  return {
    description,
    ...(Object.keys(domChanges).length > 0 ? { domChanges } : {}),
    ...(nextGoal ? { nextGoal } : {}),
  }
}
