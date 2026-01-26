import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"

/**
 * Previous action from task history.
 */
export interface PreviousAction {
  stepIndex: number
  thought: string
  action: string
}

/**
 * Build LLM prompt for action loop.
 *
 * System message: role, available actions, format
 * User message: query, current time, action history, RAG context, DOM
 */
export function buildActionPrompt(params: {
  query: string
  currentTime: string
  previousActions: PreviousAction[]
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean
  dom: string
}): { system: string; user: string } {
  const { query, currentTime, previousActions, ragChunks, hasOrgKnowledge, dom } = params

  // System message: role and format
  const systemPrompt = `You are an AI agent that helps users complete tasks on web pages by executing actions.

Available Actions:
- click(elementId) - Click an element by its ID
- setValue(elementId, "text") - Set the value of an input field
- finish() - Task completed successfully
- fail(reason) - Task failed with reason

Response Format:
You must respond in the following format:
<Thought>
Your reasoning about what to do next...
</Thought>
<Action>
actionName(params)
</Action>

Example:
<Thought>
I need to find the submit button. Looking at the DOM, I can see button with id="submit-btn".
</Thought>
<Action>
click(submit-btn)
</Action>`

  // Build user message with context
  const userParts: string[] = []

  userParts.push(`User Query: ${query}`)
  userParts.push(`Current Time: ${currentTime}`)

  // Add action history if any
  if (previousActions.length > 0) {
    userParts.push("\nPrevious Actions:")
    previousActions.forEach((action, idx) => {
      userParts.push(
        `Step ${action.stepIndex}: ${action.thought}\nAction taken: ${action.action}`
      )
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

  // Add current DOM
  userParts.push(`\nCurrent DOM (simplified):`)
  userParts.push(dom)

  userParts.push(
    `\nBased on the user query, previous actions, knowledge context, and current DOM, determine the next action to take.`
  )

  return {
    system: systemPrompt,
    user: userParts.join("\n"),
  }
}

/**
 * Parse LLM response to extract <Thought> and <Action>.
 *
 * @param content - LLM response content
 * @returns { thought, action } or null if parse fails
 */
export function parseActionResponse(content: string): {
  thought: string
  action: string
} | null {
  const thoughtMatch = content.match(/<Thought>([\s\S]*?)<\/Thought>/i)
  const actionMatch = content.match(/<Action>([\s\S]*?)<\/Action>/i)

  if (!thoughtMatch || !actionMatch) {
    return null
  }

  const thought = thoughtMatch[1]?.trim() || ""
  const action = actionMatch[1]?.trim() || ""

  if (!thought || !action) {
    return null
  }

  return { thought, action }
}

/**
 * Validate action format.
 *
 * @param action - Action string (e.g. "click(123)", "setValue(456, 'text')", "finish()")
 * @returns true if valid format
 */
export function validateActionFormat(action: string): boolean {
  // Valid patterns:
  // - click(elementId)
  // - setValue(elementId, "text")
  // - finish()
  // - fail(reason)
  const validPatterns = [
    /^click\([^)]+\)$/,
    /^setValue\([^,]+,\s*"[^"]+"\)$/,
    /^finish\(\)$/,
    /^fail\([^)]*\)$/,
  ]

  return validPatterns.some((pattern) => pattern.test(action.trim()))
}
