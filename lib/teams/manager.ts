import { connectDB } from "@/lib/db/mongoose"
import type { IScreenAgent } from "@/lib/models/screen-agent"
import { ScreenAgent } from "@/lib/models/screen-agent"
import type { ITeam } from "@/lib/models/team"
import { Team } from "@/lib/models/team"
import type { ITeamMembership } from "@/lib/models/team-membership"
import { TeamMembership } from "@/lib/models/team-membership"
import { getOrganizationFeatureFlags } from "@/lib/organization/upgrade"

export interface CreateTeamData {
  name: string
  description?: string
  organizationId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: Record<string, any>
}

export interface UpdateTeamData {
  name?: string
  description?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings?: Record<string, any>
}

/**
 * Check if organization has teams enabled (Enterprise feature)
 */
export async function isTeamsEnabled(organizationId: string): Promise<boolean> {
  const featureFlags = await getOrganizationFeatureFlags(organizationId)
  return featureFlags.teamsEnabled
}

/**
 * Check if user has permission to manage teams
 */
export async function canManageTeams(
  organizationId: string,
  userId: string
): Promise<boolean> {
  // Only Enterprise organizations can have teams
  const teamsEnabled = await isTeamsEnabled(organizationId)
  if (!teamsEnabled) {
    return false
  }

  // TODO: Check if user is owner or admin of organization
  // For now, assume user has permission if teams are enabled
  // This should be enhanced with actual permission checks
  return true
}

/**
 * Create a new team
 */
export async function createTeam(
  data: CreateTeamData,
  userId: string
): Promise<ITeam> {
  await connectDB()

  // Check if teams are enabled
  const teamsEnabled = await isTeamsEnabled(data.organizationId)
  if (!teamsEnabled) {
    throw new Error("Teams are not enabled for this organization")
  }

  // Check permissions
  const canManage = await canManageTeams(data.organizationId, userId)
  if (!canManage) {
    throw new Error("You don't have permission to create teams")
  }

  // Create team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const team = await (Team as any).create({
    name: data.name,
    description: data.description,
    organizationId: data.organizationId,
    settings: data.settings || {},
  })

  return team
}

/**
 * Get team by ID
 */
export async function getTeamById(teamId: string): Promise<ITeam | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const team = await (Team as any).findById(teamId)
  return team
}

/**
 * Get team by ID with permission check
 */
export async function getTeamByIdWithPermission(
  teamId: string,
  userId: string
): Promise<ITeam | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const team = await (Team as any).findById(teamId)
  if (!team) {
    return null
  }

  // Check if user is member of the team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = await (TeamMembership as any).findOne({
    teamId,
    userId,
  })

  if (!membership) {
    // Check if user is owner/admin of organization
    const canManage = await canManageTeams(team.organizationId, userId)
    if (!canManage) {
      return null // User doesn't have access
    }
  }

  return team
}

/**
 * List teams for an organization
 */
export async function listTeams(
  organizationId: string,
  userId: string
): Promise<ITeam[]> {
  await connectDB()

  // Check if teams are enabled
  const teamsEnabled = await isTeamsEnabled(organizationId)
  if (!teamsEnabled) {
    return []
  }

  // Get all teams for the organization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teams = await (Team as any).find({ organizationId }).sort({
    createdAt: -1,
  })

  return teams
}

/**
 * Update team
 */
export async function updateTeam(
  teamId: string,
  data: UpdateTeamData,
  userId: string
): Promise<ITeam> {
  await connectDB()

  // Get team and verify permissions
  const team = await getTeamByIdWithPermission(teamId, userId)
  if (!team) {
    throw new Error("Team not found or you don't have permission")
  }

  // Check if user is team admin or org admin/owner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = await (TeamMembership as any).findOne({
    teamId,
    userId,
  })

  const canManage = await canManageTeams(team.organizationId, userId)
  const isTeamAdmin = membership?.teamRole === "team_admin"

  if (!canManage && !isTeamAdmin) {
    throw new Error("You don't have permission to update this team")
  }

  // Update team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedTeam = await (Team as any).findByIdAndUpdate(
    teamId,
    { $set: data },
    { new: true }
  )

  if (!updatedTeam) {
    throw new Error("Failed to update team")
  }

  return updatedTeam
}

/**
 * Delete team
 */
export async function deleteTeam(
  teamId: string,
  userId: string
): Promise<void> {
  await connectDB()

  // Get team and verify permissions
  const team = await getTeamByIdWithPermission(teamId, userId)
  if (!team) {
    throw new Error("Team not found or you don't have permission")
  }

  // Only org admins/owners can delete teams
  const canManage = await canManageTeams(team.organizationId, userId)
  if (!canManage) {
    throw new Error("You don't have permission to delete teams")
  }

  // Check if team has any Screen Agents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentCount = await (ScreenAgent as any).countDocuments({ teamId })
  if (agentCount > 0) {
    throw new Error(
      "Cannot delete team with Screen Agents. Please reassign agents first."
    )
  }

  // Delete team memberships
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (TeamMembership as any).deleteMany({ teamId })

  // Delete team
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (Team as any).findByIdAndDelete(teamId)
}

/**
 * Add member to team
 */
export async function addTeamMember(
  teamId: string,
  userId: string,
  addedByUserId: string,
  teamRole: "team_admin" | "team_member" = "team_member"
): Promise<ITeamMembership> {
  await connectDB()

  // Get team and verify permissions
  const team = await getTeamByIdWithPermission(teamId, addedByUserId)
  if (!team) {
    throw new Error("Team not found or you don't have permission")
  }

  // Check if user has permission to add members
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = await (TeamMembership as any).findOne({
    teamId,
    userId: addedByUserId,
  })

  const canManage = await canManageTeams(team.organizationId, addedByUserId)
  const isTeamAdmin = membership?.teamRole === "team_admin"

  if (!canManage && !isTeamAdmin) {
    throw new Error("You don't have permission to add team members")
  }

  // Check if member already exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (TeamMembership as any).findOne({ teamId, userId })
  if (existing) {
    throw new Error("User is already a member of this team")
  }

  // Create team membership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamMembership = await (TeamMembership as any).create({
    teamId,
    userId,
    teamRole,
    addedByUserId,
  })

  return teamMembership
}

/**
 * Remove member from team
 */
export async function removeTeamMember(
  teamId: string,
  userId: string,
  removedByUserId: string
): Promise<void> {
  await connectDB()

  // Get team and verify permissions
  const team = await getTeamByIdWithPermission(teamId, removedByUserId)
  if (!team) {
    throw new Error("Team not found or you don't have permission")
  }

  // Check if user has permission to remove members
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = await (TeamMembership as any).findOne({
    teamId,
    userId: removedByUserId,
  })

  const canManage = await canManageTeams(team.organizationId, removedByUserId)
  const isTeamAdmin = membership?.teamRole === "team_admin"

  if (!canManage && !isTeamAdmin) {
    throw new Error("You don't have permission to remove team members")
  }

  // Delete team membership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (TeamMembership as any).deleteOne({ teamId, userId })
}

/**
 * List team members
 */
export async function listTeamMembers(teamId: string): Promise<
  Array<{
    userId: string
    teamRole: "team_admin" | "team_member"
    addedByUserId: string
    createdAt: Date
  }>
> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberships = await (TeamMembership as any)
    .find({ teamId })
    .sort({ createdAt: -1 })

  return memberships.map((m: ITeamMembership) => ({
    userId: m.userId,
    teamRole: m.teamRole,
    addedByUserId: m.addedByUserId,
    createdAt: m.createdAt,
  }))
}

/**
 * Update team member role
 */
export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  newRole: "team_admin" | "team_member",
  updatedByUserId: string
): Promise<ITeamMembership> {
  await connectDB()

  // Get team and verify permissions
  const team = await getTeamByIdWithPermission(teamId, updatedByUserId)
  if (!team) {
    throw new Error("Team not found or you don't have permission")
  }

  // Check if user has permission to update roles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membership = await (TeamMembership as any).findOne({
    teamId,
    userId: updatedByUserId,
  })

  const canManage = await canManageTeams(team.organizationId, updatedByUserId)
  const isTeamAdmin = membership?.teamRole === "team_admin"

  if (!canManage && !isTeamAdmin) {
    throw new Error("You don't have permission to update team member roles")
  }

  // Update team membership
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatedMembership = await (TeamMembership as any).findOneAndUpdate(
    { teamId, userId },
    { $set: { teamRole: newRole } },
    { new: true }
  )

  if (!updatedMembership) {
    throw new Error("Team membership not found")
  }

  return updatedMembership
}

/**
 * Get team analytics
 */
export async function getTeamAnalytics(teamId: string): Promise<{
  memberCount: number
  agentCount: number
  totalPresentationCount: number
  totalViewerCount: number
  totalMinutesConsumed: number
}> {
  await connectDB()

  // Get member count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberCount = await (TeamMembership as any).countDocuments({ teamId })

  // Get agent count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = await (ScreenAgent as any).find({ teamId })

  const agentCount = agents.length

  // Aggregate analytics from agents
  const totalPresentationCount = agents.reduce(
    (sum: number, agent: IScreenAgent) =>
      sum + (agent.totalPresentationCount || 0),
    0
  )

  const totalViewerCount = agents.reduce(
    (sum: number, agent: IScreenAgent) => sum + (agent.totalViewerCount || 0),
    0
  )

  const totalMinutesConsumed = agents.reduce(
    (sum: number, agent: IScreenAgent) =>
      sum + (agent.totalMinutesConsumed || 0),
    0
  )

  return {
    memberCount,
    agentCount,
    totalPresentationCount,
    totalViewerCount,
    totalMinutesConsumed,
  }
}
