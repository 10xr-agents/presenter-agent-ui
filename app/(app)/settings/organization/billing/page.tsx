import { ArrowRight } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { getTenantOperatingMode } from "@/lib/utils/tenant-state"

export default async function OrganizationBillingPage() {
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
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-0.5">Billing Management</h3>
          <p className="text-xs text-foreground mb-3">
            Manage your organization's billing, payment methods, and invoices in the billing
            section.
          </p>
          <Button asChild size="sm">
            <Link href="/billing">
              Go to Billing
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </SettingsLayout>
    </div>
  )
}
