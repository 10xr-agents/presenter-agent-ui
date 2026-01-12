import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { TeamList } from "@/components/teams/team-list"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

export default async function SettingsTeamsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  if (tenantState === "normal") {
    redirect("/settings")
  }

  let organizationId: string | null = null
  try {
    organizationId = await getActiveOrganizationId()
  } catch {
    // Use fallback
  }

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage your tenant settings and configuration
          </p>
        </div>
        <SettingsLayout tenantState={tenantState}>
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Organization Required</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Please select an organization to view teams
            </p>
          </div>
        </SettingsLayout>
      </div>
    )
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
        <TeamList organizationId={organizationId} />
      </SettingsLayout>
    </div>
  )
}
