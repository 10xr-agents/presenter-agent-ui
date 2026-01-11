import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Dashboard } from "@/components/analytics/dashboard"
import { auth } from "@/lib/auth"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

export default async function AnalyticsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  // Get active organization
  const activeOrgResult = await authApi.getActiveOrganization({
    headers: await headers(),
  })

  if (activeOrgResult.error || !activeOrgResult.data) {
    redirect("/")
  }

  const organizationId = activeOrgResult.data.id

  return (
    <div className="container mx-auto py-8">
      <Dashboard organizationId={organizationId} />
    </div>
  )
}
