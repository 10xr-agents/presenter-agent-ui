"use client"

import { Loader2, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { UpdateScreenAgentData } from "@/lib/screen-agents/manager"

interface ScreenAgentData {
  id: string
  name: string
  description?: string
  visibility: "private" | "team" | "organization" | "public"
  targetWebsiteUrl: string
  voiceConfig: {
    provider: "elevenlabs" | "openai" | "cartesia"
    voiceId: string
    language: string
    speechRate?: number
    pitch?: number
  }
}

interface EditFormProps {
  agent: ScreenAgentData
}

export function EditForm({ agent }: EditFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description || "")
  const [targetWebsiteUrl, setTargetWebsiteUrl] = useState(agent.targetWebsiteUrl)
  // Visibility is implicit and not configurable - removed from UI
  const [provider, setProvider] = useState<"elevenlabs" | "openai" | "cartesia">(
    agent.voiceConfig.provider
  )
  const [voiceId, setVoiceId] = useState(agent.voiceConfig.voiceId)
  const [language, setLanguage] = useState(agent.voiceConfig.language)
  const [speechRate, setSpeechRate] = useState(agent.voiceConfig.speechRate || 1.0)
  const [pitch, setPitch] = useState(agent.voiceConfig.pitch || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const updateData: UpdateScreenAgentData = {
        name,
        description: description || undefined,
        targetWebsiteUrl,
        // Visibility is implicit and not configurable
        voiceConfig: {
          provider,
          voiceId,
          language,
          speechRate,
          pitch,
        },
      }

      const response = await fetch(`/api/screen-agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to update agent")
      }

      router.push(`/screen-agents/${agent.id}`)
      router.refresh()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update agent"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const OPENAI_VOICES = [
    { value: "alloy", label: "Alloy" },
    { value: "echo", label: "Echo" },
    { value: "fable", label: "Fable" },
    { value: "onyx", label: "Onyx" },
    { value: "nova", label: "Nova" },
    { value: "shimmer", label: "Shimmer" },
  ]

  const LANGUAGES = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "it", label: "Italian" },
    { value: "pt", label: "Portuguese" },
    { value: "zh", label: "Chinese" },
    { value: "ja", label: "Japanese" },
    { value: "ko", label: "Korean" },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            Agent Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="targetWebsiteUrl">
            Target Website URL <span className="text-destructive">*</span>
          </Label>
          <Input
            id="targetWebsiteUrl"
            type="url"
            value={targetWebsiteUrl}
            onChange={(e) => setTargetWebsiteUrl(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        {/* Visibility is implicit and not configurable - removed from UI */}
      </div>

      <div className="space-y-4 border-t pt-4">
        <h3 className="text-lg font-semibold">Voice Configuration</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="provider">Voice Provider</Label>
            <Select
              value={provider}
              onValueChange={(value) => setProvider(value as "elevenlabs" | "openai" | "cartesia")}
              disabled={isLoading}
            >
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                <SelectItem value="cartesia">Cartesia</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select value={language} onValueChange={setLanguage} disabled={isLoading}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voiceId">Voice</Label>
            <Select value={voiceId} onValueChange={setVoiceId} disabled={isLoading}>
              <SelectTrigger id="voiceId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {provider === "openai" &&
                  OPENAI_VOICES.map((voice) => (
                    <SelectItem key={voice.value} value={voice.value}>
                      {voice.label}
                    </SelectItem>
                  ))}
                {provider === "elevenlabs" && (
                  <>
                    <SelectItem value="voice-1">Voice 1</SelectItem>
                    <SelectItem value="voice-2">Voice 2</SelectItem>
                    <SelectItem value="voice-3">Voice 3</SelectItem>
                  </>
                )}
                {provider === "cartesia" && (
                  <>
                    <SelectItem value="cartesia-1">Cartesia Voice 1</SelectItem>
                    <SelectItem value="cartesia-2">Cartesia Voice 2</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="speechRate">Speech Rate</Label>
            <Input
              id="speechRate"
              type="number"
              min={0.5}
              max={2.0}
              step={0.1}
              value={speechRate}
              onChange={(e) => setSpeechRate(parseFloat(e.target.value) || 1.0)}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pitch">Pitch</Label>
            <Input
              id="pitch"
              type="number"
              min={-1.0}
              max={1.0}
              step={0.1}
              value={pitch}
              onChange={(e) => setPitch(parseFloat(e.target.value) || 0)}
              disabled={isLoading}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
