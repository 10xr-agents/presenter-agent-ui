import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Building2 } from "lucide-react"
import { PageHeader } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dashboard } from "@/components/analytics/dashboard"
import { auth } from "@/lib/auth"
import { getTenantState, getActiveOrganizationId } from "@/lib/utils/tenant-state"
import { spacing } from "@/lib/utils/design-system"

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

  // In normal mode, show dashboard with tenant's own data
  if (tenantState === "normal") {
    // Use user ID as the tenant ID for normal mode
    // The Dashboard component will fetch data scoped to this tenant
    return (
      <div className={spacing.section}>
        <PageHeader
          title="Dashboard"
          description="Overview of your Screen Agents, analytics, and activity"
        />
        <Dashboard organizationId={session.user.id} />
      </div>
    )
  }

  // Organization mode - show full dashboard with organization features
  // Use fallback if organizationId is not available
  const dashboardOrgId = organizationId || "default-org"

  return (
    <div className={spacing.section}>
      <PageHeader
        title="Dashboard"
        description="Overview of your Screen Agents, analytics, and activity"
      />
      <Dashboard organizationId={dashboardOrgId} />
    </div>
  )
}
