"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useScreenAgentWizard } from "@/hooks/use-screen-agent-wizard"
import { BasicInfoStep } from "./steps/basic-info-step"
import { KnowledgeUploadStep } from "./steps/knowledge-upload-step"
import { PersonalityStep } from "./steps/personality-step"
import { ReviewStep } from "./steps/review-step"
import { VoiceConfigStep } from "./steps/voice-config-step"
import { WebsiteAuthStep } from "./steps/website-auth-step"

interface CreationWizardProps {
  organizationId: string
}

const STEPS = [
  { number: 1, title: "Basic Information", description: "Name and target website" },
  { number: 2, title: "Voice Configuration", description: "Select voice and language" },
  { number: 3, title: "Website Authentication", description: "Credentials (optional)" },
  { number: 4, title: "Knowledge Upload", description: "Add context files (optional)" },
  { number: 5, title: "Agent Personality", description: "Customize behavior (optional)" },
  { number: 6, title: "Review & Create", description: "Review and publish" },
]

export function CreationWizard({ organizationId }: CreationWizardProps) {
  const {
    currentStep,
    data,
    isLoading,
    error,
    updateData,
    nextStep,
    previousStep,
    saveDraft,
    isStepValid,
  } = useScreenAgentWizard()

  const progress = (currentStep / 6) * 100

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Create Screen Agent</h1>
        <p className="text-muted-foreground mt-2">
          Follow these steps to create your interactive screen presentation agent
        </p>
      </div>

      <Progress value={progress} className="h-2" />

      <div className="flex gap-2 overflow-x-auto pb-2">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className={`flex-1 min-w-[120px] text-center p-2 rounded ${
              step.number === currentStep
                ? "bg-primary text-primary-foreground"
                : step.number < currentStep
                  ? "bg-muted"
                  : "bg-background border"
            }`}
          >
            <div className="font-semibold text-sm">{step.number}</div>
            <div className="text-xs mt-1">{step.title}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1]?.title}</CardTitle>
          <CardDescription>{STEPS[currentStep - 1]?.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <BasicInfoStep data={data} onUpdate={updateData} onNext={nextStep} />
          )}
          {currentStep === 2 && (
            <VoiceConfigStep
              data={data}
              onUpdate={updateData}
              onNext={nextStep}
              onPrevious={previousStep}
            />
          )}
          {currentStep === 3 && (
            <WebsiteAuthStep
              data={data}
              onUpdate={updateData}
              onNext={nextStep}
              onPrevious={previousStep}
            />
          )}
          {currentStep === 4 && (
            <KnowledgeUploadStep
              data={data}
              onUpdate={updateData}
              onNext={nextStep}
              onPrevious={previousStep}
            />
          )}
          {currentStep === 5 && (
            <PersonalityStep
              data={data}
              onUpdate={updateData}
              onNext={nextStep}
              onPrevious={previousStep}
            />
          )}
          {currentStep === 6 && (
            <ReviewStep
              data={data}
              organizationId={organizationId}
              onPrevious={previousStep}
              onSaveDraft={saveDraft}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
