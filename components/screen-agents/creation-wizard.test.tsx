import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CreationWizard } from "./creation-wizard"

// Mock the wizard hook
vi.mock("@/hooks/use-screen-agent-wizard", () => ({
  useScreenAgentWizard: vi.fn(() => ({
    currentStep: 1,
    data: {},
    isLoading: false,
    error: null,
    updateData: vi.fn(),
    nextStep: vi.fn(),
    previousStep: vi.fn(),
    saveDraft: vi.fn(),
    isStepValid: vi.fn(() => true),
  })),
}))

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

describe("CreationWizard", () => {
  it("should render wizard with step 1", () => {
    render(<CreationWizard organizationId="org-123" />)

    expect(screen.getByText("Create Screen Agent")).toBeDefined()
    expect(screen.getByText("Basic Information")).toBeDefined()
  })

  it("should show progress indicator", () => {
    render(<CreationWizard organizationId="org-123" />)

    const progress = screen.getByRole("progressbar")
    expect(progress).toBeDefined()
  })
})
