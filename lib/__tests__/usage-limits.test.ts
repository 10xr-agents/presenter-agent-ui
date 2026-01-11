import { describe, expect, it } from "vitest"
import { generateId } from "../__tests__/setup"
import { canCreateScreenAgent, canStartPresentationSession, getUsageLimits, isOnFreeTier } from "../usage/limits"

describe("Usage Limits", () => {
  it("should identify organization as free tier when no billing account", async () => {
    const organizationId = generateId()

    const onFreeTier = await isOnFreeTier(organizationId)

    expect(onFreeTier).toBe(true)
  })

  it("should allow screen agent creation on free tier when under limit", async () => {
    const organizationId = generateId()

    const check = await canCreateScreenAgent(organizationId)

    expect(check.allowed).toBe(true)
    expect(check.remaining).toBe(1) // Free tier allows 1 screen agent
  })

  it("should allow presentation session start on free tier when under limit", async () => {
    const organizationId = generateId()

    const check = await canStartPresentationSession(organizationId)

    expect(check.allowed).toBe(true)
    expect(check.remainingMinutes).toBe(20) // Free tier allows 20 minutes per month
  })

  it("should get usage limits for free tier organization", async () => {
    const organizationId = generateId()

    const limits = await getUsageLimits(organizationId)

    expect(limits.tier).toBe("free")
    expect(limits.minutes.limit).toBe(20)
    expect(limits.screenAgents.limit).toBe(1)
  })
})
