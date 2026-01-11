"use client"

import { Languages, Volume2 } from "lucide-react"
import { useState } from "react"
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
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface VoiceConfigStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrevious: () => void
}

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

const OPENAI_VOICES = [
  { value: "alloy", label: "Alloy" },
  { value: "echo", label: "Echo" },
  { value: "fable", label: "Fable" },
  { value: "onyx", label: "Onyx" },
  { value: "nova", label: "Nova" },
  { value: "shimmer", label: "Shimmer" },
]

export function VoiceConfigStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
}: VoiceConfigStepProps) {
  const [provider, setProvider] = useState<"elevenlabs" | "openai" | "cartesia">(
    data.voiceConfig?.provider || "openai"
  )
  const [language, setLanguage] = useState(data.voiceConfig?.language || "en")
  const [voiceId, setVoiceId] = useState(data.voiceConfig?.voiceId || "alloy")
  const [speechRate, setSpeechRate] = useState(data.voiceConfig?.speechRate || 1.0)
  const [pitch, setPitch] = useState(data.voiceConfig?.pitch || 0)

  const handleNext = () => {
    onUpdate({
      voiceConfig: {
        provider,
        voiceId,
        language,
        speechRate,
        pitch,
      },
    })
    onNext()
  }

  const isValid = provider && language && voiceId

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="provider" className="flex items-center gap-2">
          <Volume2 className="h-4 w-4" />
          Voice Provider <span className="text-destructive">*</span>
        </Label>
        <Select
          value={provider}
          onValueChange={(value) => setProvider(value as "elevenlabs" | "openai" | "cartesia")}
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
        <Label htmlFor="language" className="flex items-center gap-2">
          <Languages className="h-4 w-4" />
          Language <span className="text-destructive">*</span>
        </Label>
        <Select value={language} onValueChange={setLanguage}>
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
        <Label htmlFor="voiceId">
          Voice <span className="text-destructive">*</span>
        </Label>
        <Select value={voiceId} onValueChange={setVoiceId}>
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
        <p className="text-xs text-muted-foreground">
          Select a voice for your agent. You can preview voices later.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="speechRate">
            Speech Rate: {speechRate.toFixed(1)}x
          </Label>
          <Input
            id="speechRate"
            type="number"
            min={0.5}
            max={2.0}
            step={0.1}
            value={speechRate}
            onChange={(e) => setSpeechRate(parseFloat(e.target.value) || 1.0)}
          />
          <p className="text-xs text-muted-foreground">
            Adjust the speed of speech (0.5x to 2.0x)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pitch">
            Pitch: {pitch > 0 ? "+" : ""}
            {pitch.toFixed(1)}
          </Label>
          <Input
            id="pitch"
            type="number"
            min={-1.0}
            max={1.0}
            step={0.1}
            value={pitch}
            onChange={(e) => setPitch(parseFloat(e.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground">
            Adjust the pitch of the voice (-1.0 to +1.0)
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious}>
          Previous
        </Button>
        <Button onClick={handleNext} disabled={!isValid}>
          Next: Website Authentication
        </Button>
      </div>
    </div>
  )
}
