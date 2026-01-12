import { ArrowRight } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function OrganizationBillingPage() {
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
        title="Billing Settings"
        description="Manage payment methods, invoices, and billing preferences"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/settings" },
          { label: "Organization", href: "/settings/organization" },
          { label: "Billing" },
        ]}
      />
      <SettingsLayout tenantState={tenantState}>
        <Card>
          <CardHeader>
            <CardTitle>Billing Management</CardTitle>
            <CardDescription>
              Manage your organization's billing, payment methods, and invoices in the billing
              section.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/billing">
                Go to Billing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </SettingsLayout>
    </div>
  )
}
