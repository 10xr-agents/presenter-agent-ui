import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { BillingContent } from "@/components/settings/billing/billing-content"
import { SettingsLayout } from "@/components/settings/settings-layout"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

export default async function SettingsBillingPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const tenantState = await getTenantOperatingMode(session.user.id)

  // Determine organization ID for billing
  let organizationId: string = session.user.id // Default to user ID for normal mode
  if (tenantState === "organization") {
    const activeOrgId = await getActiveOrganizationId()
    if (activeOrgId) {
      organizationId = activeOrgId
    }
  }

  return (
    <div className="py-6">
      <SettingsLayout tenantState={tenantState}>
        <BillingContent organizationId={organizationId} tenantState={tenantState} />
      </SettingsLayout>
    </div>
  )
}
