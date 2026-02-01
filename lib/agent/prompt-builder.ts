import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import {
  formatScreenshotContext,
  formatSkeletonForPrompt,
  VISUAL_BRIDGE_PROMPT,
} from "@/lib/llm/multimodal-helpers"

import { getAvailableActionsPrompt } from "./action-config"
import { getOrCreateSkeleton } from "./dom-skeleton"
import { shouldUseVisualMode } from "./mode-router"
import type { DomMode } from "./schemas"

/**
 * Previous action from task history.
 */
export interface PreviousAction {
  stepIndex: number
  thought: string
  action: string
}

/**
 * Hybrid vision + skeleton options for action prompts
 */
export interface ActionPromptHybridOptions {
  /** Base64-encoded JPEG screenshot for visual context */
  screenshot?: string | null
  /** Pre-extracted skeleton DOM (if not provided, extracted from full DOM) */
  skeletonDom?: string
  /** DOM processing mode hint */
  domMode?: DomMode
}

/**
 * Build LLM prompt for action loop.
 *
 * System message: role, available actions, format
 * User message: query, current time, action history, RAG context, DOM
 *
 * @param params - Prompt parameters
 * @returns System and user prompts, plus whether visual mode is enabled
 */
export function buildActionPrompt(params: {
  query: string
  currentTime: string
  previousActions: PreviousAction[]
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean
  dom: string
  systemMessages?: string[] // Task 4: Error context messages
  hybridOptions?: ActionPromptHybridOptions // Hybrid vision + skeleton options
}): { system: string; user: string; useVisualMode: boolean } {
  const { query, currentTime, previousActions, ragChunks, hasOrgKnowledge, dom, systemMessages, hybridOptions } = params

  // Determine if we should use visual mode
  const useVisualMode: boolean =
    hybridOptions?.domMode === "hybrid" ||
    Boolean(hybridOptions?.screenshot && shouldUseVisualMode(query, true))

  // Visual bridge section for hybrid mode
  const visualBridgeSection = useVisualMode
    ? `\n\n## Visual Context Mode\n\n${VISUAL_BRIDGE_PROMPT}\n`
    : ""

  // System message: role and format (Task 2: User-friendly language, Task 4: Failure handling)
  const systemPrompt = `You are an AI assistant that helps users complete tasks on web pages through browser automation.
${visualBridgeSection}

## Failure Handling Rules

**CRITICAL: You must strictly follow these rules when handling failures:**

1. **Acknowledge Failures:** If you receive a system error message indicating a previous action failed, you MUST:
   - Acknowledge the failure in your thought
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

**CRITICAL: Always use user-friendly, non-technical language in your "thought" responses.**

Your "thought" messages will be displayed directly to end users. They should:
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
thought: "To register a new patient named 'Jaswanth' in an OpenEMR system, the first step is to navigate to the patient registration section. Given the DOM structure, the 'Patient' button with id='68' seems to be the right starting point. I will click on element ID 68 to navigate to the patient management area."

**Good (User-friendly):**
thought: "I'll help you register a new patient named 'Jaswanth'. First, I need to go to the patient registration section. I can see a 'Patient' button on the page, so I'll click on that to get started."

**Bad (Technical):**
thought: "Previous action failed verification. Since the original element ID '68' is not valid for navigating to the patient management area, I will try using a different element. In this case, ID '79' corresponds to 'Visits,' which may lead to the intended area. Retrying with corrected approach."

**Good (User-friendly):**
thought: "The dropdown opened but we haven't chosen an option yet. I'll select 'New/Search' from the Patient menu to add a new patient."

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

**CRITICAL: Clicking Menu Items After Dropdown Opens**
- After clicking a dropdown button (e.g., "Patient"), the menu items (e.g., "New/Search", "Dashboard") will appear
- **ALWAYS wait briefly** (use wait(0.5) or wait(1)) after the dropdown opens before clicking a menu item
- This ensures the menu is fully rendered and interactive
- Look for menu items in the DOM by searching for their text content (e.g., "New/Search") or by finding elements with role="menuitem", role="listitem", or role="list"
- The element ID for menu items is usually different from the dropdown button ID - find the specific menu item element in the DOM
- Example workflow: click(PatientButtonId) → wait(0.5) → click(NewSearchMenuItemId)

**Important:** If you click a button with a popup and the dropdown appears, that's success! Don't mark it as a failure just because the URL didn't change. The next step is to wait briefly, then select an option from the dropdown.

## Answering Questions from Page Content (CRITICAL)

When the user asks a question or wants to find/figure out information (e.g., "figure out which...", "find out...", "what is the...", "which user spent the most..."):

1. **Analyze the page content directly** - The page structure contains all the text data you need
2. **DO NOT use screenshot()** - Screenshots are for visual capture, not data analysis
3. **Extract the answer from the page** and use finish(answer) to respond
4. Look at the visible text, numbers, tables, lists on the page to find the information

**Example: "Figure out which user spent the most"**
- Look at the page structure for user names and spending amounts
- Find the relevant data (names, values, etc.)
- Use: finish("Based on the members list, John Smith spent the most with $1,234.56")

**Example: "What is the total balance?"**
- Look for balance-related text on the page
- Extract the value
- Use: finish("The total balance shown is $5,678.90")

**DO NOT:**
- ❌ Use screenshot() to "review" or "look at" data
- ❌ Generate vague "I need to look at the page" responses
- ❌ Defer answering when the data is visible in the page structure

**DO:**
- ✅ Read the page structure directly
- ✅ Extract specific values, names, amounts from the page content
- ✅ Provide the answer using finish("The answer is...")

## Response Format

You must respond with a JSON object containing:
- "thought": Your user-friendly explanation of what you're doing and why
- "action": The action to perform (e.g., click(123), setValue(456, "text"), finish("Done"))

Remember: The "thought" is for the end user, not for developers. Write it as if you're explaining to someone who has no technical knowledge of how web pages work.`

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

  // Add current page content based on mode
  if (useVisualMode && hybridOptions?.screenshot) {
    // Hybrid mode: screenshot for visual context, skeleton for structure
    userParts.push(formatScreenshotContext(true))
    
    // Use skeleton DOM for page structure
    const skeletonDom = getOrCreateSkeleton(dom, hybridOptions?.skeletonDom)
    userParts.push(`\n${formatSkeletonForPrompt(skeletonDom)}`)
  } else {
    // Full DOM mode (traditional)
    userParts.push(`\n## Current Page Structure`)
    userParts.push(dom)
  }

  userParts.push(
    `\n## Instructions
1. Analyze the page structure and user task
2. Decide on the next action to take
3. Provide a user-friendly "thought" explaining what you're doing and why
4. Provide the "action" in the correct format

Remember: Write your "thought" as if explaining to a non-technical user. Avoid mentioning technical details like element IDs, DOM structure, or verification processes.`
  )

  return {
    system: systemPrompt,
    user: userParts.join("\n"),
    useVisualMode,
  }
}

/**
 * Build a prompt for hybrid mode with visual context.
 * Convenience function that ensures visual mode is used.
 *
 * @param params - Prompt parameters (must include screenshot)
 * @returns System and user prompts for hybrid mode
 */
export function buildHybridActionPrompt(params: {
  query: string
  currentTime: string
  previousActions: PreviousAction[]
  ragChunks: ResolveKnowledgeChunk[]
  hasOrgKnowledge: boolean
  dom: string
  systemMessages?: string[]
  screenshot: string
  skeletonDom?: string
}): { system: string; user: string } {
  const result = buildActionPrompt({
    ...params,
    hybridOptions: {
      screenshot: params.screenshot,
      skeletonDom: params.skeletonDom,
      domMode: "hybrid",
    },
  })
  return { system: result.system, user: result.user }
}

// NOTE: parseActionResponse has been removed.
// The codebase uses Gemini's structured output with responseJsonSchema (ACTION_RESPONSE_SCHEMA)
// which returns JSON directly: { thought, action }. No XML parsing is needed.
// See: lib/llm/response-schemas.ts for schema definitions.
// See: docs/GEMINI_USAGE.md for structured output documentation.

/**
 * Validate action format.
 * Re-exports from action-config for backward compatibility.
 *
 * @param action - Action string (e.g. "click(123)", "setValue(456, 'text')", "finish()")
 * @returns true if valid format
 */
export { validateActionFormat } from "./action-config"
