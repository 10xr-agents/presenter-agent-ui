import { describe, expect, it } from "vitest"
import { generateId } from "../__tests__/setup"
import {
  FREE_TIER_MINUTES_PER_MONTH,
  FREE_TIER_SCREEN_AGENTS_ALLOWED,
  getFreeTierScreenAgentCount,
  getFreeTierUsageMinutes,
  isFreeTierMinutesExceeded,
  isFreeTierScreenAgentExceeded,
} from "../usage/free-tier"

describe("Free Tier Usage", () => {
  it("should get free tier usage minutes (zero initially)", async () => {
    const organizationId = generateId()

    const usage = await getFreeTierUsageMinutes(organizationId)

    expect(usage.used).toBe(0)
    expect(usage.limit).toBe(FREE_TIER_MINUTES_PER_MONTH)
    expect(usage.remaining).toBe(FREE_TIER_MINUTES_PER_MONTH)
    expect(usage.percentage).toBe(0)
  })

  it("should get free tier screen agent count (zero initially)", async () => {
    const organizationId = generateId()

    const usage = await getFreeTierScreenAgentCount(organizationId)

    expect(usage.used).toBe(0)
    expect(usage.limit).toBe(FREE_TIER_SCREEN_AGENTS_ALLOWED)
    expect(usage.remaining).toBe(FREE_TIER_SCREEN_AGENTS_ALLOWED)
  })

  it("should check if minutes limit is not exceeded initially", async () => {
    const organizationId = generateId()

    const check = await isFreeTierMinutesExceeded(organizationId)

    expect(check.exceeded).toBe(false)
    expect(check.used).toBe(0)
    expect(check.limit).toBe(FREE_TIER_MINUTES_PER_MONTH)
    expect(check.remaining).toBe(FREE_TIER_MINUTES_PER_MONTH)
  })

  it("should check if screen agent limit is not exceeded initially", async () => {
    const organizationId = generateId()

    const check = await isFreeTierScreenAgentExceeded(organizationId)

    expect(check.exceeded).toBe(false)
    expect(check.used).toBe(0)
    expect(check.limit).toBe(FREE_TIER_SCREEN_AGENTS_ALLOWED)
    expect(check.remaining).toBe(FREE_TIER_SCREEN_AGENTS_ALLOWED)
  })
})
