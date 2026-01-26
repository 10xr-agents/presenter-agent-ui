import { OpenAI } from "openai"
import * as Sentry from "@sentry/nextjs"
import type { VerificationResult } from "./verification-engine"
import type { PlanStep } from "@/lib/models/task"
import type { CorrectionStrategy } from "@/lib/models/correction-record"
import type { ResolveKnowledgeChunk } from "@/lib/knowledge-extraction/resolve-client"

/**
 * Self-Correction Engine (Task 8)
 *
 * Analyzes verification failures and generates alternative approaches.
 * Creates corrected steps with new strategies for retry.
 */

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
 * @returns Correction result with strategy and retry action
 */
export async function generateCorrection(
  failedStep: PlanStep,
  verificationResult: VerificationResult,
  currentDom: string,
  currentUrl: string,
  ragChunks: ResolveKnowledgeChunk[] = [],
  hasOrgKnowledge = false
): Promise<CorrectionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  const openai = new OpenAI({
    apiKey,
  })

  // Use lightweight model for correction to reduce cost
  const model = process.env.CORRECTION_MODEL || "gpt-4o-mini"

  const systemPrompt = `You are a self-correction AI that analyzes failed actions and generates alternative approaches.

Your job is to:
1. Analyze why the action failed (based on verification result)
2. Determine the best correction strategy
3. Generate a corrected action that should succeed

Available Correction Strategies:
- ALTERNATIVE_SELECTOR: Try different element selector (element not found, wrong selector)
- ALTERNATIVE_TOOL: Use different tool (e.g., keyboard navigation instead of click, or vice versa)
- GATHER_INFORMATION: Need more info before proceeding (e.g., search for missing information)
- UPDATE_PLAN: Plan assumptions were wrong, need to update approach
- RETRY_WITH_DELAY: Simple retry with delay (timing issue, page still loading)

Response Format:
You must respond in the following format:
<Analysis>
Brief analysis of why the action failed...
</Analysis>
<Strategy>
ALTERNATIVE_SELECTOR|ALTERNATIVE_TOOL|GATHER_INFORMATION|UPDATE_PLAN|RETRY_WITH_DELAY
</Strategy>
<Reason>
Why this strategy was chosen...
</Reason>
<CorrectedAction>
actionName(params)
</CorrectedAction>
<CorrectedDescription>
Updated step description...
</CorrectedDescription>

Guidelines:
- Choose the strategy that best addresses the failure reason
- Generate a corrected action that should succeed
- Consider DOM structure and available elements
- Use knowledge context if available`

  // Build user message with context
  const userParts: string[] = []

  userParts.push(`Failed Step:`)
  userParts.push(`- Description: ${failedStep.description}`)
  userParts.push(`- Tool Type: ${failedStep.toolType}`)
  if (failedStep.reasoning) {
    userParts.push(`- Reasoning: ${failedStep.reasoning}`)
  }

  userParts.push(`\nVerification Failure:`)
  userParts.push(`- Confidence: ${(verificationResult.confidence * 100).toFixed(1)}%`)
  userParts.push(`- Reason: ${verificationResult.reason}`)
  if (verificationResult.comparison.domChecks) {
    const checks = verificationResult.comparison.domChecks
    userParts.push(`- DOM Checks:`)
    if (checks.elementExists !== undefined) {
      userParts.push(`  - Element exists: ${checks.elementExists ? "✓" : "✗"}`)
    }
    if (checks.elementTextMatches !== undefined) {
      userParts.push(`  - Element text matches: ${checks.elementTextMatches ? "✓" : "✗"}`)
    }
    if (checks.urlChanged !== undefined) {
      userParts.push(`  - URL changed: ${checks.urlChanged ? "✓" : "✗"}`)
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

  // Add current DOM for context (truncate if too long)
  const domPreview = currentDom.length > 10000 ? currentDom.substring(0, 10000) + "... [truncated]" : currentDom
  userParts.push(`\nCurrent Page State:`)
  userParts.push(`- URL: ${currentUrl}`)
  userParts.push(`- DOM Preview: ${domPreview.substring(0, 2000)}`)

  userParts.push(
    `\nBased on the failure analysis, current page state, and knowledge context, determine the best correction strategy and generate a corrected action that should succeed.`
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

    const content = response.choices[0]?.message?.content

    if (!content) {
      Sentry.captureException(new Error("Empty correction LLM response"))
      return null
    }

    // Parse correction from LLM response
    const correction = parseCorrectionResponse(content, failedStep)

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
  failedStep: PlanStep
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
