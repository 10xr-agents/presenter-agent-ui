import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { OrganizationMembersList } from "@/components/settings/organization/member-list"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function OrganizationMembersPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  // Redirect to tenant-level members page (Members exist in both modes)
  // This page is kept for backward compatibility but redirects to tenant/members
  redirect("/settings/tenant/members")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization Members"
        description="Manage team members and their roles"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Organization", href: "/settings/organization" },
          { label: "Members" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <OrganizationMembersList organizationId="" initialMembers={[]} />
      </SettingsLayout>
    </div>
  )
}
