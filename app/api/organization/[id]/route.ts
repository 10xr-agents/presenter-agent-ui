import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"

/**
 * PATCH /api/organization/[id] - Update organization
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = (await req.json()) as {
    name?: string
    slug?: string
    metadata?: string
  }

  try {
    // Verify user has access to this organization
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any

    const orgResult = await authApi.getFullOrganization({
      headers: await headers(),
      query: {
        organizationId: id,
      },
    })

    if (orgResult.error || !orgResult.data) {
      return NextResponse.json(
        { error: "You don't have access to this organization" },
        { status: 403 }
      )
    }

    // Check if user is owner or admin
    const member = orgResult.data.members?.find(
      (m: { userId: string }) => m.userId === session.user.id
    )
    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return NextResponse.json(
        { error: "You don't have permission to update this organization" },
        { status: 403 }
      )
    }

    // Update organization
    const organization = await prisma.organization.update({
      where: { id },
      data: {
        name: body.name,
        slug: body.slug,
        metadata: body.metadata,
      },
    })

    return NextResponse.json({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        createdAt: organization.createdAt,
        metadata: organization.metadata,
      },
    })
  } catch (error: unknown) {
    console.error("Error updating organization:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update organization" },
      { status: 500 }
    )
  }
}
