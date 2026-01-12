import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { TeamList } from "@/components/teams/team-list"
import { auth } from "@/lib/auth"
import { getTenantState, hasOrganizationFeatures, getActiveOrganizationId } from "@/lib/utils/tenant-state"

export default async function OrganizationTeamsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Teams are only available in Organization mode
  const hasOrgFeatures = await hasOrganizationFeatures(session.user.id)
  if (!hasOrgFeatures) {
    redirect("/settings")
  }

  const tenantState = await getTenantState(session.user.id)

  // Get active organization
  let organizationId: string | null = null
  try {
    organizationId = await getActiveOrganizationId()
  } catch {
    // Use fallback
  }

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Teams"
          description="Manage teams and team members"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Settings", href: "/settings" },
            { label: "Organization", href: "/settings/organization" },
            { label: "Teams" },
          ]}
        />
        <SettingsLayout tenantState={tenantState}>
          <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
            <h2 className="font-semibold text-destructive">Organization Required</h2>
            <p className="text-sm text-muted-foreground">
              Please select an organization to view teams
            </p>
          </div>
        </SettingsLayout>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Manage teams and team members"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Organization", href: "/settings/organization" },
          { label: "Teams" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <TeamList organizationId={organizationId} />
      </SettingsLayout>
    </div>
  )
}
