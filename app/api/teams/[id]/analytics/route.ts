import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getTeamAnalytics } from "@/lib/teams/manager"

/**
 * GET /api/teams/[id]/analytics - Get team analytics
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
    const analytics = await getTeamAnalytics(teamId)

    return NextResponse.json({ analytics })
  } catch (error: unknown) {
    console.error("Get team analytics error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to get team analytics" },
      { status: 500 }
    )
  }
}
