import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { TenantGeneralForm } from "@/components/settings/tenant/tenant-general-form"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function TenantGeneralPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Settings"
        description="Manage tenant information and settings"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "General" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <TenantGeneralForm />
      </SettingsLayout>
    </div>
  )
}
