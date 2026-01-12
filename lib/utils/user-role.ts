import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { hasPermission } from "@/lib/config/roles"

/**
 * Get the current user's role in an organization
 * 
 * @param organizationId - The organization ID
 * @returns The user's role ("owner" | "admin" | "member" | "viewer") or null if not a member
 */
export async function getUserRoleInOrganization(
  organizationId: string
): Promise<"owner" | "admin" | "member" | "viewer" | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any

    const orgResult = await authApi.getFullOrganization({
      headers: await headers(),
      query: {
        organizationId,
      },
    })

    if (orgResult.error || !orgResult.data) {
      return null
    }

    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return null
    }

    const member = orgResult.data.members?.find(
      (m: { userId: string }) => m.userId === session.user.id
    )

    if (!member) {
      return null
    }

    // Validate role is one of the allowed tenant-level roles
    const role = member.role as string
    if (["owner", "admin", "member", "viewer"].includes(role)) {
      return role as "owner" | "admin" | "member" | "viewer"
    }

    return "member" // Default fallback
  } catch (error: unknown) {
    console.error("Error getting user role:", error)
    return null
  }
}

/**
 * Check if the current user has a specific permission in an organization
 * 
 * @param organizationId - The organization ID
 * @param resource - The resource to check (e.g., "organization", "screenAgent", "billing")
 * @param action - The action to check (e.g., "manage_members", "read", "update")
 * @returns True if the user has the permission, false otherwise
 */
export async function checkUserPermission(
  organizationId: string,
  resource: string,
  action: string
): Promise<boolean> {
  const role = await getUserRoleInOrganization(organizationId)
  if (!role) {
    return false
  }

  return hasPermission(role, resource, action)
}

/**
 * Require a specific permission, throwing an error if not granted
 * Use this in API routes for authorization checks
 * 
 * @param organizationId - The organization ID
 * @param resource - The resource to check
 * @param action - The action to check
 * @throws Error if permission is not granted
 */
export async function requirePermission(
  organizationId: string,
  resource: string,
  action: string
): Promise<void> {
  const hasAccess = await checkUserPermission(organizationId, resource, action)
  if (!hasAccess) {
    throw new Error(`Permission denied: ${resource}.${action}`)
  }
}
