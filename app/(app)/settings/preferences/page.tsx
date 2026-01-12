import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { PreferencesForm } from "@/components/settings/preferences/preferences-form"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function PreferencesSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Preferences"
        description="Customize your theme, language, and notification settings"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Preferences" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <PreferencesForm />
      </SettingsLayout>
    </div>
  )
}
