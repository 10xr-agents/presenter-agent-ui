/**
 * In-memory WebSocket auth token store.
 * Used when the WebSocket server runs in the same process as the Next.js app (no Redis needed).
 * Token is one-time use and expires in 2 minutes.
 */

import type { WsTokenPayload } from "./token-store"

const TTL_MS = 2 * 60 * 1000 // 2 minutes
const store = new Map<string, { payload: WsTokenPayload; expiresAt: number }>()

function prune() {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key)
  }
}

export function setWsTokenMemory(
  token: string,
  payload: WsTokenPayload
): void {
  prune()
  store.set(token, {
    payload,
    expiresAt: Date.now() + TTL_MS,
  })
}

export function consumeWsTokenMemory(
  token: string
): WsTokenPayload | null {
  const entry = store.get(token)
  store.delete(token)
  if (!entry || entry.expiresAt <= Date.now()) return null
  return entry.payload
}
