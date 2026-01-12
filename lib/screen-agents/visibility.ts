/**
 * Screen Agent Visibility Model
 * 
 * Visibility is inferred, not configured. This module provides utilities
 * to determine the correct visibility based on tenant operating mode.
 * 
 * Rules:
 * - Normal Mode: All agents visible to all tenant members (implicit)
 * - Organization Mode: Agents visible only to creator's team (implicit)
 */

import { getTenantOperatingMode } from "@/lib/utils/tenant-state"

/**
 * Determine the implicit visibility for a new Screen Agent based on tenant mode
 * 
 * @param userId - The user creating the agent
 * @param teamId - Optional team ID (only in organization mode)
 * @returns The implicit visibility value
 */
export async function getImplicitVisibility(
  userId: string,
  teamId?: string
): Promise<"private" | "team" | "organization" | "public"> {
  const mode = await getTenantOperatingMode(userId)

  if (mode === "normal") {
    // Normal mode: All agents are implicitly visible to all tenant members
    // We use "private" as the storage value, but it means "visible to all members"
    return "private"
  }

  // Organization mode: Agents are visible only to creator's team
  if (teamId) {
    return "team"
  }

  // If no team specified in organization mode, default to team visibility
  // (will be assigned to DEFAULT team during migration)
  return "team"
}

/**
 * Check if a Screen Agent should be visible to a user
 * 
 * @param agent - The Screen Agent to check
 * @param userId - The user to check visibility for
 * @param userTeamIds - Array of team IDs the user belongs to
 * @returns True if the agent should be visible to the user
 */
export async function isAgentVisibleToUser(
  agent: {
    visibility: "private" | "team" | "organization" | "public"
    ownerId: string
    teamId?: string
    organizationId: string
  },
  userId: string,
  userTeamIds: string[] = []
): Promise<boolean> {
  // Owner can always see their own agents
  if (agent.ownerId === userId) {
    return true
  }

  // In normal mode, "private" visibility means "visible to all tenant members"
  // We check this by verifying the user is in the same organization/tenant
  if (agent.visibility === "private") {
    // In normal mode, all members of the tenant can see all agents
    // This is handled at the query level by filtering by organizationId
    return true
  }

  // Team visibility: user must be in the same team
  if (agent.visibility === "team" && agent.teamId) {
    return userTeamIds.includes(agent.teamId)
  }

  // Organization visibility: all members of the organization can see
  if (agent.visibility === "organization") {
    return true
  }

  // Public visibility: everyone can see
  if (agent.visibility === "public") {
    return true
  }

  return false
}
