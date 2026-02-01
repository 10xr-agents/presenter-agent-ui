import { Shield } from "lucide-react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { auth } from "@/lib/auth"
import { getTenantOperatingMode } from "@/lib/utils/tenant-state"

export default async function OrganizationSecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantOperatingMode(session.user.id)

  // Redirect to personal settings if not in organization mode
  if (tenantState === "normal") {
    redirect("/settings")
  }

  return (
    <div className="py-6">
      <SettingsLayout tenantState={tenantState}>
        <div className="space-y-4">
          <Alert className="py-2">
            <Shield className="h-3.5 w-3.5" />
            <AlertDescription className="text-xs">
              Security settings are available for Enterprise organizations. Upgrade to Enterprise to
              access SSO, domain allowlisting, and advanced security features.
            </AlertDescription>
          </Alert>

          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-0.5">Domain Allowlist</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Restrict access to your organization to specific email domains (Enterprise only)
            </p>
            <p className="text-xs text-muted-foreground">
              This feature is available for Enterprise organizations. Contact support to upgrade.
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-0.5">Single Sign-On (SSO)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Configure SSO authentication for your organization (Enterprise only)
            </p>
            <p className="text-xs text-muted-foreground">
              This feature is available for Enterprise organizations. Contact support to upgrade.
            </p>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-0.5">Audit Logs</h3>
            <p className="text-xs text-muted-foreground mb-3">
              View audit logs for organization-level actions and changes
            </p>
            <p className="text-xs text-muted-foreground">
              Audit logs are available for Enterprise organizations. Contact support to upgrade.
            </p>
          </div>
        </div>
      </SettingsLayout>
    </div>
  )
}
