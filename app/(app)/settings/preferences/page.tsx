import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PreferencesForm } from "@/components/settings/preferences/preferences-form"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { auth } from "@/lib/auth"
import { getTenantOperatingMode } from "@/lib/utils/tenant-state"

export default async function PreferencesSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantOperatingMode(session.user.id)

  return (
    <div className="py-6">
      <SettingsLayout tenantState={tenantState}>
        <PreferencesForm />
      </SettingsLayout>
    </div>
  )
}
