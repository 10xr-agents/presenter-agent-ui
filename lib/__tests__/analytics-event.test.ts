import { beforeAll, describe, expect, it } from "vitest"
import { connectDB } from "../db/mongoose"
import { AnalyticsEvent } from "../models/analytics-event"

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

describe("Analytics Event Model", () => {
  beforeAll(async () => {
    await connectDB()
  })

  it("should create a viewer question analytics event", async () => {
    const eventData = {
      organizationId: generateId(),
      screenAgentId: generateId(),
      presentationSessionId: generateId(),
      eventType: "viewer_question" as const,
      eventTimestamp: new Date(),
      properties: {
        questionText: "What is this feature?",
        questionCategory: "feature_inquiry",
        agentResponseQuality: 4.5,
        responseTimeMs: 500,
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = await (AnalyticsEvent as any).create(eventData)

    expect(event).toBeDefined()
    expect(event.eventType).toBe("viewer_question")
    expect(event.properties.questionText).toBe("What is this feature?")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (AnalyticsEvent as any).deleteOne({ _id: event._id })
  })

  it("should create a page navigation analytics event", async () => {
    const eventData = {
      organizationId: generateId(),
      screenAgentId: generateId(),
      presentationSessionId: generateId(),
      eventType: "page_navigation" as const,
      eventTimestamp: new Date(),
      properties: {
        sourceUrl: "https://example.com/page1",
        destinationUrl: "https://example.com/page2",
        navigationTrigger: "agent_action",
        timeSpentOnPreviousPageSeconds: 30,
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = await (AnalyticsEvent as any).create(eventData)

    expect(event.eventType).toBe("page_navigation")
    expect(event.properties.destinationUrl).toBe("https://example.com/page2")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (AnalyticsEvent as any).deleteOne({ _id: event._id })
  })

  it("should create a session milestone analytics event", async () => {
    const eventData = {
      organizationId: generateId(),
      screenAgentId: generateId(),
      presentationSessionId: generateId(),
      eventType: "session_milestone" as const,
      eventTimestamp: new Date(),
      properties: {
        milestoneType: "50_complete",
        timeToMilestoneSeconds: 120,
        viewerEngagementLevel: 75,
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = await (AnalyticsEvent as any).create(eventData)

    expect(event.eventType).toBe("session_milestone")
    expect(event.properties.milestoneType).toBe("50_complete")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (AnalyticsEvent as any).deleteOne({ _id: event._id })
  })
})
