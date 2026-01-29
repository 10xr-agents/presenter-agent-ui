/**
 * Gemini LLM Client
 *
 * Central client for all LLM calls using Google Gemini API (@google/genai).
 * Replaces OpenAI for action generation, planning, verification, and reasoning.
 *
 * Uses systemInstruction for system prompt and returns content + optional usage.
 * All LLM calls should use structured output (responseJsonSchema) so responses
 * are valid JSON and parseable without regex/markdown extraction.
 *
 * @see https://ai.google.dev/gemini-api/docs/structured-output
 */

import * as Sentry from "@sentry/nextjs"
import { GoogleGenAI, ThinkingLevel } from "@google/genai"

/** Default model for general LLM calls (action generation, etc.) */
export const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview"

/** Default model for planning and reasoning */
export const DEFAULT_PLANNING_MODEL = "gemini-3-flash-preview"

/** JSON Schema object for Gemini structured output (responseMimeType: application/json). */
export type ResponseJsonSchema = Record<string, unknown>

export interface GenerateWithGeminiOptions {
  /** Override default model */
  model?: string
  /** Temperature 0–1 (default 0.7) */
  temperature?: number
  /** Max output tokens (default 2000) */
  maxOutputTokens?: number
  /** Enable Grounding with Google Search for real-time/factual accuracy (planning, verification). Billed per search query when used. */
  useGoogleSearchGrounding?: boolean
  /**
   * Thinking level for Gemini 3 / 2.5 reasoning models.
   * "high" (default): max reasoning depth for complex tasks (planning, verification, critic).
   * "low": minimize latency for simple instruction-following.
   * "medium" | "minimal": Flash-only; use for balanced or minimal thinking.
   */
  thinkingLevel?: "minimal" | "low" | "medium" | "high"
  /**
   * JSON Schema for structured output. When set, config.responseMimeType = "application/json"
   * and config.responseSchema = schema so the model returns valid JSON only (no free text).
   * @see https://ai.google.dev/gemini-api/docs/structured-output
   */
  responseJsonSchema?: ResponseJsonSchema
  /** For LangFuse/tracing (optional) */
  generationName?: string
  sessionId?: string
  userId?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface GenerateWithGeminiResult {
  content: string
  promptTokens?: number
  completionTokens?: number
}

/**
 * Call Gemini generateContent with system + user prompt.
 * Uses config.systemInstruction for system prompt and contents for user message.
 *
 * @param systemPrompt - System instruction (role/behavior)
 * @param userPrompt - User message content
 * @param options - Model, temperature, maxOutputTokens, and optional trace metadata
 * @returns Content and optional token counts, or null on error
 */
export async function generateWithGemini(
  systemPrompt: string,
  userPrompt: string,
  options?: GenerateWithGeminiOptions
): Promise<GenerateWithGeminiResult | null> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    Sentry.captureException(new Error("GEMINI_API_KEY not configured"))
    throw new Error("Gemini API key not configured")
  }

  const model = options?.model ?? DEFAULT_GEMINI_MODEL
  const temperature = options?.temperature ?? 0.7
  const maxOutputTokens = options?.maxOutputTokens ?? 2000
  const useGoogleSearchGrounding = options?.useGoogleSearchGrounding === true
  const thinkingLevel = options?.thinkingLevel

  const thinkingConfig =
    thinkingLevel != null
      ? {
          thinkingLevel:
            thinkingLevel === "minimal"
              ? ThinkingLevel.MINIMAL
              : thinkingLevel === "low"
                ? ThinkingLevel.LOW
                : thinkingLevel === "medium"
                  ? ThinkingLevel.MEDIUM
                  : ThinkingLevel.HIGH,
        }
      : undefined

  const ai = new GoogleGenAI({ apiKey })

  const responseJsonSchema = options?.responseJsonSchema

  try {
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature,
        maxOutputTokens,
        ...(thinkingConfig && { thinkingConfig }),
        ...(useGoogleSearchGrounding && {
          tools: [{ googleSearch: {} }],
        }),
        ...(responseJsonSchema && {
          responseMimeType: "application/json" as const,
          responseJsonSchema,
        }),
      },
    })

    const text = response.text
    if (text == null || text === "") {
      Sentry.captureException(new Error("Empty Gemini response"), {
        tags: { component: "gemini-client", model },
        extra: { generationName: options?.generationName },
      })
      return null
    }

    const usage = response.usageMetadata
    const promptTokens = usage?.promptTokenCount ?? undefined
    const completionTokens =
      usage?.candidatesTokenCount ?? usage?.totalTokenCount
        ? (usage.totalTokenCount ?? 0) - (usage.promptTokenCount ?? 0)
        : undefined

    return {
      content: text,
      promptTokens,
      completionTokens,
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "gemini-client", model },
      extra: { generationName: options?.generationName },
    })
    throw error
  }
}
