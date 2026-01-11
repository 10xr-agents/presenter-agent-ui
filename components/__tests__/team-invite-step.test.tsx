import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TeamInviteStep } from "../onboarding/team-invite-step"

describe("TeamInviteStep", () => {
  const mockOnNext = vi.fn()
  const mockOnSkip = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders team invite step", () => {
    render(<TeamInviteStep onNext={mockOnNext} onSkip={mockOnSkip} />)

    expect(screen.getByText("Invite Team Members")).toBeDefined()
    expect(screen.getByPlaceholderText("colleague@example.com")).toBeDefined()
    expect(screen.getByText("Skip")).toBeDefined()
    expect(screen.getByText("Continue")).toBeDefined()
  })
})
