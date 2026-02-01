import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getSessionFromRequest } from "@/lib/auth/session"
import { connectDB } from "@/lib/db/mongoose"
import { BrowserSession } from "@/lib/models"
import { getPusher } from "@/lib/pusher/server"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

/**
 * Pusher/Sockudo private channel prefix. We use private-session-{sessionId} because:
 * - Pusher private channels require server-side auth; presence/public channels don't fit our model.
 * - Only the session owner should subscribe (verified by Session lookup + userId match).
 * - There is no public session channel for message sync; all real-time session data is private.
 */
const CHANNEL_PREFIX = "private-session-"
const isDev = process.env.NODE_ENV === "development"

function forbidden(params: {
  code: string
  message?: string
  channelName?: string | null
  sessionId?: string | null
  userId?: string | null
  socketId?: string | null
}) {
  const payload = {
    code: params.code,
    message: params.message ?? params.code,
    channelName: params.channelName ?? null,
    sessionId: params.sessionId ?? null,
    socketId: params.socketId ?? null,
    userId: params.userId ?? null,
  }

  // Always log server-side (even in prod) so we can debug 403s.
  // Never log Bearer tokens or cookies here.
  Sentry.logger.warn("Pusher auth: forbidden", payload)
  // In development, also log to stdout so it shows in `pnpm dev`.
  if (isDev) {
    console.warn("[pusher/auth] forbidden", payload)
  }

  const body = isDev ? { code: payload.code, message: payload.message } : undefined
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
  const tenantState = await getTenantOperatingMode(userId)
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
      Sentry.logger.warn("Pusher auth: unauthorized (no session)")
      if (isDev) console.warn("[pusher/auth] unauthorized (no session)")
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const formData = await req.formData()
    const socketId = formData.get("socket_id") as string | null
    const channelName = formData.get("channel_name") as string | null

    if (!socketId || !channelName) {
      Sentry.logger.warn("Pusher auth: bad request (missing socket_id or channel_name)", {
        hasSocketId: !!socketId,
        hasChannelName: !!channelName,
        userId: session.userId,
      })
      if (isDev) {
        console.warn("[pusher/auth] bad request (missing socket_id or channel_name)", {
          hasSocketId: !!socketId,
          hasChannelName: !!channelName,
          userId: session.userId,
        })
      }
      return new NextResponse("Bad Request", { status: 400 })
    }

    if (!channelName.startsWith(CHANNEL_PREFIX)) {
      return forbidden({
        code: "CHANNEL_FORBIDDEN",
        message: "Channel must be private-session-<sessionId>. No public session channel.",
        channelName,
        socketId,
        userId: session.userId,
      })
    }

    const sessionId = channelName.slice(CHANNEL_PREFIX.length)
    if (!sessionId) {
      return forbidden({
        code: "CHANNEL_FORBIDDEN",
        message: "Empty sessionId in channel name",
        channelName,
        sessionId: sessionId || null,
        socketId,
        userId: session.userId,
      })
    }

    await connectDB()
    // Query by sessionId only - tenantId can vary between extension (Bearer) and browser (cookie) contexts.
    // Security is enforced via userId ownership check below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose safety rule: cast model methods
    const doc = await (BrowserSession as any)
      .findOne({ sessionId })
      .select("userId")
      .lean()
      .exec()

    if (!doc) {
      return forbidden({
        code: "SESSION_NOT_FOUND",
        message: `No session found for sessionId=${sessionId}. Session may not exist yet.`,
        channelName,
        sessionId,
        socketId,
        userId: session.userId,
      })
    }

    if (doc.userId !== session.userId) {
      return forbidden({
        code: "USER_MISMATCH",
        message: `Session owned by different user (doc.userId=${doc.userId}, auth userId=${session.userId})`,
        channelName,
        sessionId,
        socketId,
        userId: session.userId,
      })
    }

    const pusher = getPusher()
    if (!pusher) {
      Sentry.logger.warn("Pusher auth: service unavailable (Sockudo/Pusher not configured)", {
        channelName,
        sessionId,
        socketId,
        userId: session.userId,
      })
      if (isDev) {
        console.warn("[pusher/auth] service unavailable (Sockudo/Pusher not configured)", {
          channelName,
          sessionId,
          socketId,
          userId: session.userId,
        })
      }
      return new NextResponse("Service Unavailable", { status: 503 })
    }

    Sentry.logger.info("Pusher auth: authorized", {
      channelName,
      sessionId,
      socketId,
      userId: session.userId,
    })
    if (isDev) {
      console.info("[pusher/auth] authorized", {
        channelName,
        sessionId,
        socketId,
        userId: session.userId,
      })
    }

    const authResponse = pusher.authorizeChannel(socketId, channelName)
    return NextResponse.json(authResponse)
  } catch (error: unknown) {
    Sentry.captureException(error)
    Sentry.logger.error("Pusher auth: internal error", {
      error: error instanceof Error ? error.message : String(error),
    })
    console.error("[pusher/auth] internal error", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
