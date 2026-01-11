import { beforeAll, describe, expect, it } from "vitest"
import { connectDB } from "../db/mongoose"
import { IScreenAgent, ScreenAgent } from "../models/screen-agent"

// Helper to generate unique IDs for testing
function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

describe("Screen Agent Model", () => {
  beforeAll(async () => {
    await connectDB()
  })

  it("should create a screen agent with required fields", async () => {
    const agentData = {
      name: "Test Agent",
      ownerId: generateId(),
      organizationId: generateId(),
      targetWebsiteUrl: "https://example.com",
      voiceConfig: {
        provider: "openai" as const,
        voiceId: "alloy",
        language: "en",
      },
      shareableToken: generateId(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = await (ScreenAgent as any).create(agentData)

    expect(agent).toBeDefined()
    expect(agent.name).toBe(agentData.name)
    expect(agent.status).toBe("draft")
    expect(agent.visibility).toBe("private")
    expect(agent.shareableToken).toBe(agentData.shareableToken)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ScreenAgent as any).deleteOne({ _id: agent._id })
  })

  it("should have default values for optional fields", async () => {
    const agentData = {
      name: "Test Agent 2",
      ownerId: generateId(),
      organizationId: generateId(),
      targetWebsiteUrl: "https://example.com",
      voiceConfig: {
        provider: "elevenlabs" as const,
        voiceId: "voice-1",
        language: "en",
      },
      shareableToken: generateId(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = await (ScreenAgent as any).create(agentData)

    expect(agent.totalPresentationCount).toBe(0)
    expect(agent.totalViewerCount).toBe(0)
    expect(agent.totalMinutesConsumed).toBe(0)
    expect(agent.linkUseCount).toBe(0)
    expect(agent.viewerAuthRequired).toBe(false)
    expect(agent.dataCollectionConsent).toBe(false)
    expect(agent.recordingEnabled).toBe(true)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ScreenAgent as any).deleteOne({ _id: agent._id })
  })

  it("should find screen agents by organization", async () => {
    const orgId = generateId()
    const agentData = {
      name: "Org Agent",
      ownerId: generateId(),
      organizationId: orgId,
      targetWebsiteUrl: "https://example.com",
      voiceConfig: {
        provider: "openai" as const,
        voiceId: "alloy",
        language: "en",
      },
      shareableToken: generateId(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = await (ScreenAgent as any).create(agentData)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const foundAgents = await (ScreenAgent as any).find({ organizationId: orgId })

    expect(foundAgents.length).toBeGreaterThan(0)
    expect(foundAgents.some((a: IScreenAgent) => a._id.toString() === agent._id.toString())).toBe(true)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ScreenAgent as any).deleteOne({ _id: agent._id })
  })

  it("should update screen agent status", async () => {
    const agentData = {
      name: "Status Test Agent",
      ownerId: generateId(),
      organizationId: generateId(),
      targetWebsiteUrl: "https://example.com",
      voiceConfig: {
        provider: "openai" as const,
        voiceId: "alloy",
        language: "en",
      },
      shareableToken: generateId(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = await (ScreenAgent as any).create(agentData)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ScreenAgent as any).updateOne({ _id: agent._id }, { status: "active" })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (ScreenAgent as any).findById(agent._id)

    expect(updated?.status).toBe("active")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (ScreenAgent as any).deleteOne({ _id: agent._id })
  })
})
