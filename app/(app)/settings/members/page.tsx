import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { OrganizationMembersList } from "@/components/settings/organization/member-list"
import { auth } from "@/lib/auth"
import { getTenantState, getActiveOrganizationId } from "@/lib/utils/tenant-state"

export default async function SettingsMembersPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  const headersList = await headers()
  let organizationId = session.user.id
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
      const activeOrgId = await getActiveOrganizationId()
      if (activeOrgId) {
        organizationId = activeOrgId
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const authApi = auth.api as any
        const fullOrgResult = await authApi.organization.getFullOrganization({
          organizationId: activeOrgId,
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
    initialMembers = [
      {
        id: session.user.id,
        userId: session.user.id,
        role: "owner",
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
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your tenant settings and configuration
        </p>
      </div>
      <SettingsLayout tenantState={tenantState}>
        <OrganizationMembersList organizationId={organizationId} initialMembers={initialMembers} />
      </SettingsLayout>
    </div>
  )
}
