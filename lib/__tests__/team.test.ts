import { beforeAll, describe, expect, it } from "vitest"
import { connectDB } from "../db/mongoose"
import { Team } from "../models/team"

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

describe("Team Model", () => {
  beforeAll(async () => {
    await connectDB()
  })

  it("should create a team with required fields", async () => {
    const teamData = {
      name: "Test Team",
      organizationId: generateId(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = await (Team as any).create(teamData)

    expect(team).toBeDefined()
    expect(team.name).toBe("Test Team")

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Team as any).deleteOne({ _id: team._id })
  })

  it("should find teams by organization", async () => {
    const orgId = generateId()
    const teamData = {
      name: "Org Team",
      organizationId: orgId,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = await (Team as any).create(teamData)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const foundTeams = await (Team as any).find({ organizationId: orgId })

    expect(foundTeams.length).toBeGreaterThan(0)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Team as any).deleteOne({ _id: team._id })
  })

  it("should store team settings", async () => {
    const teamData = {
      name: "Settings Team",
      organizationId: generateId(),
      settings: {
        customSetting: "value",
        anotherSetting: 123,
      },
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = await (Team as any).create(teamData)

    expect(team.settings?.customSetting).toBe("value")
    expect(team.settings?.anotherSetting).toBe(123)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (Team as any).deleteOne({ _id: team._id })
  })
})
