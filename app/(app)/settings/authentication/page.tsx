import { headers } from "next/headers"
import { redirect } from "next/navigation"
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
      <div>
        <h1 className="text-lg font-semibold">Authentication</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Link your account to third-party authentication providers
        </p>
      </div>
      <SettingsLayout tenantState={tenantState}>
        <PasswordForm />
      </SettingsLayout>
    </div>
  )
}
