import { headers } from "next/headers"
import { Dashboard } from "@/components/analytics/dashboard"
import { auth } from "@/lib/auth"
import { getTenantState, getActiveOrganizationId } from "@/lib/utils/tenant-state"

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
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Detailed analytics and insights for your Screen Agents
        </p>
      </div>
      <Dashboard organizationId={analyticsOrgId} />
    </div>
  )
}
