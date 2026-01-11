import { beforeAll, describe, expect, it } from "vitest"
import { connectDB } from "../db/mongoose"
import { TeamMembership } from "../models/team-membership"

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

describe("Team Membership Model", () => {
  beforeAll(async () => {
    await connectDB()
  })

  it("should create a team membership with required fields", async () => {
    const membershipData = {
      userId: generateId(),
      teamId: generateId(),
      teamRole: "team_member" as const,
      addedByUserId: generateId(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membership = await (TeamMembership as any).create(membershipData)

    expect(membership).toBeDefined()
    expect(membership.teamRole).toBe("team_member")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (TeamMembership as any).deleteOne({ _id: membership._id })
  })

  it("should create a team admin membership", async () => {
    const membershipData = {
      userId: generateId(),
      teamId: generateId(),
      teamRole: "team_admin" as const,
      addedByUserId: generateId(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membership = await (TeamMembership as any).create(membershipData)

    expect(membership.teamRole).toBe("team_admin")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (TeamMembership as any).deleteOne({ _id: membership._id })
  })

  it("should find memberships by team", async () => {
    const teamId = generateId()
    const membershipData = {
      userId: generateId(),
      teamId,
      teamRole: "team_member" as const,
      addedByUserId: generateId(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membership = await (TeamMembership as any).create(membershipData)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const foundMemberships = await (TeamMembership as any).find({ teamId })

    expect(foundMemberships.length).toBeGreaterThan(0)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (TeamMembership as any).deleteOne({ _id: membership._id })
  })
})
