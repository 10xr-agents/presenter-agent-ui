"use client"

import { Mic, Send } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface ViewerInteractionProps {
  screenAgentId: string
  sessionToken: string
}

/**
 * Viewer Interaction Component
 * 
 * Allows viewers to interact with the presentation:
 * - Ask questions via text input
 * - Ask questions via voice (if enabled)
 * - View question history
 * 
 * Note: This is a placeholder implementation. In a real application, you would:
 * 1. Send questions to the backend API to track analytics
 * 2. Integrate with voice AI service for voice questions
 * 3. Display question history and agent responses
 * 4. Handle real-time updates via WebSocket or LiveKit data channels
 */
export function ViewerInteraction({
  screenAgentId,
  sessionToken,
}: ViewerInteractionProps) {
  const [question, setQuestion] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      // TODO: Implement actual question submission
      // const response = await fetch("/api/presentations/questions", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     sessionToken,
      //     screenAgentId,
      //     question: question.trim(),
      //   }),
      // })
      // if (!response.ok) {
      //   throw new Error("Failed to submit question")
      // }

      // Placeholder: simulate submission
      await new Promise((resolve) => setTimeout(resolve, 500))

      toast.success("Question submitted")
      setQuestion("")
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit question"
      toast.error(errorMessage)
      console.error("Question submission error:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVoiceQuestion = () => {
    // TODO: Implement voice question functionality
    // 1. Start voice recording
    // 2. Convert speech to text
    // 3. Submit question
    toast.info("Voice questions coming soon")
  }

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle>Ask a Question</CardTitle>
        <CardDescription>Interact with the presentation agent</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmitQuestion} className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type your question here..."
            disabled={isSubmitting}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleVoiceQuestion}
            disabled={isSubmitting}
            aria-label="Ask via voice"
          >
            <Mic className="h-4 w-4" />
          </Button>
          <Button type="submit" disabled={isSubmitting || !question.trim()}>
            <Send className="h-4 w-4 mr-2" />
            Send
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Your questions help improve the presentation experience
        </p>
      </CardContent>
    </Card>
  )
}
