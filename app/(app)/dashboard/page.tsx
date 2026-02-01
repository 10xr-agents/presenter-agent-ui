import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard"
import { PageShell } from "@/components/shell/page-shell"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

/**
 * Dashboard Page - Browser Copilot Home
 * 
 * Purpose: Summary metrics, recent activity, and extension installation CTA.
 * 
 * This is NOT analytics. For deep analytics, see /analytics.
 * 
 * Includes:
 * - Summary metrics (tasks completed, time saved, tokens used)
 * - Recent activity (last 5 sessions)
 * - Install Extension CTA
 * 
 * Constraints:
 * - No deep analytics
 * - No dense charts
 * - No historical drill-downs
 */
export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    redirect("/login")
  }

  // Get tenant state
  const tenantState = await getTenantOperatingMode(session.user.id)

  // Get active organization ID (if in organization mode)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }

  // In normal mode, use user ID as the tenant ID
  const dashboardOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  return (
    <PageShell
      title="Dashboard"
      description="Your Browser Copilot activity at a glance"
    >
      <OverviewDashboard organizationId={dashboardOrgId} tenantState={tenantState} />
    </PageShell>
  )
}
