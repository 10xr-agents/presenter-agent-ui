import { headers } from "next/headers"
import { Dashboard } from "@/components/analytics/dashboard"
import { PageShell } from "@/components/shell/page-shell"
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
    <PageShell
      title="Analytics"
      description="Detailed analytics and insights for your Screen Agents"
    >
      <Dashboard organizationId={analyticsOrgId} />
    </PageShell>
  )
}
