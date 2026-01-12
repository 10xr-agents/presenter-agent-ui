import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard"
import { auth } from "@/lib/auth"
import { spacing } from "@/lib/utils/design-system"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

/**
 * Dashboard Page - High-Level Overview
 * 
 * Purpose: Fast, executive-style overview with clear next actions.
 * 
 * This is NOT analytics. For deep analytics, see /analytics.
 * 
 * Includes:
 * - High-level metrics (total agents, recent sessions, processing status)
 * - Primary CTAs (create agent, invite members)
 * - Quick links to detailed views
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
  const tenantState = await getTenantState(session.user.id)

  // Get active organization ID (if in organization mode)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }

  // In normal mode, use user ID as the tenant ID
  const dashboardOrgId = tenantState === "normal" ? session.user.id : (organizationId || "default-org")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Overview of your Screen Agents and activity
        </p>
      </div>
      <OverviewDashboard organizationId={dashboardOrgId} tenantState={tenantState} />
    </div>
  )
}
