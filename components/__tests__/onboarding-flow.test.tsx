import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { OnboardingFlow } from "../onboarding/onboarding-flow"

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
  })),
}))

// Mock fetch
global.fetch = vi.fn()

describe("OnboardingFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })
  })

  it("renders onboarding flow with team invite step", () => {
    render(<OnboardingFlow />)

    expect(screen.getByText("Welcome! Let's Get Started")).toBeDefined()
    expect(screen.getByText("Invite Team Members")).toBeDefined()
  })

  it("renders skip and continue buttons", () => {
    render(<OnboardingFlow />)

    expect(screen.getByText("Skip")).toBeDefined()
    expect(screen.getByText("Continue")).toBeDefined()
  })
})
