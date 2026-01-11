"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { OnboardingStep } from "@/lib/onboarding/flow"
import { DEFAULT_TOUR_STEPS, ProductTour } from "./product-tour"
import { TeamInviteStep } from "./team-invite-step"

interface OnboardingFlowProps {
  onComplete?: () => void
  initialStep?: OnboardingStep
  userId?: string
}

export function OnboardingFlow({ onComplete, initialStep = "welcome", userId: _userId }: OnboardingFlowProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(initialStep)
  const [showTour, setShowTour] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const steps: OnboardingStep[] = ["welcome", "team-invite", "tour", "complete"]
  const currentStepIndex = steps.indexOf(currentStep)
  const progress = ((currentStepIndex + 1) / steps.length) * 100

  const handleTeamInviteNext = () => {
    setCurrentStep("tour")
    setShowTour(true)
  }

  const handleTeamInviteSkip = () => {
    setCurrentStep("tour")
    setShowTour(true)
  }

  const handleTourComplete = async () => {
    setIsLoading(true)
    try {
      // Mark onboarding as complete
      const response = await fetch("/api/onboarding/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "complete",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to complete onboarding")
      }

      setCurrentStep("complete")
      onComplete?.()
      
      // Redirect to dashboard
      router.push("/screen-agents")
    } catch (error: unknown) {
      console.error("Failed to complete onboarding:", error)
      // Still redirect even if API call fails
      router.push("/screen-agents")
    } finally {
      setIsLoading(false)
    }
  }

  const handleTourSkip = async () => {
    setIsLoading(true)
    try {
      // Mark onboarding as complete
      const response = await fetch("/api/onboarding/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "complete",
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to complete onboarding")
      }

      setCurrentStep("complete")
      onComplete?.()
      
      // Redirect to dashboard
      router.push("/screen-agents")
    } catch (error: unknown) {
      console.error("Failed to complete onboarding:", error)
      // Still redirect even if API call fails
      router.push("/screen-agents")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading || currentStep === "complete") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Welcome! Let's Get Started</h1>
        <p className="text-muted-foreground">
          Follow these quick steps to set up your account. You can skip any step.
        </p>
      </div>

      <Progress value={progress} className="h-2" />

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        {currentStep === "welcome" && (
          <div className="space-y-4">
            <p>Welcome to the Gemini Navigator Platform! Let's get started.</p>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setCurrentStep("team-invite")}
              >
                Get Started
              </Button>
            </div>
          </div>
        )}

        {currentStep === "team-invite" && (
          <TeamInviteStep onNext={handleTeamInviteNext} onSkip={handleTeamInviteSkip} />
        )}

        {currentStep === "tour" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Product Tour</h2>
              <p className="text-muted-foreground">
                Take a quick tour of the platform to learn about key features. You can skip this
                step if you prefer to explore on your own.
              </p>
            </div>

            <div className="space-y-4">
              <ProductTour steps={DEFAULT_TOUR_STEPS} onComplete={handleTourComplete} onSkip={handleTourSkip} />
              
              <div className="rounded-lg border bg-muted p-4">
                <p className="text-sm text-muted-foreground">
                  Product tour integration coming soon. For now, you can skip this step to continue.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={handleTourSkip}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                disabled={isLoading}
              >
                Skip Tour
              </button>
              <button
                type="button"
                onClick={handleTourComplete}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                disabled={isLoading}
              >
                Complete Tour
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
