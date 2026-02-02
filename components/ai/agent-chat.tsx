"use client"

import { ListChecks, RefreshCw, Send } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { useAgent } from "@/hooks/use-agent"

interface PlanStep {
  index: number
  description: string
  status: string
}

interface PlanMetadata {
  messageType?: "plan_preview" | "plan_update"
  taskId?: string
  plan?: {
    steps: PlanStep[]
    totalSteps: number
    currentStepIndex: number
  }
}

interface MessageWithMetadata {
  role: "user" | "assistant" | "system"
  content: string
  toolCalls?: Array<{ name: string }>
  metadata?: PlanMetadata
}

export function AgentChat({ organizationId }: { organizationId?: string }) {
  const [input, setInput] = useState("")
  const { messages, sendMessage, loading } = useAgent()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    await sendMessage(input, organizationId)
    setInput("")
  }

  return (
    <div className="flex flex-col h-full max-h-[600px] border rounded-lg">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p>Start a conversation with the AI agent</p>
              <p className="text-sm mt-2">Ask questions, request actions, or get help</p>
            </div>
          )}
          {messages.map((msg, idx) => {
            const typedMsg = msg as MessageWithMetadata
            const isPlanPreview =
              typedMsg.role === "system" &&
              typedMsg.metadata?.messageType === "plan_preview"
            const isPlanUpdate =
              typedMsg.role === "system" &&
              typedMsg.metadata?.messageType === "plan_update"
            const isPlanMessage = isPlanPreview || isPlanUpdate

            if (isPlanMessage && typedMsg.metadata?.plan) {
              return (
                <div key={idx} className="flex justify-start">
                  <div className="max-w-[85%] bg-muted/30 rounded-lg p-4 border border-border/50">
                    <div className="flex items-center gap-2 mb-3">
                      {isPlanUpdate ? (
                        <RefreshCw className="h-4 w-4 text-primary" />
                      ) : (
                        <ListChecks className="h-4 w-4 text-primary" />
                      )}
                      <span className="text-sm font-medium">
                        {isPlanUpdate ? "Updated Plan" : "Plan"}
                      </span>
                    </div>
                    <ol className="space-y-2 text-sm">
                      {typedMsg.metadata.plan.steps.map((step) => (
                        <li key={step.index} className="flex items-start gap-2">
                          <span className="text-muted-foreground">
                            {step.index + 1}.
                          </span>
                          <span>{step.description}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="text-xs opacity-75 mt-2">
                      Using tools: {msg.toolCalls.map((tc) => tc.name).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3">
                <Spinner className="h-4 w-4" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the AI agent..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !input.trim()} size="icon">
            {loading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

