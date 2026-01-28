import * as Sentry from "@sentry/nextjs"
import type { VerificationResult } from "./verification-engine"
import type { PlanStep } from "@/lib/models/task"
import type { CorrectionStrategy } from "@/lib/models/correction-record"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"
import { getAvailableActionsPrompt, validateActionName } from "./action-config"
import { classifyActionType } from "./action-type"
import { getTracedOpenAIWithConfig } from "@/lib/observability"
import { recordUsage } from "@/lib/cost"

/**
 * Self-Correction Engine (Task 8)
 *
 * Analyzes verification failures and generates alternative approaches.
 * Creates corrected steps with new strategies for retry.
 */

/**
 * Context for cost tracking (optional)
 */
export interface CorrectionContext {
  tenantId: string
  userId: string
  sessionId?: string
  taskId?: string
}

/**
 * Correction result
 */
export interface CorrectionResult {
  strategy: CorrectionStrategy
  reason: string
  retryAction: string // Action to retry
  correctedStep?: {
    description: string
    action?: string
    expectedOutcome?: unknown
    [key: string]: unknown
  }
}

/**
 * Generate correction strategy for failed step
 *
 * @param failedStep - The step that failed
 * @param verificationResult - Verification result showing why it failed
 * @param currentDom - Current DOM state
 * @param currentUrl - Current URL
 * @param ragChunks - RAG context chunks (if available)
 * @param hasOrgKnowledge - Whether org-specific knowledge was used
 * @param failedAction - The action that failed (e.g. "click(68)") for dropdown-aware correction
 * @returns Correction result with strategy and retry action
 */
export async function generateCorrection(
  failedStep: PlanStep,
  verificationResult: VerificationResult,
  currentDom: string,
  currentUrl: string,
  ragChunks: ResolveKnowledgeChunk[] = [],
  hasOrgKnowledge = false,
  failedAction?: string,
  previousCorrections: Array<{ action: string; strategy: string }> = [],
  context?: CorrectionContext
): Promise<CorrectionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  // Use traced OpenAI client for LangFuse observability
  const openai = getTracedOpenAIWithConfig({
    generationName: "self_correction",
    sessionId: context?.sessionId,
    userId: context?.userId,
    tags: ["correction"],
    metadata: {
      failedAction,
      previousCorrectionsCount: previousCorrections.length,
    },
  })

  // Use lightweight model for correction to reduce cost
  const model = process.env.CORRECTION_MODEL || "gpt-4o-mini"
  const startTime = Date.now()

  const systemPrompt = `You are a self-correction AI that analyzes failed actions and generates alternative approaches.

Your job is to:
1. Analyze why the action failed (based on verification result)
2. Determine the best correction strategy
3. Generate a corrected action that should succeed
4. Provide a user-friendly description of what went wrong and what you'll try instead

**CRITICAL: Use user-friendly, non-technical language in <Analysis>, <Reason>, and <CorrectedDescription>.**

${getAvailableActionsPrompt()}

Available Correction Strategies:
- ALTERNATIVE_SELECTOR: Try different element ID (element not found, wrong ID)
- ALTERNATIVE_TOOL: Use different action (e.g., setValue instead of click, or vice versa)
- GATHER_INFORMATION: Need more info before proceeding (e.g., search for missing information)
- UPDATE_PLAN: Plan assumptions were wrong, need to update approach
- RETRY_WITH_DELAY: Simple retry with delay (timing issue, page still loading)

**DROPDOWN/POPUP CORRECTION (CRITICAL):**
If the failed action was clicking a **dropdown/popup** button (e.g. Patient, Fees, Visits) and the page now shows a **menu** with options like "New/Search", "Dashboard", "Visits", "Records":
- The correct fix is to **select an option FROM the dropdown** (e.g. click the element for "New/Search" to add a patient), NOT to click a **different top-level nav button**.
- Use ALTERNATIVE_SELECTOR to pick the **menu item** element ID (e.g. the one for "New/Search" or "Dashboard"), not a sibling nav button.
- **IMPORTANT**: If you're trying to click a menu item (e.g., "New/Search") after a dropdown opened:
  1. First ensure you waited briefly after the dropdown opened (use wait(0.5) if needed)
  2. Find the menu item element ID by searching the DOM for the menu item's text (e.g., "New/Search")
  3. Menu items often have different IDs than the dropdown button - look for elements with role="menuitem", role="listitem", or elements containing the menu item text
  4. Make sure you're clicking the actual menu item element, not the dropdown button again
- Example: For "add a new patient", the workflow should be: click(PatientButtonId) → wait(0.5) → click(NewSearchMenuItemId)

Response Format:
You must respond in the following format:
<Analysis>
User-friendly explanation of why the action failed (avoid technical terms like "verification failed", "element ID", etc.)
</Analysis>
<Strategy>
ALTERNATIVE_SELECTOR|ALTERNATIVE_TOOL|GATHER_INFORMATION|UPDATE_PLAN|RETRY_WITH_DELAY
</Strategy>
<Reason>
User-friendly explanation of why this strategy was chosen
</Reason>
<CorrectedAction>
actionName(params)
</CorrectedAction>
<CorrectedDescription>
Updated step description in user-friendly language (e.g., "Click on 'New/Search' in the menu" not "Click element ID 79")
</CorrectedDescription>

**Language Guidelines:**
- ❌ AVOID: "Element ID 68 verification failed", "Retrying with alternative selector strategy", "DOM structure indicates..."
- ✅ USE: "The button didn't appear when I clicked it", "Let me try a different option", "I'll select 'New/Search' from the menu"

CRITICAL RULES FOR CORRECTED ACTION:
1. You MUST only use actions from the Available Actions list above
2. For ALTERNATIVE_SELECTOR: Use a different element ID. If a **dropdown just opened**, choose the **menu item** ID (e.g. New/Search), NOT a sibling nav button (e.g. Visits).
3. For ALTERNATIVE_TOOL: Switch to a different valid action (e.g., if click failed, try setValue if appropriate)
4. NEVER use CSS selectors - only use element IDs
5. NEVER invent new action names - only use actions from the Available Actions list
6. Action format must exactly match the examples in Available Actions

Guidelines:
- Choose the strategy that best addresses the failure reason
- Generate a corrected action that should succeed
- Consider page structure and available elements
- Use knowledge context if available
- ALWAYS validate your corrected action matches one of the valid action formats
- Write all descriptions as if explaining to a non-technical user`

  // Build user message with context
  const userParts: string[] = []

  userParts.push(`Failed Step:`)
  userParts.push(`- Description: ${failedStep.description}`)
  userParts.push(`- Tool Type: ${failedStep.toolType}`)
  if (failedAction) {
    userParts.push(`- Failed action: ${failedAction}`)
  }
  if (failedStep.reasoning) {
    userParts.push(`- Reasoning: ${failedStep.reasoning}`)
  }

  userParts.push(`\nWhat Went Wrong:`)
  userParts.push(`- The action did not work as expected`)
  userParts.push(`- Details: ${verificationResult.reason}`)
  if (verificationResult.comparison.domChecks) {
    const checks = verificationResult.comparison.domChecks
    userParts.push(`- DOM Checks:`)
    if (checks.elementExists !== undefined) {
      userParts.push(`  - Element exists: ${checks.elementExists ? "✓" : "✗"}`)
    }
    if (checks.elementNotExists !== undefined) {
      userParts.push(`  - Element not present: ${checks.elementNotExists ? "✓" : "✗"}`)
    }
    if (checks.elementTextMatches !== undefined) {
      userParts.push(`  - Element text matches: ${checks.elementTextMatches ? "✓" : "✗"}`)
    }
    if (checks.urlChanged !== undefined) {
      userParts.push(`  - URL changed: ${checks.urlChanged ? "✓" : "✗"}`)
    }
    if (checks.attributeChanged !== undefined) {
      userParts.push(`  - Attribute changed (popup): ${checks.attributeChanged ? "✓" : "✗"}`)
    }
    if (checks.elementsAppeared !== undefined) {
      userParts.push(`  - Menu items appeared: ${checks.elementsAppeared ? "✓" : "✗"}`)
    }
  }
  userParts.push(`- Semantic match: ${verificationResult.comparison.semanticMatch ? "✓" : "✗"}`)

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

  const actionType = failedAction ? classifyActionType(failedAction, currentDom) : undefined
  const looksLikeMenu = /New\/Search|Dashboard|menuEntries|role=["']?(list|listitem|menu)["']?/i.test(domPreview.substring(0, 3000))

  if (actionType === "dropdown") {
    userParts.push(
      `\n⚠️ DROPDOWN CONTEXT: The failed action was a **dropdown** click (element has aria-haspopup). You MUST select a **menu item** from the open dropdown (e.g. New/Search for adding a patient), NOT another top-level nav button (e.g. Visits). Use ALTERNATIVE_SELECTOR with the menu item's element ID.`
    )
  } else if (failedAction?.startsWith("click(") && looksLikeMenu) {
    userParts.push(
      `\n⚠️ DROPDOWN CONTEXT: The failed action was a click and the page shows menu-like options (e.g. New/Search, Dashboard). Prefer selecting a **menu item** (e.g. New/Search for adding a patient) over clicking another nav button (e.g. Visits).`
    )
  }

  // Add previous correction attempts to prevent repeating failed actions
  if (previousCorrections.length > 0) {
    userParts.push(`\n⚠️ PREVIOUS CORRECTION ATTEMPTS (DO NOT REPEAT THESE):`)
    previousCorrections.forEach((correction, idx) => {
      userParts.push(`${idx + 1}. Strategy: ${correction.strategy}, Action: ${correction.action} - This also failed`)
    })
    userParts.push(
      `\nCRITICAL: You MUST generate a DIFFERENT action than any of the previous attempts above. Do NOT repeat the same action or a very similar action. Try a completely different approach.`
    )
  }

  userParts.push(
    `\nBased on the failure analysis, current page state, and knowledge context, determine the best correction strategy and generate a corrected action that should succeed.

Remember: Write your <Analysis>, <Reason>, and <CorrectedDescription> in user-friendly language. Avoid technical terms like "verification failed", "element ID", "DOM structure", etc. Focus on what the user would observe (e.g., "the button didn't appear" instead of "element ID 68 verification failed").`
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
      max_tokens: 1000,
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
        actionType: "SELF_CORRECTION",
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        durationMs,
        metadata: {
          failedAction,
          previousCorrectionsCount: previousCorrections.length,
        },
      }).catch((err: unknown) => {
        console.error("[Self-Correction] Cost tracking error:", err)
      })
    }

    if (!content) {
      Sentry.captureException(new Error("Empty correction LLM response"))
      return null
    }

    // Parse correction from LLM response
    const correction = parseCorrectionResponse(content, failedStep, previousCorrections, failedAction)

    if (!correction) {
      Sentry.captureException(new Error("Failed to parse correction response"))
      return null
    }

    return correction
  } catch (error: unknown) {
    Sentry.captureException(error)
    throw error
  }
}

/**
 * Parse LLM response to extract correction strategy and action
 */
function parseCorrectionResponse(
  content: string,
  failedStep: PlanStep,
  previousCorrections: Array<{ action: string; strategy: string }> = [],
  failedAction?: string
): CorrectionResult | null {
  // Extract strategy
  const strategyMatch = content.match(/<Strategy>([\s\S]*?)<\/Strategy>/i)
  const strategyStr = strategyMatch?.[1]?.trim()?.toUpperCase() || ""

  // Validate strategy
  const validStrategies: CorrectionStrategy[] = [
    "ALTERNATIVE_SELECTOR",
    "ALTERNATIVE_TOOL",
    "GATHER_INFORMATION",
    "UPDATE_PLAN",
    "RETRY_WITH_DELAY",
  ]
  const strategy = validStrategies.includes(strategyStr as CorrectionStrategy)
    ? (strategyStr as CorrectionStrategy)
    : "ALTERNATIVE_SELECTOR" // Default fallback

  // Extract reason
  const reasonMatch = content.match(/<Reason>([\s\S]*?)<\/Reason>/i)
  const reason = reasonMatch?.[1]?.trim() || "Correction needed based on verification failure"

  // Extract corrected action
  const actionMatch = content.match(/<CorrectedAction>([\s\S]*?)<\/CorrectedAction>/i)
  const retryAction = actionMatch?.[1]?.trim() || ""

  if (!retryAction) {
    // If no corrected action provided, return null
    return null
  }

  // CRITICAL: Check if this action was already tried (prevent infinite loops)
  if (previousCorrections.some((prev) => prev.action === retryAction)) {
    const errorMessage = `Self-correction generated a duplicate action that was already tried: "${retryAction}". Previous attempts: ${previousCorrections.map((p) => p.action).join(", ")}`
    Sentry.captureException(new Error(errorMessage), {
      tags: {
        component: "self-correction-engine",
        action: retryAction,
        strategy,
        duplicate: true,
      },
      extra: {
        failedStep: {
          description: failedStep.description,
          toolType: failedStep.toolType,
        },
        previousCorrections,
      },
    })
    console.error(`[Self-Correction] ${errorMessage}`)
    // Return null to reject duplicate action
    return null
  }

  // Also check if it's the same as the original failed action
  if (failedAction && retryAction === failedAction) {
    const errorMessage = `Self-correction generated the same action that already failed: "${retryAction}"`
    Sentry.captureException(new Error(errorMessage), {
      tags: {
        component: "self-correction-engine",
        action: retryAction,
        strategy,
        sameAsFailed: true,
      },
      extra: {
        failedStep: {
          description: failedStep.description,
          toolType: failedStep.toolType,
        },
        failedAction,
      },
    })
    console.error(`[Self-Correction] ${errorMessage}`)
    // Return null to reject same action
    return null
  }

  // CRITICAL: Validate action against configuration
  const validation = validateActionName(retryAction)
  if (!validation.valid) {
    // Log error and reject invalid action
    const errorMessage = `Invalid corrected action generated: "${retryAction}". ${validation.error}`
    Sentry.captureException(new Error(errorMessage), {
      tags: {
        component: "self-correction-engine",
        action: retryAction,
        strategy,
      },
      extra: {
        failedStep: {
          description: failedStep.description,
          toolType: failedStep.toolType,
        },
      },
    })
    console.error(`[Self-Correction] ${errorMessage}`)
    // Return null to reject invalid action
    return null
  }

  // Extract corrected description
  const descriptionMatch = content.match(/<CorrectedDescription>([\s\S]*?)<\/CorrectedDescription>/i)
  const correctedDescription = descriptionMatch?.[1]?.trim() || failedStep.description

  return {
    strategy,
    reason,
    retryAction,
    correctedStep: {
      description: correctedDescription,
      action: retryAction,
      expectedOutcome: failedStep.expectedOutcome, // Keep original expected outcome
    },
  }
}
