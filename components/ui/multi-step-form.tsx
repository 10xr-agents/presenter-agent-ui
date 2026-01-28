"use client"

import { Check, ChevronLeft, ChevronRight } from "lucide-react"
import { ReactNode, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export interface FormStep {
  id: string
  title: string
  description?: string
  component: ReactNode
  validation?: () => Promise<boolean> | boolean
  nextButtonLabel?: string | (() => string)
}

interface MultiStepFormProps {
  steps: FormStep[]
  onComplete: (data: Record<string, unknown>) => Promise<void> | void
  onCancel?: () => void
  className?: string
  currentStepIndex?: number // Controlled step index
  onStepChange?: (index: number) => void // Callback when step changes
}

export function MultiStepForm({
  steps,
  onComplete,
  onCancel,
  className,
  currentStepIndex: controlledStepIndex,
  onStepChange,
}: MultiStepFormProps) {
  const [internalStep, setInternalStep] = useState(0)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  // Use controlled step index if provided, otherwise use internal state
  const currentStep = controlledStepIndex !== undefined ? controlledStepIndex : internalStep
  
  // Sync internal state when controlled index changes
  useEffect(() => {
    if (controlledStepIndex !== undefined && controlledStepIndex !== internalStep) {
      setInternalStep(controlledStepIndex)
    }
  }, [controlledStepIndex, internalStep])
  
  // Handler for step changes - calls onStepChange if provided
  const setCurrentStep = (index: number) => {
    if (controlledStepIndex !== undefined) {
      // Controlled mode - notify parent
      onStepChange?.(index)
    } else {
      // Uncontrolled mode - update internal state
      setInternalStep(index)
    }
  }

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
      {/* Step Navigation - Improved Design */}
      <div className="bg-muted/30 rounded-lg p-4 border">
        <div className="flex items-center justify-between gap-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-1">
                {/* Step Circle */}
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-200",
                      index < currentStep && "border-primary bg-primary text-primary-foreground shadow-sm",
                      index === currentStep && "border-primary bg-primary/10 text-primary font-semibold shadow-md scale-105",
                      index > currentStep && "border-muted-foreground/30 bg-background text-muted-foreground"
                    )}
                  >
                    {index < currentStep ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-semibold">{index + 1}</span>
                    )}
                  </div>
                  {/* Connecting Line */}
                  {index < steps.length - 1 && (
                    <div className="absolute left-[36px] top-1/2 -translate-y-1/2 w-full">
                      <div
                        className={cn(
                          "h-0.5 transition-colors duration-200",
                          index < currentStep ? "bg-primary" : "bg-muted-foreground/20"
                        )}
                        style={{ width: "calc(100% - 18px)" }}
                      />
                    </div>
                  )}
                </div>
                
                {/* Step Info */}
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-sm font-semibold truncate",
                    index === currentStep ? "text-foreground" : index < currentStep ? "text-muted-foreground" : "text-muted-foreground/70"
                  )}>
                    {step.title}
                  </div>
                  {step.description && (
                    <div className={cn(
                      "text-xs mt-0.5 truncate",
                      index === currentStep ? "text-muted-foreground" : "text-muted-foreground/60"
                    )}>
                      {step.description}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Progress Bar */}
        <div className="mt-4 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Current Step Content */}
      <div className="min-h-[400px]">
        {errors.general && (
          <div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {errors.general}
          </div>
        )}
        {steps[currentStep]?.component}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between border-t pt-4">
        <div>
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isFirstStep && (
            <Button variant="outline" size="sm" onClick={handlePrevious} disabled={loading}>
              <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
              Previous
            </Button>
          )}
          <Button size="sm" onClick={handleNext} disabled={loading}>
            {loading ? (
              <>
                <Spinner className="mr-2 h-3.5 w-3.5" />
                {isLastStep ? "Submitting..." : "Loading..."}
              </>
            ) : isLastStep ? (
              "Complete"
            ) : (
              <>
                {(() => {
                  const step = steps[currentStep]
                  if (!step) return "Next"
                  if (step.nextButtonLabel) {
                    return typeof step.nextButtonLabel === "function" 
                      ? step.nextButtonLabel() 
                      : step.nextButtonLabel
                  }
                  return "Next"
                })()}
                <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
