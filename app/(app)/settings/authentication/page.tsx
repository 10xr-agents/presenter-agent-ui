import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { PasswordForm } from "@/components/settings/authentication/password-form"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function AuthenticationSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Authentication Settings"
        description="Manage your password and security settings"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Authentication" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <PasswordForm />
      </SettingsLayout>
    </div>
  )
}
