import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { OrganizationMembersList } from "@/components/settings/organization/member-list"
import { auth } from "@/lib/auth"
import { getTenantState, getActiveOrganizationId } from "@/lib/utils/tenant-state"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

export default async function TenantMembersPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  // Get active organization ID (if in organization mode)
  // In normal mode, we'll use the user's ID as the tenant identifier
  const headersList = await headers()
  let organizationId = session.user.id // Default to user ID for normal mode
  let initialMembers: Array<{
    id: string
    userId: string
    role: string
    createdAt: string
    user: {
      id: string
      name: string
      email: string
      image?: string
    }
  }> = []

  if (tenantState === "organization") {
    try {
      const activeOrgResult = await authApi.getActiveOrganization({
        headers: headersList,
      })
      if (activeOrgResult.data) {
        organizationId = activeOrgResult.data.id

        // Get full organization with members
        const fullOrgResult = await authApi.getFullOrganization({
          organizationId: activeOrgResult.data.id,
          headers: headersList,
        })
        if (fullOrgResult.data?.members) {
          initialMembers = fullOrgResult.data.members
        }
      }
    } catch {
      // Use fallback values
    }
  } else {
    // In normal mode, create a minimal member list with just the current user
    initialMembers = [
      {
        id: session.user.id,
        userId: session.user.id,
        role: "owner", // User is owner of their tenant
        createdAt: new Date().toISOString(),
        user: {
          id: session.user.id,
          name: session.user.name || "User",
          email: session.user.email || "",
          image: session.user.image || undefined,
        },
      },
    ]
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Manage tenant members and their roles"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Members" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <OrganizationMembersList organizationId={organizationId} initialMembers={initialMembers} />
      </SettingsLayout>
    </div>
  )
}
