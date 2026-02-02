/**
 * Chat Response Node
 *
 * Handles chat-only tasks that don't require browser interaction.
 * Generates direct responses using:
 * - File attachments (extracted content)
 * - Session/task memory
 * - RAG knowledge chunks
 *
 * @see docs/INTERACT_FLOW_WALKTHROUGH.md
 */

import * as Sentry from "@sentry/nextjs"
import { formatFileContextForPrompt, hasExtractableContent } from "@/lib/agent/file-context"
import { sessionRecallAll, taskRecallAll } from "@/lib/agent/memory"
import { recordUsage } from "@/lib/cost"
import {
  DEFAULT_PLANNING_MODEL,
  generateWithGemini,
} from "@/lib/llm/gemini-client"
import { logger } from "@/lib/utils/logger"
import type { ActionResult, InteractGraphState } from "../types"

/**
 * System prompt for chat-only responses
 */
const CHAT_RESPONSE_SYSTEM_PROMPT = `You are a helpful AI assistant that can analyze data, answer questions, and provide information based on the context provided.

Your capabilities:
1. Analyze file contents (CSV, PDF, JSON, etc.) and extract insights
2. Answer questions using provided memory and conversation history
3. Perform calculations and data analysis
4. Summarize and explain information

Guidelines:
- Be concise and direct in your responses
- When analyzing data, show your work (calculations, counts, etc.)
- If you cannot answer based on the provided context, say so clearly
- Format responses appropriately (use bullet points, tables, etc. when helpful)
- For numerical questions, provide exact values when possible

Response Format:
- Provide a clear, direct answer
- Include relevant supporting details from the context
- If the question involves calculations, show the key figures
- Keep responses focused and avoid unnecessary padding`

/**
 * Chat response node - generates direct response without browser interaction
 *
 * Used for:
 * - File content analysis and questions
 * - Memory/recall queries
 * - General knowledge questions (with RAG)
 * - Calculations and data extraction
 *
 * @param state - Current graph state
 * @returns Updated state with action result (finish action)
 */
export async function chatResponseNode(
  state: InteractGraphState
): Promise<Partial<InteractGraphState>> {
  const {
    tenantId,
    userId,
    query,
    ragChunks,
    hasOrgKnowledge,
    sessionId,
    taskId,
    previousMessages,
    langfuseTraceId,
  } = state

  // Access attachments from extended state
  const attachments = (state as InteractGraphState & { attachments?: unknown[] }).attachments

  const log = logger.child({
    process: "Graph:chat_response",
    sessionId,
    taskId: taskId ?? "",
  })

  log.info("Generating chat-only response (no browser needed)", {
    hasAttachments: Array.isArray(attachments) && attachments.length > 0,
    ragChunkCount: ragChunks.length,
    previousMessageCount: previousMessages.length,
  })

  const startTime = Date.now()

  try {
    // Build context parts
    const contextParts: string[] = []

    // Add file attachment content if available
    if (Array.isArray(attachments) && attachments.length > 0 && hasExtractableContent(attachments as any)) {
      contextParts.push(formatFileContextForPrompt(attachments as any))
    }

    // Add memory context
    if (taskId || sessionId) {
      try {
        const [taskMemoryResult, sessionMemoryResult] = await Promise.all([
          taskId ? taskRecallAll(taskId) : Promise.resolve({ success: true, value: {} }),
          sessionId ? sessionRecallAll(sessionId) : Promise.resolve({ success: true, value: {} }),
        ])

        const taskMemory = (taskMemoryResult.success ? taskMemoryResult.value : {}) as Record<string, unknown>
        const sessionMemory = (sessionMemoryResult.success ? sessionMemoryResult.value : {}) as Record<string, unknown>

        const taskKeys = Object.keys(taskMemory)
        const sessionKeys = Object.keys(sessionMemory)

        if (taskKeys.length > 0 || sessionKeys.length > 0) {
          contextParts.push("\n--- Memory Context ---")

          if (taskKeys.length > 0) {
            contextParts.push("Task Memory (current task):")
            for (const key of taskKeys) {
              const value = taskMemory[key]
              const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value)
              const displayValue = valueStr.length > 500 ? valueStr.substring(0, 500) + "..." : valueStr
              contextParts.push(`  - ${key}: ${displayValue}`)
            }
          }

          if (sessionKeys.length > 0) {
            contextParts.push("Session Memory (persistent across tasks):")
            for (const key of sessionKeys) {
              const value = sessionMemory[key]
              const valueStr = typeof value === "object" ? JSON.stringify(value) : String(value)
              const displayValue = valueStr.length > 500 ? valueStr.substring(0, 500) + "..." : valueStr
              contextParts.push(`  - ${key}: ${displayValue}`)
            }
          }

          contextParts.push("--- End Memory Context ---\n")
        }
      } catch (memError: unknown) {
        log.warn("Failed to load memory context", { error: memError })
      }
    }

    // Add RAG chunks if available
    if (ragChunks.length > 0) {
      const knowledgeType = hasOrgKnowledge ? "Organization-specific knowledge" : "Public knowledge"
      contextParts.push(`\n--- ${knowledgeType} ---`)
      ragChunks.slice(0, 5).forEach((chunk, idx) => {
        contextParts.push(`${idx + 1}. [${chunk.documentTitle || "Document"}]`)
        contextParts.push(chunk.content.substring(0, 1000) + (chunk.content.length > 1000 ? "..." : ""))
      })
      contextParts.push("--- End Knowledge Context ---\n")
    }

    // Add recent conversation history
    if (previousMessages.length > 0) {
      contextParts.push("\n--- Recent Conversation ---")
      previousMessages.slice(-5).forEach((msg) => {
        const content = msg.content.length > 200 ? msg.content.substring(0, 200) + "..." : msg.content
        contextParts.push(`[${msg.role}]: ${content}`)
      })
      contextParts.push("--- End Conversation ---\n")
    }

    // Build the user prompt
    const userPrompt = `${contextParts.join("\n")}

User Question: ${query}

Please provide a helpful response based on the context above.`

    // Generate response
    const result = await generateWithGemini(CHAT_RESPONSE_SYSTEM_PROMPT, userPrompt, {
      model: DEFAULT_PLANNING_MODEL,
      temperature: 0.7,
      maxOutputTokens: 2000,
      thinkingLevel: "medium",
      generationName: "chat_response",
      sessionId,
      userId,
      tags: ["chat_only"],
      metadata: {
        hasAttachments: Array.isArray(attachments) && attachments.length > 0,
        ragChunkCount: ragChunks.length,
      },
    })

    const durationMs = Date.now() - startTime

    // Record usage for cost tracking
    if (tenantId && userId && result?.promptTokens != null) {
      recordUsage({
        tenantId,
        userId,
        sessionId,
        taskId,
        langfuseTraceId,
        provider: "google",
        model: DEFAULT_PLANNING_MODEL,
        actionType: "GENERAL",
        inputTokens: result.promptTokens ?? 0,
        outputTokens: result.completionTokens ?? 0,
        durationMs,
        metadata: { query: query.substring(0, 100) },
      }).catch((err: unknown) => {
        log.error("Cost tracking error", { error: err })
      })
    }

    const responseText = result?.content || "I apologize, but I couldn't generate a response. Please try rephrasing your question."

    log.info("Chat response generated", {
      responseLength: responseText.length,
      durationMs,
      promptTokens: result?.promptTokens,
      completionTokens: result?.completionTokens,
    })

    // Return as a finish action
    const actionResult: ActionResult = {
      thought: `I can answer this question directly without needing to interact with a browser. ${responseText.length > 100 ? "Here's what I found:" : ""}`,
      action: `finish("${escapeForAction(responseText)}")`,
      finishMessage: responseText,
    }

    return {
      actionResult,
      status: "completed",
      llmUsage: result
        ? {
            promptTokens: result.promptTokens ?? 0,
            completionTokens: result.completionTokens ?? 0,
          }
        : undefined,
      llmDuration: durationMs,
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "chat-response-node" },
      extra: { query: query.substring(0, 100), sessionId, taskId },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error("Chat response generation failed", { error: errorMessage })

    // Return a fail action
    const actionResult: ActionResult = {
      thought: "I encountered an error while generating a response.",
      action: `fail("${escapeForAction(errorMessage)}")`,
    }

    return {
      actionResult,
      status: "failed",
      error: errorMessage,
      llmDuration: Date.now() - startTime,
    }
  }
}

/**
 * Escape special characters for action string
 */
function escapeForAction(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .substring(0, 2000) // Limit length for action string
}
