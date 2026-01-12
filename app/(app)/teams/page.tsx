import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { TeamList } from "@/components/teams/team-list"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantState, hasOrganizationFeatures } from "@/lib/utils/tenant-state"

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
      const activeOrgId = await getActiveOrganizationId()
      if (activeOrgId) {
        organizationId = activeOrgId
      }
    } catch {
      // Use fallback
    }
  }

  if (!organizationId) {
    return (
      <div className="py-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold">Teams</h1>
          <p className="mt-0.5 text-sm text-foreground">
            Manage team members and permissions
          </p>
        </div>
        <div className="border rounded-lg border-destructive/50 bg-destructive/5 p-4">
          <h2 className="text-xs font-semibold text-destructive">Organization Features Required</h2>
          <p className="mt-0.5 text-xs text-foreground">
            Teams are only available when organization features are enabled.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Teams</h1>
        <p className="mt-0.5 text-sm text-foreground">
          Manage team members and permissions
        </p>
      </div>
      <TeamList organizationId={organizationId} />
    </div>
  )
}
