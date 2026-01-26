import { OpenAI } from "openai"
import * as Sentry from "@sentry/nextjs"
import type { ExpectedOutcome } from "@/lib/models/task-action"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"

/**
 * Outcome Prediction Engine (Task 9)
 *
 * Predicts what should happen after each action.
 * Generates expected outcome structure for verification.
 */

/**
 * Predict expected outcome for an action
 *
 * @param action - The action string (e.g., "click(123)", "setValue(456, 'text')")
 * @param thought - The LLM reasoning for this action
 * @param currentDom - Current DOM state
 * @param currentUrl - Current URL
 * @param ragChunks - RAG context chunks (if available)
 * @param hasOrgKnowledge - Whether org-specific knowledge was used
 * @returns Expected outcome structure
 */
export async function predictOutcome(
  action: string,
  thought: string,
  currentDom: string,
  currentUrl: string,
  ragChunks: ResolveKnowledgeChunk[] = [],
  hasOrgKnowledge = false
): Promise<ExpectedOutcome | null> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  const openai = new OpenAI({
    apiKey,
  })

  // Use lightweight model for prediction to reduce cost
  const model = process.env.OUTCOME_PREDICTION_MODEL || "gpt-4o-mini"

  const systemPrompt = `You are an outcome prediction AI that predicts what should happen after an action is executed.

Your job is to:
1. Analyze the action and its context
2. Predict what should happen after the action executes
3. Generate an expected outcome structure with:
   - Natural language description of what should happen
   - DOM-based expectations (element existence, text matching, URL changes)

Response Format:
You must respond in the following format:
<Description>
Natural language description of what should happen after this action...
</Description>
<DOMChanges>
<ElementShouldExist>selector</ElementShouldExist>
<ElementShouldNotExist>selector</ElementShouldNotExist>
<ElementShouldHaveText>
  <Selector>selector</Selector>
  <Text>expected text</Text>
</ElementShouldHaveText>
<URLShouldChange>true|false</URLShouldChange>
</DOMChanges>

Guidelines:
- Be specific about what should change in the DOM
- Include element selectors that can be verified
- Indicate if URL should change
- Consider the action type (click, setValue, etc.)
- Use knowledge context if available`

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

  // Add current DOM for context (truncate if too long)
  const domPreview = currentDom.length > 10000 ? currentDom.substring(0, 10000) + "... [truncated]" : currentDom
  userParts.push(`\nCurrent Page State:`)
  userParts.push(`- URL: ${currentUrl}`)
  userParts.push(`- DOM Preview: ${domPreview.substring(0, 2000)}`)

  userParts.push(
    `\nBased on the action, reasoning, current page state, and knowledge context, predict what should happen after this action executes. Generate specific DOM-based expectations that can be verified.`
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

  return {
    description,
    ...(Object.keys(domChanges).length > 0 ? { domChanges } : {}),
  }
}
