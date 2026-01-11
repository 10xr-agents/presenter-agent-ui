import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { createTeam, listTeams } from "@/lib/teams/manager"
import { createTeamSchema , validateRequest } from "@/lib/utils/validation"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

/**
 * GET /api/teams - List teams for organization
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId")

  if (!organizationId) {
    return NextResponse.json(
      { error: "Organization ID is required" },
      { status: 400 }
    )
  }

  try {
    // Verify user has access to this organization
    const orgResult = await authApi.getFullOrganization({
      headers: await headers(),
      query: {
        organizationId: organizationId,
      },
    })

    if (orgResult.error || !orgResult.data) {
      return NextResponse.json(
        { error: "You don't have access to this organization" },
        { status: 403 }
      )
    }

    // Check if user is a member
    const isMember = orgResult.data.members?.some(
      (m: { userId: string }) => m.userId === session.user.id
    )
    if (!isMember) {
      return NextResponse.json(
        { error: "You don't have access to this organization" },
        { status: 403 }
      )
    }

    const teams = await listTeams(organizationId, session.user.id)

    return NextResponse.json({ teams })
  } catch (error: unknown) {
    console.error("List teams error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to list teams" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/teams - Create a new team
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    name?: string
    description?: string
    organizationId?: string
  }

  // Validate request body
  const validation = await validateRequest(createTeamSchema, body)
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: validation.error.issues },
      { status: 400 }
    )
  }

  const { name, description, organizationId } = validation.data

  try {
    // Verify user has access to this organization
    const orgResult = await authApi.getFullOrganization({
      headers: await headers(),
      query: {
        organizationId: organizationId,
      },
    })

    if (orgResult.error || !orgResult.data) {
      return NextResponse.json(
        { error: "You don't have access to this organization" },
        { status: 403 }
      )
    }

    // Check if user is a member
    const isMember = orgResult.data.members?.some(
      (m: { userId: string }) => m.userId === session.user.id
    )
    if (!isMember) {
      return NextResponse.json(
        { error: "You don't have access to this organization" },
        { status: 403 }
      )
    }

    // Check if user is owner or admin
    const currentMember = orgResult.data.members?.find(
      (m: { userId: string; role?: string }) => m.userId === session.user.id
    )
    const role = currentMember?.role || ""
    if (!role.includes("owner") && !role.includes("admin")) {
      return NextResponse.json(
        { error: "Only owners and admins can create teams" },
        { status: 403 }
      )
    }

    const team = await createTeam(
      {
        name,
        description,
        organizationId,
      },
      session.user.id
    )

    return NextResponse.json({ team }, { status: 201 })
  } catch (error: unknown) {
    console.error("Create team error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to create team" },
      { status: 500 }
    )
  }
}
