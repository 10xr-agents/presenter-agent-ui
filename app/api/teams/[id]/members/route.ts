import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  addTeamMember,
  listTeamMembers,
  removeTeamMember,
  updateTeamMemberRole,
} from "@/lib/teams/manager"
import { createTeamMembershipSchema , validateRequest } from "@/lib/utils/validation"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

/**
 * GET /api/teams/[id]/members - List team members
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: teamId } = await params

  try {
    const members = await listTeamMembers(teamId)

    return NextResponse.json({ members })
  } catch (error: unknown) {
    console.error("List team members error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to list team members" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/teams/[id]/members - Add team member
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: teamId } = await params

  const body = (await req.json()) as {
    userId?: string
    teamRole?: "team_admin" | "team_member"
  }

  // Validate request body
  const validation = await validateRequest(createTeamMembershipSchema, body)
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: validation.error.issues },
      { status: 400 }
    )
  }

  const { userId, teamRole } = validation.data

  try {
    const membership = await addTeamMember(
      teamId,
      userId,
      session.user.id,
      teamRole || "team_member"
    )

    return NextResponse.json({ membership }, { status: 201 })
  } catch (error: unknown) {
    console.error("Add team member error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to add team member" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/teams/[id]/members - Remove team member
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: teamId } = await params

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId")

  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 }
    )
  }

  try {
    await removeTeamMember(teamId, userId, session.user.id)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Remove team member error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to remove team member" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/teams/[id]/members - Update team member role
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: teamId } = await params

  const body = (await req.json()) as {
    userId?: string
    teamRole?: "team_admin" | "team_member"
  }

  if (!body.userId || !body.teamRole) {
    return NextResponse.json(
      { error: "userId and teamRole are required" },
      { status: 400 }
    )
  }

  try {
    const membership = await updateTeamMemberRole(
      teamId,
      body.userId,
      body.teamRole,
      session.user.id
    )

    return NextResponse.json({ membership })
  } catch (error: unknown) {
    console.error("Update team member role error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update team member role" },
      { status: 500 }
    )
  }
}
