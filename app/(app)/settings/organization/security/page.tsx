import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Shield } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function OrganizationSecurityPage() {
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
        title="Security Settings"
        description="Manage security and access settings for your organization"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Organization", href: "/settings/organization" },
          { label: "Security" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <div className="space-y-6">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Security settings are available for Enterprise organizations. Upgrade to Enterprise to
              access SSO, domain allowlisting, and advanced security features.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Domain Allowlist</CardTitle>
              <CardDescription>
                Restrict access to your organization to specific email domains (Enterprise only)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This feature is available for Enterprise organizations. Contact support to upgrade.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Single Sign-On (SSO)</CardTitle>
              <CardDescription>
                Configure SSO authentication for your organization (Enterprise only)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This feature is available for Enterprise organizations. Contact support to upgrade.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit Logs</CardTitle>
              <CardDescription>
                View audit logs for organization-level actions and changes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Audit logs are available for Enterprise organizations. Contact support to upgrade.
              </p>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </div>
  )
}
