import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  deleteTeam,
  getTeamByIdWithPermission,
  updateTeam,
} from "@/lib/teams/manager"
import { createTeamSchema , validateRequest } from "@/lib/utils/validation"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

/**
 * GET /api/teams/[id] - Get team details
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
    const team = await getTeamByIdWithPermission(teamId, session.user.id)

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 })
    }

    return NextResponse.json({ team })
  } catch (error: unknown) {
    console.error("Get team error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to get team" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/teams/[id] - Update team
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
    name?: string
    description?: string
  }

  // Validate request body (partial update)
  const updateSchema = createTeamSchema.partial()
  const validation = await validateRequest(updateSchema, body)
  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: validation.error.issues },
      { status: 400 }
    )
  }

  try {
    const team = await updateTeam(teamId, validation.data, session.user.id)

    return NextResponse.json({ team })
  } catch (error: unknown) {
    console.error("Update team error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update team" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/teams/[id] - Delete team
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

  try {
    await deleteTeam(teamId, session.user.id)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Delete team error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to delete team" },
      { status: 500 }
    )
  }
}
