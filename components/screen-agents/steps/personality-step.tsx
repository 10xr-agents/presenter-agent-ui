"use client"

import { Sparkles } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface PersonalityStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrevious: () => void
}

const PERSONALITY_TRAITS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
  { value: "casual", label: "Casual" },
]

export function PersonalityStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
}: PersonalityStepProps) {
  const [welcomeMessage, setWelcomeMessage] = useState(
    data.conversationConfig?.welcomeMessage || ""
  )
  const [personalityPrompt, setPersonalityPrompt] = useState(
    data.conversationConfig?.personalityPrompt || ""
  )
  const [fallbackResponse, setFallbackResponse] = useState(
    data.conversationConfig?.fallbackResponse || ""
  )
  const [guardrails, setGuardrails] = useState(
    data.conversationConfig?.guardrails?.join("\n") || ""
  )

  const handleNext = () => {
    onUpdate({
      conversationConfig: {
        welcomeMessage: welcomeMessage || undefined,
        personalityPrompt: personalityPrompt || undefined,
        fallbackResponse: fallbackResponse || undefined,
        guardrails: guardrails ? guardrails.split("\n").filter(Boolean) : undefined,
      },
    })
    onNext()
  }

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <Sparkles className="h-8 w-8 mx-auto text-primary mb-2" />
        <p className="text-sm text-muted-foreground">
          Customize your agent&apos;s personality and behavior (Optional)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="welcomeMessage">Welcome Message</Label>
        <Textarea
          id="welcomeMessage"
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          placeholder="Hello! I'll be walking you through our platform. Feel free to ask questions anytime."
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          The message your agent will say when a presentation starts
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="personalityPrompt">Personality Prompt</Label>
        <Textarea
          id="personalityPrompt"
          value={personalityPrompt}
          onChange={(e) => setPersonalityPrompt(e.target.value)}
          placeholder="You are a helpful sales assistant who explains features clearly and answers questions professionally."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Instructions for how your agent should behave and respond
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fallbackResponse">Fallback Response</Label>
        <Textarea
          id="fallbackResponse"
          value={fallbackResponse}
          onChange={(e) => setFallbackResponse(e.target.value)}
          placeholder="I'm not sure about that. Let me check the documentation or we can explore the feature together."
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Response when the agent doesn&apos;t know the answer
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="guardrails">Guardrails (One per line)</Label>
        <Textarea
          id="guardrails"
          value={guardrails}
          onChange={(e) => setGuardrails(e.target.value)}
          placeholder="Do not discuss pricing&#10;Do not make promises about future features&#10;Stay focused on the current demo"
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Topics or behaviors to avoid (one per line)
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious}>
          Previous
        </Button>
        <Button onClick={handleNext}>
          Next: Review & Publish
        </Button>
      </div>
    </div>
  )
}
