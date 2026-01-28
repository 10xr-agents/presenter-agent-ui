/**
 * Redis pub/sub for WebSocket message events.
 * API routes publish here; the WebSocket server subscribes and forwards to connected clients.
 */

import { getRedis } from "@/lib/queue/redis"
import type { WsMessagePayload } from "./types"

const CHANNEL_PREFIX = "ws:session:"

/**
 * Redis channel for session message and interact events.
 * Format: ws:session:{sessionId}
 * Both new_message and interact_response are published to this channel.
 */
export function sessionChannel(sessionId: string): string {
  return `${CHANNEL_PREFIX}${sessionId}`
}

/** Payload published when a new message is created/updated */
export interface PublishMessagePayload {
  type: "new_message"
  sessionId: string
  message: WsMessagePayload
}

/** Payload published when an interact response is returned (assistant turn) */
export interface PublishInteractPayload {
  type: "interact_response"
  sessionId: string
  data: {
    taskId?: string
    action?: string
    thought?: string
    status?: string
    currentStepIndex?: number
    verification?: unknown
    correction?: unknown
  }
}

export type PublishPayload = PublishMessagePayload | PublishInteractPayload

/**
 * Publish a new message event for a session.
 * Call this after creating or updating a Message document.
 * WebSocket server subscribes to Redis and forwards to clients subscribed to this sessionId.
 */
export async function publishMessageEvent(
  sessionId: string,
  message: WsMessagePayload
): Promise<void> {
  try {
    const redis = getRedis() as import("ioredis").Redis
    const channel = sessionChannel(sessionId)
    const payload: PublishMessagePayload = {
      type: "new_message",
      sessionId,
      message,
    }
    await redis.publish(channel, JSON.stringify(payload))
  } catch (error: unknown) {
    // Don't fail the request if Redis publish fails (e.g. Redis down)
    if (typeof console !== "undefined") {
      console.warn("[WebSocket pubsub] publishMessageEvent failed:", error)
    }
  }
}

/**
 * Publish an interact response event for a session.
 * Call this after a successful interact response so clients get real-time assistant turn.
 */
export async function publishInteractResponse(
  sessionId: string,
  data: PublishInteractPayload["data"]
): Promise<void> {
  try {
    const redis = getRedis() as import("ioredis").Redis
    const channel = sessionChannel(sessionId)
    const payload: PublishInteractPayload = {
      type: "interact_response",
      sessionId,
      data,
    }
    await redis.publish(channel, JSON.stringify(payload))
  } catch (error: unknown) {
    if (typeof console !== "undefined") {
      console.warn("[WebSocket pubsub] publishInteractResponse failed:", error)
    }
  }
}
