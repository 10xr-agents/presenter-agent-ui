import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { Session } from "@/lib/models"
import { getPusher } from "@/lib/pusher/server"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

/**
 * Pusher/Sockudo private channel prefix. We use private-session-{sessionId} because:
 * - Pusher private channels require server-side auth; presence/public channels don't fit our model.
 * - Only the session owner should subscribe (verified by Session lookup + userId match).
 * - There is no public session channel for message sync; all real-time session data is private.
 */
const CHANNEL_PREFIX = "private-session-"
const isDev = process.env.NODE_ENV === "development"

function forbidden(code: string, message?: string) {
  const body = isDev ? { code, message: message ?? code } : undefined
  return NextResponse.json(body ?? "Forbidden", { status: 403 })
}

/**
 * Resolve session from Bearer token (extension) or cookie (web). Extension sends Authorization: Bearer <token>.
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
 * Sockudo/Pusher channel auth. Client sends form: socket_id, channel_name.
 * Extension sends Authorization: Bearer <token>. We verify the user owns the session.
 * If the session does not exist yet (e.g. first message before interact creates it), returns 403
 * SESSION_NOT_FOUND; extension should create the session first or fall back to polling.
 * In development, 403 responses include { code, message } for debugging.
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
      return forbidden(
        "CHANNEL_FORBIDDEN",
        "Channel must be private-session-<sessionId>. No public session channel."
      )
    }

    const sessionId = channelName.slice(CHANNEL_PREFIX.length)
    if (!sessionId) {
      return forbidden("CHANNEL_FORBIDDEN", "Empty sessionId in channel name")
    }

    await connectDB()
    // Query by sessionId only - tenantId can vary between extension (Bearer) and browser (cookie) contexts.
    // Security is enforced via userId ownership check below.
    const doc = await (Session as any)
      .findOne({ sessionId })
      .select("userId")
      .lean()
      .exec()

    if (!doc) {
      return forbidden(
        "SESSION_NOT_FOUND",
        `No session found for sessionId=${sessionId}. Session may not exist yet.`
      )
    }

    if (doc.userId !== session.userId) {
      return forbidden(
        "USER_MISMATCH",
        `Session owned by different user (doc.userId=${doc.userId}, auth userId=${session.userId})`
      )
    }

    const pusher = getPusher()
    if (!pusher) {
      return new NextResponse("Service Unavailable", { status: 503 })
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName)
    return NextResponse.json(authResponse)
  } catch (error: unknown) {
    Sentry.captureException(error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
