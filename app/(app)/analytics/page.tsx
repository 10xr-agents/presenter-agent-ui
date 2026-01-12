import { headers } from "next/headers"
import { PageHeader } from "@/components/app-shell"
import { Dashboard } from "@/components/analytics/dashboard"
import { auth } from "@/lib/auth"
import { spacing } from "@/lib/utils/design-system"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

export default async function AnalyticsPage() {
  // Session check is handled by layout
  const headersList = await headers()

  // Get active organization
  const activeOrgResult = await authApi.getActiveOrganization({
    headers: headersList,
  })

  const organizationId = activeOrgResult.data?.id || "default-org"

  return (
    <div className={spacing.section}>
      <PageHeader
        title="Analytics"
        description="Detailed analytics and insights for your Screen Agents"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Analytics" },
        ]}
      />
      <Dashboard organizationId={organizationId} />
    </div>
  )
}
