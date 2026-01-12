"use client"

import { useCallback, useState } from "react"
import type { CreateScreenAgentData } from "@/lib/screen-agents/manager"

export type WizardStep = 1 | 2 | 3 | 4

export interface WizardData {
  // Step 1: Basic Agent Identity
  name?: string
  description?: string
  
  // Step 2: Website Capture Setup
  targetWebsiteUrl?: string
  websiteCredentials?: {
    username: string
    password: string
  }
  loginNotes?: string
  
  // Step 3: Knowledge Sources (optional)
  knowledgeDocumentIds?: string[]
  domainRestrictions?: string[]
  
  // Step 4: Advanced Voice Configuration (optional)
  voiceConfig?: {
    provider: "elevenlabs" | "openai" | "cartesia"
    voiceId: string
    language: string
    speechRate?: number
    pitch?: number
  }
  
  // Optional advanced settings
  conversationConfig?: {
    personalityPrompt?: string
    welcomeMessage?: string
    fallbackResponse?: string
    guardrails?: string[]
  }
  sessionTimeoutMinutes?: number
  maxSessionDurationMinutes?: number
}

// Default voice configuration (applied automatically)
const DEFAULT_VOICE_CONFIG = {
  provider: "openai" as const,
  voiceId: "alloy",
  language: "en",
  speechRate: 1.0,
  pitch: 0,
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
    if (currentStep < 4) {
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

  const createAgent = useCallback(async (organizationId: string): Promise<string | null> => {
    setIsLoading(true)
    setError(null)

    try {
      // Validate required fields
      if (!data.name || !data.description || !data.targetWebsiteUrl) {
        throw new Error("Name, description, and website URL are required")
      }
      if (data.name.trim().length < 3) {
        throw new Error("Name must be at least 3 characters")
      }
      if (data.description.trim().length < 20) {
        throw new Error("Description must be at least 20 characters")
      }

      // Use provided voice config or defaults
      const voiceConfig = data.voiceConfig || DEFAULT_VOICE_CONFIG

      const agentData: CreateScreenAgentData = {
        name: data.name,
        description: data.description,
        ownerId: "", // Will be set by API
        organizationId,
        // Visibility is implicit and determined server-side
        targetWebsiteUrl: data.targetWebsiteUrl,
        websiteCredentials: data.websiteCredentials,
        voiceConfig,
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
        throw new Error(errorData.error || "Failed to create agent")
      }

      const result = (await response.json()) as { data?: { id?: string } }
      if (result.data?.id) {
        setAgentId(result.data.id)
        return result.data.id
      }

      throw new Error("Agent created but no ID returned")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create agent"
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [data])

  const canCreate = useCallback((): boolean => {
    // Can create after Step 2 (name, description, and URL are required)
    return !!(
      data.name &&
      data.name.trim().length >= 3 &&
      data.description &&
      data.description.trim().length >= 20 &&
      data.targetWebsiteUrl
    )
  }, [data])

  const isStepValid = useCallback((step: WizardStep): boolean => {
    switch (step) {
      case 1:
        return !!(
          data.name &&
          data.name.trim().length >= 3 &&
          data.description &&
          data.description.trim().length >= 20
        )
      case 2:
        return !!(data.name && data.targetWebsiteUrl && data.description)
      case 3:
        // Optional step - always valid
        return true
      case 4:
        // Optional step - always valid
        return true
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
    createAgent,
    canCreate,
    isStepValid,
  }
}
