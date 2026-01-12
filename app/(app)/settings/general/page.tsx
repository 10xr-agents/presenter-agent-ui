import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { TenantGeneralForm } from "@/components/settings/tenant/tenant-general-form"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function SettingsGeneralPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your tenant settings and configuration
        </p>
      </div>
      <SettingsLayout tenantState={tenantState}>
        <TenantGeneralForm />
      </SettingsLayout>
    </div>
  )
}
