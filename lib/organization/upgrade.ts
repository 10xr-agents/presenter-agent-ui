import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { ScreenAgent } from "@/lib/models/screen-agent"
import { Team } from "@/lib/models/team"
import { TeamMembership } from "@/lib/models/team-membership"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

export type OrganizationType = "basic" | "enterprise"

export interface OrganizationFeatureFlags {
  teamsEnabled: boolean
  ssoEnabled: boolean
  customBrandingEnabled: boolean
  apiAccessEnabled: boolean
  advancedAnalyticsEnabled: boolean
  whiteLabelEmbeddingEnabled: boolean
  prioritySupportEnabled: boolean
  customUsageLimitsEnabled: boolean
}

export interface UpgradeResult {
  success: boolean
  organizationId: string
  teamId?: string
  membersMigrated: number
  agentsAssigned: number
  error?: string
}

/**
 * Get organization type from metadata
 */
export async function getOrganizationType(organizationId: string): Promise<OrganizationType> {
  try {
    const orgResult = await authApi.getFullOrganization({
      headers: await headers(),
      query: {
        organizationId: organizationId,
      },
    })

    if (orgResult.error || !orgResult.data) {
      return "basic" // Default to basic if not found
    }

    // Check metadata for organization type
    // Better Auth stores metadata as a string, so we need to parse it
    try {
      if (orgResult.data.metadata) {
        const metadata = typeof orgResult.data.metadata === "string"
          ? JSON.parse(orgResult.data.metadata)
          : orgResult.data.metadata
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (metadata && (metadata as any).type === "enterprise") {
          return "enterprise"
        }
      }
    } catch (error: unknown) {
      // If metadata parsing fails, assume basic
      console.error("Error parsing organization metadata:", error)
    }

    return "basic"
  } catch (error: unknown) {
    console.error("Error getting organization type:", error)
    return "basic"
  }
}

/**
 * Upgrade organization from Basic to Enterprise
 */
export async function upgradeToEnterprise(
  organizationId: string,
  userId: string
): Promise<UpgradeResult> {
  await connectDB()

  try {
    // 1. Verify user has permission (must be owner or admin)
    const orgResult = await authApi.getFullOrganization({
      headers: await headers(),
      query: {
        organizationId: organizationId,
      },
    })

    if (orgResult.error || !orgResult.data) {
      return {
        success: false,
        organizationId,
        membersMigrated: 0,
        agentsAssigned: 0,
        error: "Failed to verify organization access",
      }
    }

    // Check if user is owner or admin
    const currentMember = orgResult.data.members?.find(
      (m: { userId: string; role?: string }) => m.userId === userId
    )
    if (!currentMember) {
      return {
        success: false,
        organizationId,
        membersMigrated: 0,
        agentsAssigned: 0,
        error: "You are not a member of this organization",
      }
    }

    const role = currentMember.role || ""
    if (!role.includes("owner") && !role.includes("admin")) {
      return {
        success: false,
        organizationId,
        membersMigrated: 0,
        agentsAssigned: 0,
        error: "Only owners and admins can upgrade organizations",
      }
    }

    // 2. Check if already Enterprise
    const currentType = await getOrganizationType(organizationId)
    if (currentType === "enterprise") {
      return {
        success: false,
        organizationId,
        membersMigrated: 0,
        agentsAssigned: 0,
        error: "Organization is already Enterprise",
      }
    }

    // 3. Update organization metadata to mark as Enterprise
    // Better Auth stores metadata as a string, so we need to stringify it
    const metadata = {
      type: "enterprise",
      upgradedAt: new Date().toISOString(),
      upgradedBy: userId,
      featureFlags: {
        teamsEnabled: true,
        ssoEnabled: false, // Requires additional setup
        customBrandingEnabled: true,
        apiAccessEnabled: true,
        advancedAnalyticsEnabled: true,
        whiteLabelEmbeddingEnabled: false, // Requires additional setup
        prioritySupportEnabled: true,
        customUsageLimitsEnabled: true,
      },
    }

    const updateResult = await authApi.updateOrganization({
      headers: await headers(),
      body: {
        organizationId: organizationId,
        data: {
          metadata: JSON.stringify(metadata),
        },
      },
    })

    if (updateResult.error) {
      return {
        success: false,
        organizationId,
        membersMigrated: 0,
        agentsAssigned: 0,
        error: updateResult.error.message || "Failed to update organization",
      }
    }

    // 4. Create default "General" team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generalTeam = await (Team as any).create({
      name: "General",
      description: "Default team for all organization members",
      organizationId,
    })

    // 5. Get all organization members and migrate them to the General team
    // Use the orgResult we already have from step 1
    let membersMigrated = 0
    if (orgResult.data.members && Array.isArray(orgResult.data.members)) {
      for (const member of orgResult.data.members) {
        try {
          // Create team membership for each member
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (TeamMembership as any).create({
            userId: member.userId,
            teamId: generalTeam._id.toString(),
            teamRole: member.role?.includes("owner") || member.role?.includes("admin") 
              ? "team_admin" 
              : "team_member",
            addedByUserId: userId,
          })
          membersMigrated++
        } catch (error: unknown) {
          // Skip if membership already exists
          const errorMessage = error instanceof Error ? error.message : String(error)
          if (!errorMessage.includes("duplicate") && !errorMessage.includes("E11000")) {
            console.error(`Failed to migrate member ${member.userId}:`, error)
          }
        }
      }
    }

    // 6. Assign all existing Screen Agents to the General team
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateResult2 = await (ScreenAgent as any).updateMany(
      { organizationId, teamId: { $exists: false } },
      { $set: { teamId: generalTeam._id.toString() } }
    )

    const agentsAssigned = updateResult2.modifiedCount || 0

    return {
      success: true,
      organizationId,
      teamId: generalTeam._id.toString(),
      membersMigrated,
      agentsAssigned,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Upgrade error:", error)
    return {
      success: false,
      organizationId,
      membersMigrated: 0,
      agentsAssigned: 0,
      error: errorMessage,
    }
  }
}

/**
 * Get feature flags for an organization
 */
export async function getOrganizationFeatureFlags(
  organizationId: string
): Promise<OrganizationFeatureFlags> {
  try {
    const orgResult = await authApi.getFullOrganization({
      headers: await headers(),
      query: {
        organizationId: organizationId,
      },
    })

    if (orgResult.error || !orgResult.data) {
      // Return default flags for basic organizations
      return {
        teamsEnabled: false,
        ssoEnabled: false,
        customBrandingEnabled: false,
        apiAccessEnabled: false,
        advancedAnalyticsEnabled: false,
        whiteLabelEmbeddingEnabled: false,
        prioritySupportEnabled: false,
        customUsageLimitsEnabled: false,
      }
    }

    // Better Auth stores metadata as a string, so we need to parse it
    try {
      if (orgResult.data.metadata) {
        const metadata = typeof orgResult.data.metadata === "string"
          ? JSON.parse(orgResult.data.metadata)
          : orgResult.data.metadata
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (metadata && (metadata as any).featureFlags) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (metadata as any).featureFlags as OrganizationFeatureFlags
        }
      }
    } catch (error: unknown) {
      // If metadata parsing fails, return default flags
      console.error("Error parsing organization metadata:", error)
    }

    // Default flags
    return {
      teamsEnabled: false,
      ssoEnabled: false,
      customBrandingEnabled: false,
      apiAccessEnabled: false,
      advancedAnalyticsEnabled: false,
      whiteLabelEmbeddingEnabled: false,
      prioritySupportEnabled: false,
      customUsageLimitsEnabled: false,
    }
  } catch (error: unknown) {
    console.error("Error getting feature flags:", error)
    return {
      teamsEnabled: false,
      ssoEnabled: false,
      customBrandingEnabled: false,
      apiAccessEnabled: false,
      advancedAnalyticsEnabled: false,
      whiteLabelEmbeddingEnabled: false,
      prioritySupportEnabled: false,
      customUsageLimitsEnabled: false,
    }
  }
}
