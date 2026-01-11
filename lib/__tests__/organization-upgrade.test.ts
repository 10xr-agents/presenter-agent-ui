import { headers } from "next/headers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { ScreenAgent } from "@/lib/models/screen-agent"
import { Team } from "@/lib/models/team"
import { TeamMembership } from "@/lib/models/team-membership"
import { getOrganizationFeatureFlags, getOrganizationType, upgradeToEnterprise } from "../organization/upgrade"

// Mock dependencies
vi.mock("@/lib/db/mongoose", () => ({
  connectDB: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/lib/models/team", () => ({
  Team: {
    create: vi.fn(),
  },
}))

vi.mock("@/lib/models/team-membership", () => ({
  TeamMembership: {
    create: vi.fn(),
  },
}))

vi.mock("@/lib/models/screen-agent", () => ({
  ScreenAgent: {
    updateMany: vi.fn(),
  },
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getFullOrganization: vi.fn(),
      updateOrganization: vi.fn(),
    },
  },
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}))

describe("Organization Upgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getOrganizationType", () => {
    it("should return 'basic' for organizations without enterprise metadata", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.getFullOrganization as any).mockResolvedValue({
        data: {
          id: "org-1",
          name: "Test Org",
          metadata: null,
        },
      })

      const type = await getOrganizationType("org-1")
      expect(type).toBe("basic")
    })

    it("should return 'enterprise' for organizations with enterprise metadata", async () => {
      const metadata = JSON.stringify({
        type: "enterprise",
        upgradedAt: new Date().toISOString(),
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.getFullOrganization as any).mockResolvedValue({
        data: {
          id: "org-1",
          name: "Test Org",
          metadata,
        },
      })

      const type = await getOrganizationType("org-1")
      expect(type).toBe("enterprise")
    })
  })

  describe("upgradeToEnterprise", () => {
    it("should fail if user is not a member", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.getFullOrganization as any).mockResolvedValue({
        data: {
          id: "org-1",
          name: "Test Org",
          members: [],
        },
      })

      const result = await upgradeToEnterprise("org-1", "user-1")
      expect(result.success).toBe(false)
      expect(result.error).toContain("not a member")
    })

    it("should fail if user is not owner or admin", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.getFullOrganization as any).mockResolvedValue({
        data: {
          id: "org-1",
          name: "Test Org",
          members: [
            {
              userId: "user-1",
              role: "member",
            },
          ],
        },
      })

      const result = await upgradeToEnterprise("org-1", "user-1")
      expect(result.success).toBe(false)
      expect(result.error).toContain("Only owners and admins")
    })

    it("should fail if organization is already enterprise", async () => {
      const metadata = JSON.stringify({
        type: "enterprise",
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.getFullOrganization as any).mockResolvedValue({
        data: {
          id: "org-1",
          name: "Test Org",
          metadata,
          members: [
            {
              userId: "user-1",
              role: "owner",
            },
          ],
        },
      })

      const result = await upgradeToEnterprise("org-1", "user-1")
      expect(result.success).toBe(false)
      expect(result.error).toContain("already Enterprise")
    })

    it("should successfully upgrade organization", async () => {
      const mockTeam = {
        _id: { toString: () => "team-1" },
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.getFullOrganization as any).mockResolvedValue({
        data: {
          id: "org-1",
          name: "Test Org",
          metadata: null,
          members: [
            {
              userId: "user-1",
              role: "owner",
            },
            {
              userId: "user-2",
              role: "member",
            },
          ],
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.updateOrganization as any).mockResolvedValue({
        data: { id: "org-1" },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Team as any).create.mockResolvedValue(mockTeam)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(TeamMembership as any).create.mockResolvedValue({})

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ScreenAgent as any).updateMany.mockResolvedValue({
        modifiedCount: 5,
      })

      const result = await upgradeToEnterprise("org-1", "user-1")

      expect(result.success).toBe(true)
      expect(result.organizationId).toBe("org-1")
      expect(result.teamId).toBe("team-1")
      expect(result.membersMigrated).toBe(2)
      expect(result.agentsAssigned).toBe(5)

      // Verify team was created
      expect((Team as any).create).toHaveBeenCalledWith({
        name: "General",
        description: "Default team for all organization members",
        organizationId: "org-1",
      })

      // Verify team memberships were created
      expect((TeamMembership as any).create).toHaveBeenCalledTimes(2)
      expect((TeamMembership as any).create).toHaveBeenCalledWith({
        userId: "user-1",
        teamId: "team-1",
        teamRole: "team_admin",
        addedByUserId: "user-1",
      })
      expect((TeamMembership as any).create).toHaveBeenCalledWith({
        userId: "user-2",
        teamId: "team-1",
        teamRole: "team_member",
        addedByUserId: "user-1",
      })

      // Verify screen agents were updated
      expect((ScreenAgent as any).updateMany).toHaveBeenCalledWith(
        { organizationId: "org-1", teamId: { $exists: false } },
        { $set: { teamId: "team-1" } }
      )
    })
  })

  describe("getOrganizationFeatureFlags", () => {
    it("should return default flags for basic organizations", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.getFullOrganization as any).mockResolvedValue({
        data: {
          id: "org-1",
          name: "Test Org",
          metadata: null,
        },
      })

      const flags = await getOrganizationFeatureFlags("org-1")
      expect(flags.teamsEnabled).toBe(false)
      expect(flags.ssoEnabled).toBe(false)
    })

    it("should return enterprise flags for enterprise organizations", async () => {
      const metadata = JSON.stringify({
        type: "enterprise",
        featureFlags: {
          teamsEnabled: true,
          ssoEnabled: false,
          customBrandingEnabled: true,
          apiAccessEnabled: true,
          advancedAnalyticsEnabled: true,
          whiteLabelEmbeddingEnabled: false,
          prioritySupportEnabled: true,
          customUsageLimitsEnabled: true,
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(auth.api.getFullOrganization as any).mockResolvedValue({
        data: {
          id: "org-1",
          name: "Test Org",
          metadata,
        },
      })

      const flags = await getOrganizationFeatureFlags("org-1")
      expect(flags.teamsEnabled).toBe(true)
      expect(flags.apiAccessEnabled).toBe(true)
      expect(flags.advancedAnalyticsEnabled).toBe(true)
    })
  })
})
