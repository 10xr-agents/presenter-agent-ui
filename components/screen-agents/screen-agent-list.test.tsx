import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ScreenAgentList } from "./screen-agent-list"

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// Mock ShareModal
vi.mock("./share-modal", () => ({
  ShareModal: () => null,
}))

describe("ScreenAgentList", () => {
  it("should render list with agents", () => {
    const agents = [
      {
        id: "agent-1",
        name: "Test Agent",
        status: "active" as const,
        visibility: "private" as const,
        targetWebsiteUrl: "https://example.com",
        totalPresentationCount: 10,
        totalViewerCount: 25,
        totalMinutesConsumed: 120,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]

    render(<ScreenAgentList initialAgents={agents} />)

    expect(screen.getByText("Screen Agents")).toBeDefined()
    expect(screen.getByText("Test Agent")).toBeDefined()
  })

  it("should show empty state when no agents", () => {
    render(<ScreenAgentList initialAgents={[]} />)

    expect(screen.getByText("No Screen Agents yet")).toBeDefined()
  })
})
