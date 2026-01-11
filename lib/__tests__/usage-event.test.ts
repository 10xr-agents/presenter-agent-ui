import { beforeAll, describe, expect, it } from "vitest"
import { connectDB } from "../db/mongoose"
import { UsageEvent } from "../models/usage-event"

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

describe("Usage Event Model", () => {
  beforeAll(async () => {
    await connectDB()
  })

  it("should create a session minutes usage event", async () => {
    const eventData = {
      organizationId: generateId(),
      screenAgentId: generateId(),
      presentationSessionId: generateId(),
      eventType: "session_minutes" as const,
      eventTimestamp: new Date(),
      quantity: 10, // 10 minutes
      unitCostCents: 100, // $1.00 per minute
      totalCostCents: 1000, // $10.00
      billingAccountId: generateId(),
      billingStatus: "unbilled" as const,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = await (UsageEvent as any).create(eventData)

    expect(event).toBeDefined()
    expect(event.eventType).toBe("session_minutes")
    expect(event.quantity).toBe(10)
    expect(event.totalCostCents).toBe(1000)
    expect(event.billingStatus).toBe("unbilled")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (UsageEvent as any).deleteOne({ _id: event._id })
  })

  it("should create a knowledge processing usage event", async () => {
    const eventData = {
      organizationId: generateId(),
      screenAgentId: generateId(),
      eventType: "knowledge_processing" as const,
      eventTimestamp: new Date(),
      quantity: 50, // 50 pages
      unitCostCents: 10, // $0.10 per page
      totalCostCents: 500, // $5.00
      billingAccountId: generateId(),
      billingStatus: "unbilled" as const,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = await (UsageEvent as any).create(eventData)

    expect(event.eventType).toBe("knowledge_processing")
    expect(event.quantity).toBe(50)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (UsageEvent as any).deleteOne({ _id: event._id })
  })

  it("should update billing status when billed", async () => {
    const eventData = {
      organizationId: generateId(),
      screenAgentId: generateId(),
      eventType: "session_minutes" as const,
      eventTimestamp: new Date(),
      quantity: 5,
      unitCostCents: 100,
      totalCostCents: 500,
      billingAccountId: generateId(),
      billingStatus: "unbilled" as const,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event = await (UsageEvent as any).create(eventData)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (UsageEvent as any).updateOne(
      { _id: event._id },
      { billingStatus: "billed", invoiceId: generateId() }
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (UsageEvent as any).findById(event._id)

    expect(updated?.billingStatus).toBe("billed")
    expect(updated?.invoiceId).toBeDefined()

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (UsageEvent as any).deleteOne({ _id: event._id })
  })
})
