import crypto from "crypto"

/**
 * Generate a unique session token
 */
export async function generateSessionToken(): Promise<string> {
  // Generate a secure random token
  const token = crypto.randomBytes(32).toString("hex")
  return `session_${token}`
}

/**
 * Validate session token format
 */
export function isValidSessionToken(token: string): boolean {
  return token.startsWith("session_") && token.length > 40
}
