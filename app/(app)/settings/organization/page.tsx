import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
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
    <div className="space-y-6">
      <PageHeader
        title="Organization Features"
        description="Manage organization-specific features and settings"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Organization" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <OrgGeneralForm />
      </SettingsLayout>
    </div>
  )
}
