import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import { getAvailableActionsPrompt } from "./action-config"

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
  systemMessages?: string[] // Task 4: Error context messages
}): { system: string; user: string } {
  const { query, currentTime, previousActions, ragChunks, hasOrgKnowledge, dom, systemMessages } = params

  // System message: role and format (Task 2: User-friendly language, Task 4: Failure handling)
  const systemPrompt = `You are an AI assistant that helps users complete tasks on web pages through browser automation.

## Failure Handling Rules

**CRITICAL: You must strictly follow these rules when handling failures:**

1. **Acknowledge Failures:** If you receive a system error message indicating a previous action failed, you MUST:
   - Acknowledge the failure in your <Thought>
   - Explain why it might have failed in user-friendly terms
   - Propose a different strategy (e.g., "The button wasn't found. Let me try searching for the text instead.")
   - NEVER try the exact same action again
   - NEVER call finish() immediately after a failure

2. **Verification Before Completion:** Before calling finish(), you MUST verify:
   - The task has actually been completed (check the page state)
   - No recent actions have failed
   - The user's goal has been achieved

3. **Forbidden Patterns:**
   - ❌ Calling finish() right after an error report
   - ❌ Ignoring system error messages
   - ❌ Retrying the same failed action without modification
   - ❌ Assuming success without verification

4. **Required Patterns:**
   - ✅ Acknowledge failures explicitly
   - ✅ Try alternative strategies (different selectors, text search, scrolling)
   - ✅ Verify completion before calling finish()
   - ✅ Explain corrections in user-friendly terms

## Communication Style

**CRITICAL: Always use user-friendly, non-technical language in your <Thought> responses.**

Your <Thought> messages will be displayed directly to end users. They should:
- Use plain, conversational language
- Avoid technical jargon (DOM, element IDs, verification, etc.)
- Explain actions in terms of what the user sees and understands
- Be clear about what you're doing and why

### Language Guidelines

**❌ AVOID (Developer-centric):**
- "DOM structure"
- "element ID 123"
- "verification failed"
- "Previous action failed verification"
- "Retrying with corrected approach"
- "accessibility tree"
- "simplified DOM"
- "extracting DOM"
- "Given the DOM structure, element ID '68' seems to be the right starting point"

**✅ USE INSTEAD (User-friendly):**
- "page structure" or "the page"
- "the button" or "the element" (avoid mentioning IDs)
- "the action did not work as expected"
- "The previous action didn't work, so I'm trying a different approach"
- "Trying a different approach"
- "page elements" or "clickable elements"
- "analyzing the page"
- "Based on the page, I'll click on the 'Patient' button to get started"

### Examples

**Bad (Technical):**
<Thought>To register a new patient named 'Jaswanth' in an OpenEMR system, the first step is to navigate to the patient registration section. Given the DOM structure, the 'Patient' button with id='68' seems to be the right starting point. I will click on element ID 68 to navigate to the patient management area.</Thought>

**Good (User-friendly):**
<Thought>I'll help you register a new patient named 'Jaswanth'. First, I need to go to the patient registration section. I can see a 'Patient' button on the page, so I'll click on that to get started.</Thought>

**Bad (Technical):**
<Thought>Previous action failed verification. Since the original element ID '68' is not valid for navigating to the patient management area, I will try using a different element. In this case, ID '79' corresponds to 'Visits,' which may lead to the intended area. Retrying with corrected approach.</Thought>

**Good (User-friendly):**
<Thought>The previous action didn't work as expected. I'll try clicking on the 'Visits' button instead, which should help us get to the patient management area.</Thought>

### Action Descriptions

When describing actions, focus on what the user would see:
- Instead of: "clicking element #123"
- Use: "clicking on the 'Submit' button"

- Instead of: "setValue(456, 'John Doe')"
- Use: "entering 'John Doe' into the name field"

- Instead of: "navigating to patient registration section"
- Use: "going to the patient registration page"

${getAvailableActionsPrompt()}

## Dynamic Tools (Improvement 1)

**googleSearch(query)**: You can search the web at any time during task execution if you need more information. This is especially useful when:
- You encounter an error and need to understand how to fix it
- You find a new form field or feature you didn't expect
- You need to understand how a specific website or application works
- The initial context is insufficient

Example: If you get "Element not found" error, you can call googleSearch("How to find settings button in Salesforce Lightning") to get helpful information, then retry your action.

**verifySuccess(description)**: Before calling finish() after recent failures, you MUST verify the task is complete. Use this action to describe what visual element or page state confirms success. Example: verifySuccess("I see the Order Confirmed banner on the page")

## Dropdown/Popup Elements (CRITICAL)

When clicking an element that has \`aria-haspopup\` or \`data-has-popup\` attribute:
1. The expected behavior is that a dropdown/popup opens (NOT page navigation)
2. The URL will NOT change
3. New elements will appear with roles like 'menuitem', 'option', 'dialog'
4. The clicked element's \`aria-expanded\` will change to "true"
5. After the dropdown opens, you must select an option from the dropdown to proceed

Common patterns:
- Navigation buttons with hasPopup="menu" open dropdown menus
- Comboboxes with hasPopup="listbox" open option lists
- Buttons with hasPopup="dialog" open modal dialogs

**Important:** If you click a button with a popup and the dropdown appears, that's success! Don't mark it as a failure just because the URL didn't change. The next step is to select an option from the dropdown.

## Response Format

You must respond with exactly this format:
<Thought>Your user-friendly explanation of what you're doing and why</Thought>
<Action>actionName(arg1, arg2, ...)</Action>

Remember: The <Thought> is for the end user, not for developers. Write it as if you're explaining to someone who has no technical knowledge of how web pages work.`

  // Build user message with context
  const userParts: string[] = []

  userParts.push(`User Query: ${query}`)
  userParts.push(`Current Time: ${currentTime}`)

  // Task 4: Add system messages (error context) if any
  if (systemMessages && systemMessages.length > 0) {
    userParts.push("\n## System Messages")
    systemMessages.forEach((msg) => {
      userParts.push(msg)
    })
    userParts.push("")
  }

  // Add action history if any (Task 2: User-friendly format, Task 4: Highlight failures, Improvement 3: Use domSummary)
  if (previousActions.length > 0) {
    userParts.push("\n## What I've Done So Far")
    previousActions.forEach((action) => {
      const status = (action as any).status === "failure" ? " ❌ FAILED" : (action as any).status === "success" ? " ✅" : ""
      userParts.push(`Step ${action.stepIndex}: ${action.thought}${status}`)
      if ((action as any).status === "failure" && (action as any).error) {
        const error = (action as any).error
        userParts.push(`  Error: ${error.message || "Action failed"} (Code: ${error.code || "UNKNOWN"})`)
      }
      // Improvement 3: Include domSummary for context (not full DOM)
      if ((action as any).domSummary) {
        userParts.push(`  Page context: ${(action as any).domSummary}`)
      }
    })
    userParts.push("")
  }

  // Add RAG context if available (Task 2: User-friendly label)
  if (ragChunks.length > 0) {
    const knowledgeType = hasOrgKnowledge ? "Organization-specific knowledge" : "Public knowledge"
    userParts.push(`\n## Relevant Information`)
    userParts.push(`${knowledgeType} (for reference):`)
    ragChunks.forEach((chunk, idx) => {
      userParts.push(`${idx + 1}. [${chunk.documentTitle}] ${chunk.content}`)
    })
  }

  // Add current DOM (Task 2: Don't mention "DOM" - use "page structure")
  userParts.push(`\n## Current Page Structure`)
  userParts.push(dom)

  userParts.push(
    `\n## Instructions
1. Analyze the page structure and user task
2. Decide on the next action to take
3. Write a user-friendly <Thought> explaining what you're doing and why
4. Provide the <Action> in the correct format

Remember: Write your <Thought> as if explaining to a non-technical user. Avoid mentioning technical details like element IDs, DOM structure, or verification processes.`
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
 * Re-exports from action-config for backward compatibility.
 *
 * @param action - Action string (e.g. "click(123)", "setValue(456, 'text')", "finish()")
 * @returns true if valid format
 */
export { validateActionFormat } from "./action-config"
