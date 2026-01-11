import { beforeAll, describe, expect, it } from "vitest"
import { connectDB } from "../db/mongoose"
import { PresentationSession } from "../models/presentation-session"

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

describe("Presentation Session Model", () => {
  beforeAll(async () => {
    await connectDB()
  })

  it("should create a presentation session with required fields", async () => {
    const sessionData = {
      screenAgentId: generateId(),
      sessionToken: generateId(),
      startedAt: new Date(),
      liveKitRoomId: generateId(),
      durationSeconds: 0,
      completionStatus: "abandoned" as const,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await (PresentationSession as any).create(sessionData)

    expect(session).toBeDefined()
    expect(session.sessionToken).toBe(sessionData.sessionToken)
    expect(session.completionStatus).toBe("abandoned")
    expect(session.totalQuestionsAsked).toBe(0)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (PresentationSession as any).deleteOne({ _id: session._id })
  })

  it("should store viewer info when provided", async () => {
    const sessionData = {
      screenAgentId: generateId(),
      sessionToken: generateId(),
      startedAt: new Date(),
      liveKitRoomId: generateId(),
      durationSeconds: 0,
      completionStatus: "completed" as const,
      viewerInfo: {
        name: "Test Viewer",
        email: "viewer@example.com",
        company: "Test Company",
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await (PresentationSession as any).create(sessionData)

    expect(session.viewerInfo?.name).toBe("Test Viewer")
    expect(session.viewerInfo?.email).toBe("viewer@example.com")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (PresentationSession as any).deleteOne({ _id: session._id })
  })

  it("should track questions and navigation", async () => {
    const sessionData = {
      screenAgentId: generateId(),
      sessionToken: generateId(),
      startedAt: new Date(),
      liveKitRoomId: generateId(),
      durationSeconds: 120,
      completionStatus: "completed" as const,
      questions: [
        {
          question: "What is this feature?",
          timestamp: new Date(),
        },
      ],
      pagesVisited: ["https://example.com/page1", "https://example.com/page2"],
      navigationEventCount: 2,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await (PresentationSession as any).create(sessionData)

    expect(session.questions.length).toBe(1)
    expect(session.pagesVisited.length).toBe(2)
    expect(session.navigationEventCount).toBe(2)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (PresentationSession as any).deleteOne({ _id: session._id })
  })
})
