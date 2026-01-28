import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { connectDB } from "@/lib/db/mongoose"
import { Session } from "@/lib/models"
import { auth } from "@/lib/auth"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"
import { getPusher } from "@/lib/pusher/server"

const CHANNEL_PREFIX = "private-session-"

/**
 * Resolve session from Bearer token or cookie (same as WS token).
 */
async function getSessionForPusherAuth(
  req: NextRequest
): Promise<{ userId: string; tenantId: string } | null> {
  const fromBearer = await getSessionFromRequest(req.headers)
  if (fromBearer) return fromBearer
  const fromCookie = await auth.api.getSession({ headers: await headers() })
  if (!fromCookie?.user?.id) return null
  const userId = fromCookie.user.id
  const tenantState = await getTenantState(userId)
  const tenantId =
    tenantState === "organization"
      ? (await getActiveOrganizationId()) || userId
      : userId
  return { userId, tenantId }
}

/**
 * POST /api/pusher/auth
 *
 * Sockudo/Pusher auth endpoint. Client sends form data: socket_id, channel_name.
 * Only private-session-{sessionId} channels are allowed; we verify the user owns the session.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionForPusherAuth(req)
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const formData = await req.formData()
    const socketId = formData.get("socket_id") as string | null
    const channelName = formData.get("channel_name") as string | null

    if (!socketId || !channelName) {
      return new NextResponse("Bad Request", { status: 400 })
    }

    if (!channelName.startsWith(CHANNEL_PREFIX)) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const sessionId = channelName.slice(CHANNEL_PREFIX.length)
    if (!sessionId) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    await connectDB()
    const doc = await (Session as any)
      .findOne({ sessionId, tenantId: session.tenantId })
      .select("userId")
      .lean()
      .exec()

    if (!doc || doc.userId !== session.userId) {
      return new NextResponse("Forbidden", { status: 403 })
    }

    const pusher = getPusher()
    if (!pusher) {
      return new NextResponse("Service Unavailable", { status: 503 })
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName)
    return NextResponse.json(authResponse)
  } catch (error: unknown) {
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
