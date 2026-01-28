"use client"

import { useEffect, useRef, useState } from "react"
import type {
  WsServerInteractResponse,
  WsServerNewMessage,
} from "@/lib/websocket/types"

export type WsConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error"

export interface UseSessionMessagesWsOptions {
  /** Called when a new_message or interact_response is received */
  onMessage?: (msg: WsServerNewMessage | WsServerInteractResponse) => void
}

export interface UseSessionMessagesWsResult {
  status: WsConnectionStatus
  error: string | null
  /** Last new_message received */
  lastNewMessage: WsServerNewMessage | null
  /** Last interact_response received */
  lastInteractResponse: WsServerInteractResponse | null
  /** Reconnect (e.g. after fixing network); no-op if already connected */
  reconnect: () => void
}

/**
 * Real-time session messages via Soketi (Pusher protocol) on port 3005.
 * Requires NEXT_PUBLIC_PUSHER_KEY, NEXT_PUBLIC_PUSHER_WS_HOST, NEXT_PUBLIC_PUSHER_WS_PORT.
 * Auth: POST /api/pusher/auth. Channel: private-session-{sessionId}.
 */
export function useSessionMessagesWs(
  sessionId: string | null,
  options: UseSessionMessagesWsOptions = {}
): UseSessionMessagesWsResult {
  const { onMessage } = options
  const [status, setStatus] = useState<WsConnectionStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [lastNewMessage, setLastNewMessage] = useState<WsServerNewMessage | null>(null)
  const [lastInteractResponse, setLastInteractResponse] =
    useState<WsServerInteractResponse | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setStatus("idle")
      setError(null)
      return () => {
        cleanupRef.current?.()
        cleanupRef.current = null
      }
    }

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const wsHost = process.env.NEXT_PUBLIC_PUSHER_WS_HOST || "127.0.0.1"
    const wsPort = parseInt(process.env.NEXT_PUBLIC_PUSHER_WS_PORT || "3005", 10)

    if (!key) {
      setError("Pusher key not configured (NEXT_PUBLIC_PUSHER_KEY)")
      setStatus("error")
      return
    }

    setStatus("connecting")
    setError(null)
    let cancelled = false

    import("pusher-js")
      .then(({ default: Pusher }) => {
        if (cancelled) return
        const pusher = new Pusher(key, {
          wsHost,
          wsPort,
          forceTLS: false,
          disableStats: true,
          cluster: "mt1",
          enabledTransports: ["ws", "wss"],
          authEndpoint: "/api/pusher/auth",
        })

        const channelName = `private-session-${sessionId}`
        const channel = pusher.subscribe(channelName)

        channel.bind("pusher:subscription_succeeded", () => {
          if (!cancelled) {
            setStatus("connected")
            setError(null)
          }
        })

        channel.bind("pusher:subscription_error", () => {
          if (!cancelled) {
            setStatus("error")
            setError("Subscription denied")
          }
        })

        channel.bind("new_message", (data: WsServerNewMessage) => {
          if (!cancelled) {
            setLastNewMessage(data)
            onMessageRef.current?.(data)
          }
        })

        channel.bind("interact_response", (data: WsServerInteractResponse) => {
          if (!cancelled) {
            setLastInteractResponse(data)
            onMessageRef.current?.(data)
          }
        })

        pusher.connection.bind("error", () => {
          if (!cancelled) {
            setStatus("error")
            setError("Connection error")
          }
        })

        pusher.connection.bind("disconnected", () => {
          if (!cancelled) setStatus("closed")
        })

        cleanupRef.current = () => {
          pusher.unsubscribe(channelName)
          pusher.disconnect()
          setStatus("idle")
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Pusher")
          setStatus("error")
        }
      })

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [sessionId, reconnectKey])

  const reconnect = () => {
    if (sessionId) {
      setError(null)
      setReconnectKey((k) => k + 1)
    }
  }

  return {
    status,
    error,
    lastNewMessage,
    lastInteractResponse,
    reconnect,
  }
}
