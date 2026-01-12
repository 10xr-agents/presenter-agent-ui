import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Shield } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function SettingsSecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantState(session.user.id)

  if (tenantState === "normal") {
    redirect("/settings")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage your tenant settings and configuration
        </p>
      </div>
      <SettingsLayout tenantState={tenantState}>
        <div className="space-y-6">
          <Alert className="py-2">
            <Shield className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Security settings are available for Enterprise organizations. Upgrade to Enterprise to
              access SSO, domain allowlisting, and advanced security features.
            </AlertDescription>
          </Alert>

          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Domain Allowlist</h3>
                  <p className="text-xs text-muted-foreground">
                    Restrict access to your organization to specific email domains (Enterprise only)
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  This feature is available for Enterprise organizations. Contact support to upgrade.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Single Sign-On (SSO)</h3>
                  <p className="text-xs text-muted-foreground">
                    Configure SSO authentication for your organization (Enterprise only)
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  This feature is available for Enterprise organizations. Contact support to upgrade.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Audit Logs</h3>
                  <p className="text-xs text-muted-foreground">
                    View audit logs for organization-level actions and changes
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Audit logs are available for Enterprise organizations. Contact support to upgrade.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </div>
  )
}
