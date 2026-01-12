import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { OrgGeneralForm } from "@/components/settings/organization/org-general-form"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function OrganizationSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  // Redirect to personal settings if not in organization mode
  if (tenantState === "normal") {
    redirect("/settings")
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Organization Features</h1>
        <p className="mt-0.5 text-sm text-foreground">
          Manage organization-specific features and settings
        </p>
      </div>
      <SettingsLayout tenantState={tenantState}>
        <OrgGeneralForm />
      </SettingsLayout>
    </div>
  )
}
