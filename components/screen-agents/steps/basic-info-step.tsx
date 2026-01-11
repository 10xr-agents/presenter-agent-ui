"use client"

import { Globe, Info } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface BasicInfoStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onNext: () => void
}

export function BasicInfoStep({ data, onUpdate, onNext }: BasicInfoStepProps) {
  const [name, setName] = useState(data.name || "")
  const [description, setDescription] = useState(data.description || "")
  const [targetWebsiteUrl, setTargetWebsiteUrl] = useState(data.targetWebsiteUrl || "")
  const [visibility, setVisibility] = useState<"private" | "team" | "organization" | "public">(
    data.visibility || "private"
  )

  const handleNext = () => {
    onUpdate({
      name,
      description,
      targetWebsiteUrl,
      visibility,
    })
    onNext()
  }

  const isValid = name.trim().length > 0 && targetWebsiteUrl.trim().length > 0

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name" className="flex items-center gap-2">
          <Info className="h-4 w-4" />
          Agent Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Sales Demo Agent"
          required
        />
        <p className="text-xs text-muted-foreground">
          Give your Screen Agent a descriptive name
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of what this agent demonstrates..."
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="targetWebsiteUrl" className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Target Website URL <span className="text-destructive">*</span>
        </Label>
        <Input
          id="targetWebsiteUrl"
          type="url"
          value={targetWebsiteUrl}
          onChange={(e) => setTargetWebsiteUrl(e.target.value)}
          placeholder="https://example.com"
          required
        />
        <p className="text-xs text-muted-foreground">
          The website URL your agent will demonstrate
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="visibility">Visibility</Label>
        <Select
          value={visibility}
          onValueChange={(value) =>
            setVisibility(value as "private" | "team" | "organization" | "public")
          }
        >
          <SelectTrigger id="visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">Private (Only me)</SelectItem>
            <SelectItem value="team">Team (Enterprise only)</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
            <SelectItem value="public">Public (Shareable link)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Control who can view this Screen Agent
        </p>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={handleNext} disabled={!isValid}>
          Next: Voice Configuration
        </Button>
      </div>
    </div>
  )
}
