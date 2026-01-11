"use client"

import { useCallback, useState } from "react"
import type { CreateScreenAgentData } from "@/lib/screen-agents/manager"

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6

export interface WizardData {
  // Step 1: Basic Information
  name?: string
  description?: string
  targetWebsiteUrl?: string
  visibility?: "private" | "team" | "organization" | "public"
  
  // Step 2: Voice Configuration
  voiceConfig?: {
    provider: "elevenlabs" | "openai" | "cartesia"
    voiceId: string
    language: string
    speechRate?: number
    pitch?: number
  }
  
  // Step 3: Website Authentication
  websiteCredentials?: {
    username: string
    password: string
  }
  
  // Step 4: Knowledge Upload
  knowledgeDocumentIds?: string[]
  domainRestrictions?: string[]
  
  // Step 5: Agent Personality (optional)
  conversationConfig?: {
    personalityPrompt?: string
    welcomeMessage?: string
    fallbackResponse?: string
    guardrails?: string[]
  }
  
  // Step 6: Review & Publish
  sessionTimeoutMinutes?: number
  maxSessionDurationMinutes?: number
}

export function useScreenAgentWizard() {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [data, setData] = useState<WizardData>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string | null>(null)

  const updateData = useCallback((stepData: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...stepData }))
  }, [])

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step)
    setError(null)
  }, [])

  const nextStep = useCallback(() => {
    if (currentStep < 6) {
      setCurrentStep((prev) => (prev + 1) as WizardStep)
      setError(null)
    }
  }, [currentStep])

  const previousStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as WizardStep)
      setError(null)
    }
  }, [currentStep])

  const saveDraft = useCallback(async (organizationId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      if (!data.name || !data.targetWebsiteUrl || !data.voiceConfig) {
        throw new Error("Required fields are missing")
      }

      const agentData: CreateScreenAgentData = {
        name: data.name,
        description: data.description,
        ownerId: "", // Will be set by API
        organizationId,
        visibility: data.visibility || "private",
        targetWebsiteUrl: data.targetWebsiteUrl,
        websiteCredentials: data.websiteCredentials,
        voiceConfig: data.voiceConfig,
        conversationConfig: data.conversationConfig,
        knowledgeDocumentIds: data.knowledgeDocumentIds || [],
        domainRestrictions: data.domainRestrictions,
        sessionTimeoutMinutes: data.sessionTimeoutMinutes || 60,
        maxSessionDurationMinutes: data.maxSessionDurationMinutes || 120,
      }

      const response = await fetch("/api/screen-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to save draft")
      }

      const result = (await response.json()) as { data?: { id?: string } }
      if (result.data?.id) {
        setAgentId(result.data.id)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to save draft"
      setError(message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [data])

  const isStepValid = useCallback((step: WizardStep): boolean => {
    switch (step) {
      case 1:
        return !!(data.name && data.targetWebsiteUrl)
      case 2:
        return !!(
          data.voiceConfig?.provider &&
          data.voiceConfig?.voiceId &&
          data.voiceConfig?.language
        )
      case 3:
        // Optional step - always valid
        return true
      case 4:
        // Optional step - always valid
        return true
      case 5:
        // Optional step - always valid
        return true
      case 6:
        // Review step - check all required fields
        return !!(data.name && data.targetWebsiteUrl && data.voiceConfig)
      default:
        return false
    }
  }, [data])

  return {
    currentStep,
    data,
    isLoading,
    error,
    agentId,
    updateData,
    goToStep,
    nextStep,
    previousStep,
    saveDraft,
    isStepValid,
  }
}
