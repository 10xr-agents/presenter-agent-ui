import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

/**
 * Get session from Bearer token
 * 
 * Extracts Bearer token from Authorization header, validates via Better Auth,
 * and returns userId and tenantId (user or organization).
 * 
 * Used by all protected routes (interact, resolve, etc.) to resolve
 * tenant context for data isolation.
 * 
 * @param authorizationHeader - Authorization header value (e.g. "Bearer <token>")
 * @returns { userId, tenantId } or null if invalid/expired
 */
export async function getSessionFromToken(
  authorizationHeader: string | null
): Promise<{ userId: string; tenantId: string } | null> {
  if (!authorizationHeader) {
    return null
  }

  // Extract Bearer token
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return null
  }

  const token = match[1]!

  try {
    // Create headers object with Authorization for Better Auth
    const headersObj = new Headers()
    headersObj.set("Authorization", `Bearer ${token}`)

    // Get session from Better Auth (works with Bearer plugin)
    const session = await auth.api.getSession({ headers: headersObj })

    if (!session || !session.user) {
      return null
    }

    const userId = session.user.id

    // Resolve tenant: user (normal) or organization (org mode)
    const tenantState = await getTenantOperatingMode(userId, headersObj)
    let tenantId: string

    if (tenantState === "organization") {
      const organizationId = await getActiveOrganizationId(headersObj)
      tenantId = organizationId || userId // Fallback to userId if no active org
    } else {
      tenantId = userId
    }

    return { userId, tenantId }
  } catch (error: unknown) {
    // Log error but don't expose details
    console.error("[getSessionFromToken] Error validating token:", error)
    return null
  }
}

/**
 * Get session from request headers (convenience wrapper)
 * 
 * Extracts Authorization header from Next.js request and calls getSessionFromToken.
 * 
 * @param requestHeaders - Headers from NextRequest
 * @returns { userId, tenantId } or null
 */
export async function getSessionFromRequest(
  requestHeaders: Headers
): Promise<{ userId: string; tenantId: string } | null> {
  const authorization = requestHeaders.get("Authorization")
  return getSessionFromToken(authorization)
}
