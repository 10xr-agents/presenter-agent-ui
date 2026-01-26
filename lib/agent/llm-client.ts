import { OpenAI } from "openai"
import * as Sentry from "@sentry/nextjs"

/**
 * LLM response with usage metrics.
 */
export interface LLMResponse {
  thought: string
  action: string
  usage?: {
    promptTokens: number
    completionTokens: number
  }
}

/**
 * Call OpenAI LLM for action generation.
 *
 * Reuses existing OPENAI_API_KEY from .env.local.
 *
 * @param systemPrompt - System message
 * @param userPrompt - User message with context
 * @returns Parsed thought and action, or null on error
 */
export async function callActionLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("OPENAI_API_KEY not configured"))
    throw new Error("OpenAI API key not configured")
  }

  const openai = new OpenAI({
    apiKey,
  })

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview", // Can be made configurable per tenant
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
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content

    if (!content) {
      Sentry.captureException(new Error("Empty LLM response"))
      return null
    }

    return {
      thought: content, // Raw LLM response - will be parsed by parseActionResponse
      action: content, // Same content (for compatibility)
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
          }
        : undefined,
    }
  } catch (error: unknown) {
    Sentry.captureException(error)
    throw error
  }
}
