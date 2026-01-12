import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"

/**
 * GET /api/user/profile - Get user profile
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error: unknown) {
    console.error("Error fetching user profile:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to fetch user profile" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/user/profile - Update user profile
 */
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    name?: string
    image?: string
  }

  try {
    // Update user using Better Auth's updateUser method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any

    const result = await authApi.updateUser({
      headers: await headers(),
      body: {
        name: body.name,
        image: body.image,
      },
    })

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || "Failed to update profile" },
        { status: 400 }
      )
    }

    return NextResponse.json({ user: result.data })
  } catch (error: unknown) {
    console.error("Error updating user profile:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to update profile" },
      { status: 500 }
    )
  }
}
