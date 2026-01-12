"use client"

import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface BasicIdentityStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onNext: () => void
}

export function BasicIdentityStep({ data, onUpdate, onNext }: BasicIdentityStepProps) {
  const [name, setName] = useState(data.name || "")
  const [description, setDescription] = useState(data.description || "")
  const [nameError, setNameError] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)

  const validateName = (value: string) => {
    if (value.trim().length === 0) {
      setNameError("Agent name is required")
      return false
    }
    if (value.trim().length < 3) {
      setNameError("Agent name must be at least 3 characters")
      return false
    }
    if (value.trim().length > 100) {
      setNameError("Agent name must be less than 100 characters")
      return false
    }
    setNameError(null)
    return true
  }

  const validateDescription = (value: string) => {
    if (value.trim().length === 0) {
      setDescriptionError("Description is required")
      return false
    }
    if (value.trim().length < 20) {
      setDescriptionError("Description must be at least 20 characters")
      return false
    }
    if (value.trim().length > 500) {
      setDescriptionError("Description must be less than 500 characters")
      return false
    }
    setDescriptionError(null)
    return true
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setName(value)
    validateName(value)
  }

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setDescription(value)
    if (value.trim()) {
      validateDescription(value)
    } else {
      setDescriptionError(null)
    }
  }

  const handleNext = () => {
    if (!validateName(name)) {
      return
    }
    if (!validateDescription(description)) {
      return
    }

    onUpdate({
      name: name.trim(),
      description: description.trim(),
    })
    onNext()
  }

  const isValid = name.trim().length >= 3 && !nameError && description.trim().length >= 20 && !descriptionError

  return (
    <div className="space-y-4">
      <Alert className="bg-muted/50 border-muted">
        <AlertDescription className="text-xs text-muted-foreground">
          An AI-powered agent that presents and navigates your website interactively, answering questions and demonstrating features in real-time.
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-sm font-medium">
          Agent Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          value={name}
          onChange={handleNameChange}
          onBlur={() => validateName(name)}
          placeholder="My Sales Demo Agent"
          required
          className={nameError ? "border-destructive" : ""}
        />
        {nameError ? (
          <p className="text-xs text-destructive">{nameError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Descriptive name for your agent. Can be changed later.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-sm font-medium">
          Description <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="description"
          value={description}
          onChange={handleDescriptionChange}
          onBlur={() => validateDescription(description)}
          placeholder="I'm your AI sales assistant for Acme CRM. I'll walk you through our platform's key features, demonstrate how to create and manage customer records, and answer any questions you have about our product capabilities."
          rows={4}
          required
          className={descriptionError ? "border-destructive" : ""}
        />
        {descriptionError ? (
          <p className="text-xs text-destructive">{descriptionError}</p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Write in first person as the agent speaking to users. Start with "I'm..." or "I'll..." to introduce the agent.
            </p>
            <p className="text-xs text-muted-foreground">
              {description.trim().length}/500 characters
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleNext} disabled={!isValid} size="sm">
          Next
        </Button>
      </div>
    </div>
  )
}
