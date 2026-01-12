"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useScreenAgentWizard } from "@/hooks/use-screen-agent-wizard"
import { AdvancedVoiceStep } from "./steps/advanced-voice-step"
import { BasicIdentityStep } from "./steps/basic-identity-step"
import { KnowledgeSourcesStep } from "./steps/knowledge-sources-step"
import { WebsiteCaptureStep } from "./steps/website-capture-step"

interface CreationWizardProps {
  organizationId: string
}

const STEPS = [
  { number: 1, title: "Identity", description: "Name and description" },
  { number: 2, title: "Website", description: "URL and credentials" },
  { number: 3, title: "Knowledge", description: "Add context (optional)" },
  { number: 4, title: "Voice", description: "Advanced (optional)" },
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
    createAgent,
    canCreate,
  } = useScreenAgentWizard()

  const progress = (currentStep / STEPS.length) * 100

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create Screen Agent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create an AI agent that presents your website interactively.
        </p>
      </div>

      <Progress value={progress} className="h-1" />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className={`flex-1 min-w-[100px] text-center px-2 py-1.5 rounded-md transition-colors text-xs ${
              step.number === currentStep
                ? "bg-primary text-primary-foreground font-medium"
                : step.number < currentStep
                  ? "bg-muted/50 text-muted-foreground"
                  : "bg-background border text-muted-foreground"
            }`}
          >
            <div className="font-medium">{step.number}</div>
            <div className="text-[10px] mt-0.5 leading-tight">{step.title}</div>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">{STEPS[currentStep - 1]?.title}</CardTitle>
          <CardDescription className="text-xs">{STEPS[currentStep - 1]?.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <BasicIdentityStep data={data} onUpdate={updateData} onNext={nextStep} />
          )}
          {currentStep === 2 && (
            <WebsiteCaptureStep
              data={data}
              onUpdate={updateData}
              onNext={nextStep}
              onPrevious={previousStep}
              onCreate={createAgent}
              organizationId={organizationId}
              isLoading={isLoading}
              error={error}
            />
          )}
          {currentStep === 3 && (
            <KnowledgeSourcesStep
              data={data}
              onUpdate={updateData}
              onNext={nextStep}
              onPrevious={previousStep}
              onCreate={createAgent}
              organizationId={organizationId}
              isLoading={isLoading}
              error={error}
            />
          )}
          {currentStep === 4 && (
            <AdvancedVoiceStep
              data={data}
              onUpdate={updateData}
              onPrevious={previousStep}
              onCreate={createAgent}
              organizationId={organizationId}
              isLoading={isLoading}
              error={error}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
