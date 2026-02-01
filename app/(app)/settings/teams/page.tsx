import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { TeamList } from "@/components/teams/team-list"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

export default async function SettingsTeamsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantOperatingMode(session.user.id)

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
      <div className="py-6">
        <SettingsLayout tenantState={tenantState}>
          <div className="border rounded-lg border-destructive/50 bg-destructive/5 p-4">
            <p className="text-xs font-semibold text-destructive">Organization Required</p>
            <p className="mt-0.5 text-xs text-foreground">
              Please select an organization to view teams
            </p>
          </div>
        </SettingsLayout>
      </div>
    )
  }

  return (
    <div className="py-6">
      <SettingsLayout tenantState={tenantState}>
        <TeamList organizationId={organizationId} />
      </SettingsLayout>
    </div>
  )
}
