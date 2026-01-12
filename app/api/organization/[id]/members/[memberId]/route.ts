import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { checkUserPermission } from "@/lib/utils/user-role"

/**
 * PATCH /api/organization/[id]/members/[memberId] - Update member role
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: organizationId, memberId } = await params
  const body = (await req.json()) as {
    role?: "owner" | "admin" | "member" | "viewer"
  }

  try {
    // Check permission using refined role system
    const canManageMembers = await checkUserPermission(
      organizationId,
      "organization",
      "manage_members"
    )

    if (!canManageMembers) {
      return NextResponse.json(
        { error: "You don't have permission to manage members" },
        { status: 403 }
      )
    }

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

    // Update member role
    const updateResult = await authApi.updateMember({
      headers: await headers(),
      body: {
        organizationId: organizationId,
        userId: memberId,
        role: body.role,
      },
    })

    if (updateResult.error) {
      return NextResponse.json(
        { error: updateResult.error.message || "Failed to update member role" },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, member: updateResult.data })
  } catch (error: unknown) {
    console.error("Error updating member role:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update member role" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/organization/[id]/members/[memberId] - Remove member from organization
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: organizationId, memberId } = await params

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

    // Check permission using refined role system
    const canManageMembers = await checkUserPermission(
      organizationId,
      "organization",
      "manage_members"
    )

    if (!canManageMembers) {
      return NextResponse.json(
        { error: "You don't have permission to remove members" },
        { status: 403 }
      )
    }

    // Prevent removing the last owner
    const owners = orgResult.data.members?.filter(
      (m: { role: string }) => m.role === "owner"
    )
    const memberToRemove = orgResult.data.members?.find(
      (m: { userId: string }) => m.userId === memberId
    )
    if (memberToRemove?.role === "owner" && owners && owners.length === 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner of the organization" },
        { status: 400 }
      )
    }

    // Remove member
    const removeResult = await authApi.removeMember({
      headers: await headers(),
      body: {
        organizationId: organizationId,
        userId: memberId,
      },
    })

    if (removeResult.error) {
      return NextResponse.json(
        { error: removeResult.error.message || "Failed to remove member" },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("Error removing member:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to remove member" },
      { status: 500 }
    )
  }
}
