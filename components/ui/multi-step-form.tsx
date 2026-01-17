"use client"

import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { ReactNode, useState } from "react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export interface FormStep {
  id: string
  title: string
  description?: string
  component: ReactNode
  validation?: () => Promise<boolean> | boolean
}

interface MultiStepFormProps {
  steps: FormStep[]
  onComplete: (data: Record<string, unknown>) => Promise<void> | void
  onCancel?: () => void
  className?: string
}

export function MultiStepForm({
  steps,
  onComplete,
  onCancel,
  className,
}: MultiStepFormProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const progress = ((currentStep + 1) / steps.length) * 100
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1

  const handleNext = async () => {
    const step = steps[currentStep]
    if (!step) return

    // Validate current step if validation function exists
    if (step.validation) {
      try {
        const isValid = await step.validation()
        if (!isValid) {
          return
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Validation failed"
        setErrors({ [step.id]: message })
        return
      }
    }

    if (isLastStep) {
      // Complete form
      setLoading(true)
      try {
        await onComplete(formData)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to submit"
        setErrors({ general: message })
      } finally {
        setLoading(false)
      }
    } else {
      setCurrentStep(currentStep + 1)
      setErrors({})
    }
  }

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1)
      setErrors({})
    }
  }

  const updateFormData = (stepId: string, data: Record<string, unknown>) => {
    setFormData((prev) => {
      const prevStepData = prev[stepId]
      return {
        ...prev,
        [stepId]: {
          ...(typeof prevStepData === "object" && prevStepData !== null ? prevStepData : {}),
          ...data,
        },
      }
    })
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Progress Indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-muted-foreground">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} />
      </div>

      {/* Step Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-2",
                index < currentStep && "text-muted-foreground",
                index === currentStep && "text-primary font-medium",
                index > currentStep && "text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2",
                  index < currentStep && "border-primary bg-primary text-primary-foreground",
                  index === currentStep && "border-primary bg-background",
                  index > currentStep && "border-muted bg-background"
                )}
              >
                {index < currentStep ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-medium">{step.title}</div>
                {step.description && (
                  <div className="text-xs text-muted-foreground">{step.description}</div>
                )}
              </div>
              {index < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Current Step Content */}
      <div className="min-h-[400px]">
        {errors.general && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errors.general}
          </div>
        )}
        {steps[currentStep]?.component}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between border-t pt-4">
        <div>
          {onCancel && (
            <Button variant="outline" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isFirstStep && (
            <Button variant="outline" onClick={handlePrevious} disabled={loading}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>
          )}
          <Button onClick={handleNext} disabled={loading}>
            {loading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                {isLastStep ? "Submitting..." : "Loading..."}
              </>
            ) : isLastStep ? (
              "Complete"
            ) : (
              <>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
