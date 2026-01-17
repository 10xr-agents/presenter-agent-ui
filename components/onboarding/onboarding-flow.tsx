"use client"

import { Spinner } from "@/components/ui/spinner"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import type { OnboardingStep } from "@/lib/onboarding/flow"
import { DEFAULT_TOUR_STEPS, ProductTour } from "./product-tour"
import { TeamInviteStep } from "./team-invite-step"
import { WelcomeStep } from "./welcome-step"

interface OnboardingFlowProps {
  onComplete?: () => void
  initialStep?: OnboardingStep
  userId?: string
}

export function OnboardingFlow({ onComplete, initialStep = "welcome", userId: _userId }: OnboardingFlowProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(initialStep)
  const [isLoading, setIsLoading] = useState(false)

  const steps: OnboardingStep[] = ["welcome", "team-invite", "tour", "complete"]
  const currentStepIndex = steps.indexOf(currentStep)
  // Calculate progress: welcome doesn't count, so progress is based on remaining steps
  const progressableSteps = steps.filter((step) => step !== "welcome" && step !== "complete")
  const progressableIndex = progressableSteps.indexOf(currentStep)
  const progress = currentStep === "welcome" 
    ? 0 
    : currentStep === "complete"
    ? 100
    : ((progressableIndex + 1) / progressableSteps.length) * 100

  const handleTeamInviteNext = async () => {
    // Mark team-invite step as completed
    try {
      await fetch("/api/onboarding/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "team-invite",
        }),
      })
    } catch (error: unknown) {
      console.error("Failed to update onboarding step:", error)
    }
    setCurrentStep("tour")
  }

  const handleTeamInviteSkip = async () => {
    // Mark team-invite step as skipped (still record it as completed)
    try {
      await fetch("/api/onboarding/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "team-invite",
        }),
      })
    } catch (error: unknown) {
      console.error("Failed to update onboarding step:", error)
    }
    setCurrentStep("tour")
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
      
      // Redirect to dashboard after onboarding completion
      router.push("/dashboard")
    } catch (error: unknown) {
      console.error("Failed to complete onboarding:", error)
      // Still redirect even if API call fails
      router.push("/dashboard")
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
      
      // Redirect to dashboard after onboarding completion
      router.push("/dashboard")
    } catch (error: unknown) {
      console.error("Failed to complete onboarding:", error)
      // Still redirect even if API call fails
      router.push("/dashboard")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading || currentStep === "complete") {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-8">
      {currentStep !== "welcome" && (
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Setup Your Account</h1>
          <p className="text-muted-foreground">
            Follow these quick steps to get started. You can skip any step and return later.
          </p>
        </div>
      )}

      {currentStep !== "welcome" && <Progress value={progress} className="h-2" />}

      <div className="rounded-lg border bg-card p-6 shadow-sm">
        {currentStep === "welcome" && (
          <WelcomeStep onNext={() => setCurrentStep("team-invite")} />
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
              <Button
                type="button"
                variant="outline"
                onClick={handleTourSkip}
                disabled={isLoading}
              >
                Skip Tour
              </Button>
              <Button
                type="button"
                onClick={handleTourComplete}
                disabled={isLoading}
              >
                Complete Tour
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
