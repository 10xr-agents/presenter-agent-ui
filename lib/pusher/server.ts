/**
 * Pusher server SDK configured for Soketi (Pusher-compatible WebSocket server).
 * Next.js triggers events here; Soketi broadcasts to connected clients.
 * See docs/DEVELOPMENT.md and Soketi + Pusher architecture.
 */

import Pusher from "pusher"

let pusher: Pusher | null = null

function getConfig() {
  const appId = process.env.SOKETI_APP_ID
  const key = process.env.SOKETI_APP_KEY
  const secret = process.env.SOKETI_APP_SECRET
  const host = process.env.SOKETI_HOST || "127.0.0.1"
  const port = process.env.SOKETI_PORT || "3005"
  const useTLS = process.env.SOKETI_USE_TLS === "true"
  if (!appId || !key || !secret) return null
  return { appId, key, secret, host, port, useTLS }
}

/**
 * Get Pusher instance for Soketi. Returns null if SOKETI_APP_KEY (and id/secret) are not set.
 */
export function getPusher(): Pusher | null {
  if (pusher) return pusher
  const config = getConfig()
  if (!config) return null
  pusher = new Pusher({
    appId: config.appId,
    key: config.key,
    secret: config.secret,
    host: config.host,
    port: config.port,
    useTLS: config.useTLS,
    cluster: "mt1", // Ignored by Soketi but required by Pusher SDK
  })
  return pusher
}

/** Channel name for a session's real-time stream (private; requires auth). */
export function sessionChannel(sessionId: string): string {
  return `private-session-${sessionId}`
}

/** Event names (must match client bindings). */
export const PUSHER_EVENT_NEW_MESSAGE = "new_message"
export const PUSHER_EVENT_INTERACT_RESPONSE = "interact_response"

/**
 * Trigger a new_message event to a session channel. No-op if Pusher is not configured.
 */
export async function triggerNewMessage(
  sessionId: string,
  message: {
    messageId: string
    role: "user" | "assistant" | "system"
    content: string
    actionString?: string
    status?: "success" | "failure" | "pending"
    sequenceNumber: number
    timestamp: string
    domSummary?: string
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  const p = getPusher()
  if (!p) return
  try {
    await p.trigger(
      sessionChannel(sessionId),
      PUSHER_EVENT_NEW_MESSAGE,
      { type: "new_message", sessionId, message }
    )
  } catch (error: unknown) {
    if (typeof console !== "undefined") {
      console.warn("[Pusher] triggerNewMessage failed:", error)
    }
  }
}

/**
 * Trigger an interact_response event to a session channel. No-op if Pusher is not configured.
 */
export async function triggerInteractResponse(
  sessionId: string,
  data: {
    taskId?: string
    action?: string
    thought?: string
    status?: string
    currentStepIndex?: number
    verification?: unknown
    correction?: unknown
  }
): Promise<void> {
  const p = getPusher()
  if (!p) return
  try {
    await p.trigger(
      sessionChannel(sessionId),
      PUSHER_EVENT_INTERACT_RESPONSE,
      { type: "interact_response", sessionId, data }
    )
  } catch (error: unknown) {
    if (typeof console !== "undefined") {
      console.warn("[Pusher] triggerInteractResponse failed:", error)
    }
  }
}
