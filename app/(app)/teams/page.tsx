import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { TeamList } from "@/components/teams/team-list"
import { auth } from "@/lib/auth"
import { getTenantState, hasOrganizationFeatures } from "@/lib/utils/tenant-state"

// Type assertion for Better Auth API methods that may not be fully typed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authApi = auth.api as any

interface TeamsPageProps {
  searchParams: Promise<{ organizationId?: string }>
}

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  // Session check is handled by layout
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  // Teams are only available in Organization mode
  const hasOrgFeatures = await hasOrganizationFeatures(session.user.id)
  if (!hasOrgFeatures) {
    // Redirect to settings to show that teams require organization features
    redirect("/settings")
  }

  const headersList = await headers()
  const params = await searchParams
  let organizationId = params.organizationId

  // Get active organization from Better Auth if not provided
  if (!organizationId) {
    try {
      const activeOrgResult = await authApi.getActiveOrganization({
        headers: headersList,
      })
      if (activeOrgResult.data) {
        organizationId = activeOrgResult.data.id
      }
    } catch {
      // Use fallback
    }
  }

  if (!organizationId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Teams"
          description="Manage team members and permissions"
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Teams" },
          ]}
        />
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <h2 className="font-semibold text-destructive">Organization Features Required</h2>
          <p className="text-sm text-muted-foreground">
            Teams are only available when organization features are enabled.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Manage team members and permissions"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Teams" },
        ]}
      />
      <TeamList organizationId={organizationId} />
    </div>
  )
}
