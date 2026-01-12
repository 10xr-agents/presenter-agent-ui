import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { TeamMembership } from "@/lib/models/team-membership"
import { listTeams } from "@/lib/teams/manager"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDB()

    const tenantState = await getTenantState(session.user.id)
    let organizationId: string | null = null

    if (tenantState === "organization") {
      organizationId = await getActiveOrganizationId()
    }

    const userTeams: Array<{
      id: string
      name: string
      role: string
      joinedAt: string
    }> = []

    if (organizationId) {
      // Get teams from organization
      const teams = await listTeams(organizationId, session.user.id)

      // Get user's team memberships to determine roles
      for (const team of teams) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const membership = await (TeamMembership as any).findOne({
          teamId: team._id.toString(),
          userId: session.user.id,
        })

        if (membership) {
          userTeams.push({
            id: team._id.toString(),
            name: team.name,
            role: membership.teamRole === "team_admin" ? "Admin" : "Member",
            joinedAt: membership.createdAt.toISOString(),
          })
        }
      }
    }

    return NextResponse.json({ teams: userTeams })
  } catch (error: unknown) {
    console.error("Get teams error:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch teams"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
