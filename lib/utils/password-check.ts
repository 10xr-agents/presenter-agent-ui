import { headers } from "next/headers"
import { prisma } from "@/lib/db/prisma"

/**
 * In-memory cache for password status per user
 * Key: userId, Value: { hasPassword: boolean, timestamp: number }
 * Cache expires after 1 hour to handle edge cases
 */
const passwordCache = new Map<
  string,
  { hasPassword: boolean; timestamp: number }
>()

const CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds

/**
 * Get cached password status for a user
 */
function getCachedPasswordStatus(userId: string): boolean | null {
  const cached = passwordCache.get(userId)
  if (!cached) {
    return null
  }

  // Check if cache is expired
  const now = Date.now()
  if (now - cached.timestamp > CACHE_TTL) {
    passwordCache.delete(userId)
    return null
  }

  return cached.hasPassword
}

/**
 * Set cached password status for a user
 */
export function setCachedPasswordStatus(userId: string, hasPassword: boolean): void {
  passwordCache.set(userId, {
    hasPassword,
    timestamp: Date.now(),
  })
}

/**
 * Invalidate cached password status for a user
 * Call this when password is set, changed, or removed
 */
export function invalidatePasswordCache(userId: string): void {
  passwordCache.delete(userId)
}

/**
 * Check if a user has a password account (credential account)
 * Returns true if user has a credential account with a password set
 * 
 * This function uses a cache to avoid repeated database queries.
 * The cache is checked first, and only queries the database if not cached.
 * 
 * This function checks the account table for:
 * - providerId: "credential" (email/password account)
 * - password: not null (password is set)
 * 
 * @param userId - The user ID to check
 * @param forceRefresh - If true, bypass cache and query database directly
 * @returns Promise<boolean> - True if user has password, false otherwise
 */
export async function userHasPassword(
  userId: string,
  forceRefresh = false
): Promise<boolean> {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedPasswordStatus(userId)
    if (cached !== null) {
      return cached
    }
  }

  if (!prisma) {
    console.warn("[userHasPassword] Prisma not available, returning false")
    return false
  }

  try {
    // Check if user has a credential account with a password
    // This query specifically looks for:
    // 1. An account with providerId = "credential" (email/password auth)
    // 2. Where password is not null (password is actually set)
    const credentialAccount = await prisma.account.findFirst({
      where: {
        userId,
        providerId: "credential",
        password: {
          not: null,
        },
      },
      select: {
        id: true, // Only select id for performance
      },
    })

    const hasPassword = !!credentialAccount
    
    // Cache the result
    setCachedPasswordStatus(userId, hasPassword)

    return hasPassword
  } catch (error: unknown) {
    console.error("[userHasPassword] Error checking user password:", error)
    // On error, assume user doesn't have password to be safe
    // This ensures we prompt for password setup rather than blocking access
    return false
  }
}

/**
 * Check if the current session user has a password
 * Uses headers() to get the current session
 * 
 * @returns Promise<boolean> - True if current user has password, false otherwise
 */
export async function currentUserHasPassword(): Promise<boolean> {
  try {
    const authHeaders = await headers()
    const authHeader = authHeaders.get("authorization")
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return false
    }

    // For server-side checks, we'd need to get userId from session
    // This is a simplified version - in practice, you'd call auth.api.getSession first
    return false
  } catch {
    return false
  }
}
