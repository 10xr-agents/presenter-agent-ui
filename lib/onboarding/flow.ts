import mongoose, { Schema } from "mongoose"
import { connectDB } from "@/lib/db/mongoose"

export type OnboardingStep =
  | "welcome"
  | "team-invite"
  | "tour"
  | "complete"

export interface IOnboarding extends mongoose.Document {
  userId: string
  organizationId?: string
  currentStep: OnboardingStep
  completedSteps: OnboardingStep[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
  completed: boolean
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const OnboardingSchema = new Schema<IOnboarding>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, index: true },
    currentStep: {
      type: String,
      enum: ["welcome", "team-invite", "tour", "complete"],
      default: "welcome",
    },
    completedSteps: [{ type: String }],
    data: { type: Schema.Types.Mixed, default: {} },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

export const Onboarding =
  mongoose.models.Onboarding ||
  mongoose.model<IOnboarding>("Onboarding", OnboardingSchema)

// Get or create onboarding
export async function getOnboarding(userId: string): Promise<IOnboarding> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onboarding = await (Onboarding as any).findOne({ userId })
  if (!onboarding) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onboarding = await (Onboarding as any).create({
      userId,
      currentStep: "welcome",
      completedSteps: [],
      data: {},
    })
  }

  return onboarding
}

// Update onboarding step
export async function updateOnboardingStep(
  userId: string,
  step: OnboardingStep,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>
): Promise<IOnboarding> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onboarding = await (Onboarding as any).findOne({ userId })
  if (!onboarding) {
    throw new Error("Onboarding not found")
  }

  onboarding.currentStep = step
  if (!onboarding.completedSteps.includes(step)) {
    onboarding.completedSteps.push(step)
  }
  if (data) {
    onboarding.data = { ...onboarding.data, ...data }
  }

  if (step === "complete") {
    onboarding.completed = true
    onboarding.completedAt = new Date()
  }

  await onboarding.save()
  return onboarding
}

// Check if onboarding is complete
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onboarding = await (Onboarding as any).findOne({ userId })
  return onboarding?.completed || false
}

// Get onboarding progress
export async function getOnboardingProgress(_userId: string): Promise<{
  currentStep: OnboardingStep
  completedSteps: OnboardingStep[]
  progress: number
}> {
  await connectDB()

  const onboarding = await getOnboarding(_userId)
  const totalSteps = 3 // welcome, team-invite, tour (excluding 'complete' for progress calculation)
  const progress = (onboarding.completedSteps.length / totalSteps) * 100

  return {
    currentStep: onboarding.currentStep,
    completedSteps: onboarding.completedSteps,
    progress: Math.round(progress),
  }
}

