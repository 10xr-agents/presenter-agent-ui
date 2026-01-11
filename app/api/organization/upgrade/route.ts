import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrganizationType, upgradeToEnterprise } from "@/lib/organization/upgrade"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    organizationId?: string
  }

  const { organizationId } = body

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

    // Check current organization type
    const currentType = await getOrganizationType(organizationId)
    if (currentType === "enterprise") {
      return NextResponse.json(
        { error: "Organization is already Enterprise" },
        { status: 400 }
      )
    }

    // Perform upgrade
    const result = await upgradeToEnterprise(organizationId, session.user.id)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to upgrade organization" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      organizationId: result.organizationId,
      teamId: result.teamId,
      membersMigrated: result.membersMigrated,
      agentsAssigned: result.agentsAssigned,
    })
  } catch (error: unknown) {
    console.error("Organization upgrade error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to upgrade organization" },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to check organization type and upgrade eligibility
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

    const organizationType = await getOrganizationType(organizationId)
    const canUpgrade = organizationType === "basic"

    return NextResponse.json({
      organizationId,
      type: organizationType,
      canUpgrade,
    })
  } catch (error: unknown) {
    console.error("Error checking organization type:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to check organization type" },
      { status: 500 }
    )
  }
}
