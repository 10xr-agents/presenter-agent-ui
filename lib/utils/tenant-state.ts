import { headers } from "next/headers"
import { auth } from "@/lib/auth"

/**
 * Tenant operating mode type (INTERNAL ONLY - Never expose in UI)
 * - "normal": Default tenant experience (simplified)
 * - "organization": Advanced tenant experience with teams and organization features
 * 
 * NOTE: These values are internal implementation details and must NEVER appear in user-facing UI.
 * Use hasOrganizationFeatures() for feature gating instead.
 */
export type TenantOperatingMode = "normal" | "organization"

/**
 * Legacy type for backward compatibility
 * @deprecated Use TenantOperatingMode internally, but maintain this for existing code
 */
export type TenantState = "normal" | "organization"

/**
 * Get the current tenant operating mode for a user (INTERNAL ONLY)
 * 
 * This function returns the internal operating mode. For feature gating,
 * use hasOrganizationFeatures() instead.
 * 
 * @param userId - The user ID to check
 * @param authHeaders - Optional headers to use for authentication (e.g., Bearer token)
 * @returns The tenant operating mode ("normal" or "organization")
 */
export async function getTenantOperatingMode(
  userId: string,
  authHeaders?: Headers
): Promise<TenantOperatingMode> {
  try {
    // Check if user has any organization memberships via Better Auth
    // Having an organization membership means the tenant has enabled organization features
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any
    
    // Use provided headers (e.g., Bearer token) or fall back to request headers
    const headersToUse = authHeaders || (await headers())
    
    const orgsResult = await authApi.listOrganizations({
      headers: headersToUse,
    })

    // If user has at least one organization, tenant is in organization mode
    if (orgsResult.data && Array.isArray(orgsResult.data) && orgsResult.data.length > 0) {
      return "organization"
    }

    return "normal"
  } catch (error: unknown) {
    // If there's an error checking organizations, default to normal mode
    // This is safe because normal mode shows fewer features
    // Only log if it's not a 401 (unauthorized) - that's expected during login flow
    const errorStatus = (error as { status?: number; statusCode?: number })?.status || 
                        (error as { status?: number; statusCode?: number })?.statusCode
    if (errorStatus !== 401) {
      console.error("Error checking tenant operating mode:", error)
    }
    return "normal"
  }
}

/**
 * Get the current tenant state for a user (backward compatibility)
 * 
 * @deprecated Use getTenantOperatingMode() for new code
 * @param userId - The user ID to check
 * @param authHeaders - Optional headers to use for authentication (e.g., Bearer token)
 * @returns The tenant state ("normal" or "organization")
 */
export async function getTenantState(
  userId: string,
  authHeaders?: Headers
): Promise<TenantState> {
  return getTenantOperatingMode(userId, authHeaders)
}

/**
 * Check if tenant has organization features enabled (for feature gating)
 * 
 * This is the public API for checking if organization features should be shown.
 * Use this for UI gating instead of exposing the operating mode directly.
 * 
 * @param userId - The user ID to check
 * @returns True if organization features are enabled, false otherwise
 */
export async function hasOrganizationFeatures(userId: string): Promise<boolean> {
  const mode = await getTenantOperatingMode(userId)
  return mode === "organization"
}

/**
 * Check if user has an active organization
 * 
 * @returns True if user has an active organization, false otherwise
 */
export async function hasActiveOrganization(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any
    
    const activeOrgResult = await authApi.getActiveOrganization({
      headers: await headers(),
    })

    return !!(activeOrgResult.data && activeOrgResult.data.id)
  } catch (error: unknown) {
    console.error("Error checking active organization:", error)
    return false
  }
}

/**
 * Get the active organization ID if available
 * 
 * @param authHeaders - Optional headers to use for authentication (e.g., Bearer token)
 * @returns The active organization ID, or null if not available
 */
export async function getActiveOrganizationId(authHeaders?: Headers): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any
    
    // Use provided headers (e.g., Bearer token) or fall back to request headers
    const headersToUse = authHeaders || (await headers())
    
    // Try to get active organization using organization.getActive method
    // If that doesn't work, try getActiveOrganization as fallback
    let activeOrgResult
    if (authApi.organization?.getActive) {
      activeOrgResult = await authApi.organization.getActive({
        headers: headersToUse,
      })
    } else if (authApi.getActiveOrganization) {
      activeOrgResult = await authApi.getActiveOrganization({
        headers: headersToUse,
      })
    } else {
      // Fallback: get from session's activeOrganizationId
      const session = await auth.api.getSession({ headers: headersToUse })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((session as any)?.activeOrganizationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (session as any).activeOrganizationId
      }
      return null
    }

    if (activeOrgResult?.data && activeOrgResult.data.id) {
      return activeOrgResult.data.id
    }

    return null
  } catch (error: unknown) {
    // Only log if it's not a 401 (unauthorized) - that's expected during login flow
    const errorStatus = (error as { status?: number; statusCode?: number })?.status || 
                        (error as { status?: number; statusCode?: number })?.statusCode
    if (errorStatus !== 401) {
      console.error("Error getting active organization ID:", error)
    }
    // Fallback: try to get from session
    try {
      const headersToUse = authHeaders || (await headers())
      const session = await auth.api.getSession({ headers: headersToUse })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((session as any)?.activeOrganizationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (session as any).activeOrganizationId
      }
    } catch {
      // Ignore fallback errors
    }
    return null
  }
}
