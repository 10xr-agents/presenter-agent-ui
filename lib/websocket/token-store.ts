/**
 * Short-lived WebSocket auth token store (Redis).
 * API route issues token; WebSocket server validates on connect.
 */

const TOKEN_PREFIX = "ws:token:"
const TOKEN_TTL_SECONDS = 120 // 2 minutes

export interface WsTokenPayload {
  userId: string
  tenantId: string
}

/**
 * Store a WebSocket token and return the token string.
 * Token is a random UUID; value is { userId, tenantId }; TTL 2 minutes.
 */
export async function setWsToken(
  token: string,
  payload: WsTokenPayload
): Promise<void> {
  const redis = (await import("@/lib/queue/redis")).getRedis() as import("ioredis").Redis
  const key = `${TOKEN_PREFIX}${token}`
  await redis.setex(key, TOKEN_TTL_SECONDS, JSON.stringify(payload))
}

/**
 * Get token payload and delete token (one-time use).
 * Returns null if token missing or expired.
 */
export async function consumeWsToken(token: string): Promise<WsTokenPayload | null> {
  const redis = (await import("@/lib/queue/redis")).getRedis() as import("ioredis").Redis
  const key = `${TOKEN_PREFIX}${token}`
  const raw = await redis.get(key)
  if (!raw) return null
  await redis.del(key)
  try {
    return JSON.parse(raw) as WsTokenPayload
  } catch {
    return null
  }
}
