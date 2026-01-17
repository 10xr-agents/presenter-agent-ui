"use client"

import { ChevronDown, ChevronUp, Settings } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
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
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface AdvancedVoiceStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onPrevious: () => void
  onCreate: (organizationId: string) => Promise<string | null>
  organizationId: string
  isLoading: boolean
  error: string | null
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

export function AdvancedVoiceStep({
  data,
  onUpdate,
  onPrevious,
  onCreate,
  organizationId,
  isLoading,
  error,
}: AdvancedVoiceStepProps) {
  const router = useRouter()
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // Use provided config or defaults
  const [provider, setProvider] = useState<"elevenlabs" | "openai" | "cartesia">(
    data.voiceConfig?.provider || "openai"
  )
  const [language, setLanguage] = useState(data.voiceConfig?.language || "en")
  const [voiceId, setVoiceId] = useState(data.voiceConfig?.voiceId || "alloy")
  const [speechRate, setSpeechRate] = useState(data.voiceConfig?.speechRate ?? 1.0)
  const [pitch, setPitch] = useState(data.voiceConfig?.pitch ?? 0)

  const handleCreate = async () => {
    onUpdate({
      voiceConfig: {
        provider,
        voiceId,
        language,
        speechRate,
        pitch,
      },
    })

    const agentId = await onCreate(organizationId)
    if (agentId) {
      router.push(`/screen-agents/${agentId}`)
    }
  }

  return (
    <div className="space-y-4">
      <Alert className="bg-muted/50 border-muted">
        <AlertDescription className="text-xs text-muted-foreground">
          Customize voice settings for your agent. Sensible defaults are already applied—you can skip this step or adjust as needed.
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="provider" className="text-sm font-medium">Voice Provider</Label>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value as "elevenlabs" | "openai" | "cartesia")}
          >
            <SelectTrigger id="provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI (Recommended)</SelectItem>
              <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
              <SelectItem value="cartesia">Cartesia</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Default: OpenAI with Alloy voice
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="language" className="text-sm font-medium">Language</Label>
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

        <div className="space-y-1.5">
          <Label htmlFor="voiceId" className="text-sm font-medium">Voice</Label>
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
            You can preview and change voices later in agent settings
          </p>
        </div>

        <div className="border rounded-lg">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between h-9 text-sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <span className="flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Advanced Settings
            </span>
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
          {showAdvanced && (
            <div className="space-y-3 p-3 pt-0 border-t">
              <div className="space-y-1.5">
                <Label htmlFor="speechRate" className="text-sm font-medium">
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
                  Speed of speech (0.5x to 2.0x). Default: 1.0x
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pitch" className="text-sm font-medium">
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
                  Pitch of the voice (-1.0 to +1.0). Default: 0
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onPrevious} disabled={isLoading} size="sm">
          Previous
        </Button>
        <Button onClick={handleCreate} disabled={isLoading} size="sm">
          {isLoading ? (
            <>
              <Spinner className="mr-2 h-3.5 w-3.5" />
              Creating...
            </>
          ) : (
            "Create Agent"
          )}
        </Button>
      </div>
    </div>
  )
}
