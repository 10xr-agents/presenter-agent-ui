import { headers } from "next/headers"
import { Dashboard } from "@/components/analytics/dashboard"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

export default async function AnalyticsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    return null
  }

  const tenantState = await getTenantState(session.user.id)

  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }

  const analyticsOrgId = organizationId || session.user.id

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="mt-0.5 text-sm text-foreground">
          Detailed analytics and insights for your Screen Agents
        </p>
      </div>
      <Dashboard organizationId={analyticsOrgId} />
    </div>
  )
}
