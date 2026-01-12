import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"

/**
 * POST /api/organization/invite - Invite a member to an organization
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    organizationId: string
    email: string
    role?: "owner" | "admin" | "member"
  }

  const { organizationId, email, role = "member" } = body

  if (!organizationId || !email) {
    return NextResponse.json(
      { error: "Organization ID and email are required" },
      { status: 400 }
    )
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any

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

    // Check if user is owner or admin
    const currentMember = orgResult.data.members?.find(
      (m: { userId: string }) => m.userId === session.user.id
    )
    if (!currentMember || (currentMember.role !== "owner" && currentMember.role !== "admin")) {
      return NextResponse.json(
        { error: "You don't have permission to invite members" },
        { status: 403 }
      )
    }

    // Invite member using Better Auth
    const inviteResult = await authApi.inviteMember({
      headers: await headers(),
      body: {
        organizationId: organizationId,
        email: email,
        role: role,
      },
    })

    if (inviteResult.error) {
      return NextResponse.json(
        { error: inviteResult.error.message || "Failed to invite member" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      invitation: inviteResult.data,
    })
  } catch (error: unknown) {
    console.error("Error inviting member:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to invite member" },
      { status: 500 }
    )
  }
}
