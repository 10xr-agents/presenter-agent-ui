/**
 * In-process WebSocket server for real-time session messages.
 * Runs inside the Next.js process (no Redis, no separate pnpm ws).
 * Extension and server communicate over WebSocket on WS_PORT.
 */

import { WebSocketServer } from "ws"
import { consumeWsTokenMemory } from "./memory-token-store"
import type { PublishPayload } from "./pubsub"
import type { WsClientMessage, WsServerMessage } from "./types"

type WebSocket = import("ws").WebSocket

let wss: WebSocketServer | null = null
const sessionToClients = new Map<string, Set<WebSocket>>()

function send(ws: WebSocket, msg: WsServerMessage) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg))
  }
}

function unsubscribeClient(ws: WebSocket) {
  for (const [sessionId, set] of sessionToClients) {
    if (set.has(ws)) {
      set.delete(ws)
      if (set.size === 0) sessionToClients.delete(sessionId)
      break
    }
  }
}

/**
 * Broadcast a message to all clients subscribed to this session.
 * Called from API routes (e.g. interact) instead of Redis publish.
 */
export function broadcastToSession(sessionId: string, payload: PublishPayload): void {
  const clients = sessionToClients.get(sessionId)
  if (!clients) return
  const raw = JSON.stringify(payload)
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(raw)
  }
}

export function getInProcessWsServer(): WebSocketServer | null {
  return wss
}

/**
 * Start the WebSocket server on WS_PORT. Called from instrumentation.
 */
export function startInProcessWsServer(): void {
  if (wss) return
  const port = parseInt(process.env.WS_PORT || "3001", 10)
  wss = new WebSocketServer({ port })

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`)
    const token = url.searchParams.get("token")

    if (!token) {
      send(ws, { type: "error", code: "UNAUTHORIZED", message: "Missing token" })
      ws.close()
      return
    }

    const payload = consumeWsTokenMemory(token)
    if (!payload) {
      send(ws, { type: "error", code: "UNAUTHORIZED", message: "Invalid or expired token" })
      ws.close()
      return
    }

    const { userId, tenantId } = payload

    ws.on("message", async (data: Buffer | string) => {
      try {
        const parsed = JSON.parse(
          typeof data === "string" ? data : data.toString()
        ) as WsClientMessage
        if (parsed.type === "ping") {
          send(ws, { type: "pong", timestamp: Date.now() })
          return
        }
        if (parsed.type === "subscribe") {
          const sessionId = parsed.sessionId
          if (!sessionId || typeof sessionId !== "string") {
            send(ws, { type: "error", code: "VALIDATION_ERROR", message: "sessionId required" })
            return
          }
          const { connectDB } = await import("@/lib/db/mongoose")
          const { BrowserSession } = await import("@/lib/models")
          await connectDB()
          const session = await (BrowserSession as any)
            .findOne({ sessionId, tenantId })
            .select("userId")
            .lean()
            .exec()
          if (!session || session.userId !== userId) {
            send(ws, { type: "error", code: "FORBIDDEN", message: "Session not found or access denied" })
            return
          }
          const set = sessionToClients.get(sessionId) ?? new Set()
          set.add(ws)
          sessionToClients.set(sessionId, set)
          send(ws, { type: "subscribed", sessionId })
          return
        }
      } catch {
        send(ws, { type: "error", code: "INVALID_MESSAGE", message: "Invalid JSON or message type" })
      }
    })

    ws.on("close", () => {
      unsubscribeClient(ws)
    })
  })

  if (typeof console !== "undefined") {
    console.log(`[WS] In-process WebSocket server listening on port ${port}`)
  }
}
