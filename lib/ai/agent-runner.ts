import { GoogleGenAI } from "@google/genai"
import type { AgentConfig, AgentMessage, AgentState, AgentTool, ToolCall } from "./types"

export class AgentRunner {
  private client: GoogleGenAI
  private config: AgentConfig
  private tools: Map<string, AgentTool>

  constructor(config: AgentConfig) {
    this.config = config
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured")
    }
    this.client = new GoogleGenAI({ apiKey })
    this.tools = new Map()

    if (config.tools) {
      config.tools.forEach((tool) => {
        this.tools.set(tool.name, tool)
      })
    }
  }

  async run(state: AgentState): Promise<AgentState> {
    const contents = this.formatContents(state.messages)
    const systemInstruction = this.config.systemPrompt ?? undefined
    const toolsConfig =
      this.tools.size > 0 ? { functionDeclarations: this.formatFunctionDeclarations() } : undefined

    const response = await this.client.models.generateContent({
      model: this.config.model,
      contents: contents as never,
      config: {
        systemInstruction,
        temperature: this.config.temperature ?? 0.7,
        maxOutputTokens: this.config.maxTokens ?? 2000,
        ...(toolsConfig && { tools: [toolsConfig] }),
      },
    })

    const text = response.text
    const functionCalls = (response as { functionCalls?: Array<{ name: string; args?: Record<string, unknown> }> }).functionCalls

    if (functionCalls && functionCalls.length > 0) {
      const toolResults = await Promise.all(
        functionCalls.map(async (fc) => {
          const tool = this.tools.get(fc.name)
          if (!tool) {
            return {
              toolCallId: `call_${fc.name}_${Date.now()}`,
              result: null,
              error: `Tool ${fc.name} not found`,
            }
          }
          try {
            const result = await tool.handler((fc.args ?? {}) as Record<string, unknown>)
            return {
              toolCallId: `call_${fc.name}_${Date.now()}`,
              result,
            }
          } catch (error: unknown) {
            return {
              toolCallId: `call_${fc.name}_${Date.now()}`,
              result: null,
              error: error instanceof Error ? error.message : "Unknown error",
            }
          }
        })
      )

      const toolCallsForMessage: ToolCall[] = functionCalls.map((fc, i) => ({
        id: toolResults[i]?.toolCallId ?? `call_${i}`,
        name: fc.name,
        arguments: (fc.args ?? {}) as Record<string, unknown>,
      }))

      const newMessage: AgentMessage = {
        role: "assistant",
        content: text ?? "",
        toolCalls: toolCallsForMessage,
        toolResults,
        timestamp: new Date(),
      }

      const followUpMessages: AgentMessage[] = [
        ...state.messages,
        newMessage,
      ]

      return this.run({
        ...state,
        messages: followUpMessages,
      })
    }

    const newMessage: AgentMessage = {
      role: "assistant",
      content: text ?? "",
      timestamp: new Date(),
    }

    return {
      ...state,
      messages: [...state.messages, newMessage],
    }
  }

  private formatContents(messages: AgentMessage[]): Array<{ role: "user" | "model"; parts: Array<{ text: string } | { functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }> }> {
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string } | { functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }> }> = []

    for (const msg of messages) {
      if (msg.role === "system") continue

      const role = msg.role === "user" ? "user" : "model"
      const parts: Array<{ text: string } | { functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }> = []

      if (msg.content) {
        parts.push({ text: msg.content })
      }

      if (msg.toolCalls && msg.toolCalls.length > 0 && msg.role === "assistant") {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: { name: tc.name, args: tc.arguments as Record<string, unknown> },
          })
        }
      }

      if (msg.toolResults && msg.toolResults.length > 0 && msg.role === "assistant") {
        for (const tr of msg.toolResults) {
          const response = tr.error != null ? { error: tr.error } : (tr.result != null ? (typeof tr.result === "object" && tr.result !== null ? (tr.result as Record<string, unknown>) : { value: tr.result }) : {})
          parts.push({
            functionResponse: {
              name: msg.toolCalls?.find((tc) => tc.id === tr.toolCallId)?.name ?? "unknown",
              response,
            },
          })
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts })
      }
    }

    return contents
  }

  private formatFunctionDeclarations(): Array<{ name: string; description: string; parameters?: Record<string, unknown> }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
    }))
  }
}
