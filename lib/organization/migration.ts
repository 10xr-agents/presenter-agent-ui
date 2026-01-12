/**
 * Organization Migration Utilities
 * 
 * Handles the automatic, lossless transition from Normal Mode to Organization Mode.
 * 
 * Migration Process:
 * 1. Create DEFAULT team
 * 2. Migrate all existing members to DEFAULT team
 * 3. Assign appropriate roles
 * 4. Re-scope all Screen Agents to DEFAULT team
 */

import { headers } from "next/headers"
import { connectDB } from "@/lib/db/mongoose"
import { auth } from "@/lib/auth"
import { ScreenAgent } from "@/lib/models/screen-agent"
import { Team } from "@/lib/models/team"
import { TeamMembership } from "@/lib/models/team-membership"
import { createTeam, addTeamMember } from "@/lib/teams/manager"

export interface MigrationResult {
  success: boolean
  defaultTeamId?: string
  membersMigrated: number
  agentsMigrated: number
  errors?: string[]
}

/**
 * Migrate tenant from Normal Mode to Organization Mode
 * 
 * This function:
 * 1. Creates a DEFAULT team
 * 2. Migrates all organization members to the DEFAULT team
 * 3. Assigns roles (owner/admin → team admin)
 * 4. Re-scopes all Screen Agents to the DEFAULT team
 * 
 * @param organizationId - The organization ID to migrate
 * @param userId - The user initiating the migration (must be owner/admin)
 * @returns Migration result with details
 */
export async function migrateToOrganizationMode(
  organizationId: string,
  userId: string
): Promise<MigrationResult> {
  await connectDB()

  const errors: string[] = []
  let defaultTeamId: string | undefined
  let membersMigrated = 0
  let agentsMigrated = 0

  try {
    // Verify user has permission (must be owner or admin)
    // Get user role in the organization
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any
    const orgResult = await authApi.getFullOrganization({
      headers: await headers(),
      query: { organizationId },
    })

    if (!orgResult.data?.members) {
      throw new Error("Failed to retrieve organization members")
    }

    const currentMember = orgResult.data.members.find(
      (m: { userId: string }) => m.userId === userId
    )
    const userRole = (currentMember?.role as string) || ""

    if (userRole !== "owner" && userRole !== "admin") {
      throw new Error("Only owners and admins can initiate migration")
    }

    // Step 1: Create DEFAULT team
    try {
      // Check if DEFAULT team already exists
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingTeam = await (Team as any).findOne({
        organizationId,
        name: "DEFAULT",
      })

      if (existingTeam) {
        defaultTeamId = existingTeam._id.toString()
      } else {
        const defaultTeam = await createTeam(
          {
            name: "DEFAULT",
            description: "Default team created during organization migration. All existing members and agents have been migrated here.",
            organizationId,
          },
          userId
        )
        defaultTeamId = defaultTeam._id.toString()
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create DEFAULT team"
      errors.push(message)
      throw error
    }

    // Step 2: Get all organization members
    const members = orgResult.data.members

    // Step 3: Migrate members to DEFAULT team
    for (const member of members) {
      try {
        // Check if member already in team
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingMembership = await (TeamMembership as any).findOne({
          teamId: defaultTeamId,
          userId: member.userId,
        })

        if (!existingMembership) {
          // Determine team role based on organization role
          // Owner/Admin → team_admin, others → team_member
          const teamRole =
            member.role === "owner" || member.role === "admin" ? "team_admin" : "team_member"

          await addTeamMember(defaultTeamId!, member.userId, userId, teamRole)
          membersMigrated++
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? `Failed to migrate member ${member.userId}: ${error.message}`
            : `Failed to migrate member ${member.userId}`
        errors.push(message)
        // Continue with other members
      }
    }

    // Step 4: Re-scope all Screen Agents to DEFAULT team
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateResult = await (ScreenAgent as any).updateMany(
        {
          organizationId,
          // Only update agents that don't already have a team assigned
          $or: [{ teamId: { $exists: false } }, { teamId: null }],
        },
        {
          $set: {
            teamId: defaultTeamId,
            // Update visibility to "team" for organization mode
            visibility: "team",
          },
        }
      )

      agentsMigrated = updateResult.modifiedCount || 0
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? `Failed to migrate agents: ${error.message}`
          : "Failed to migrate agents"
      errors.push(message)
    }

    return {
      success: errors.length === 0,
      defaultTeamId,
      membersMigrated,
      agentsMigrated,
      errors: errors.length > 0 ? errors : undefined,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Migration failed"
    errors.push(message)
    return {
      success: false,
      membersMigrated,
      agentsMigrated,
      errors,
    }
  }
}
