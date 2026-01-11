import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { TeamList } from "@/components/teams/team-list"
import { auth } from "@/lib/auth"

interface TeamsPageProps {
  searchParams: Promise<{ organizationId?: string }>
}

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  const params = await searchParams
  const organizationId = params.organizationId

  if (!organizationId) {
    // TODO: Get active organization from Better Auth session
    // For now, show error or redirect
    return (
      <div className="container mx-auto p-6">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <h2 className="font-semibold text-destructive">
            Organization Required
          </h2>
          <p className="text-sm text-muted-foreground">
            Please select an organization to view teams
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <TeamList organizationId={organizationId} />
    </div>
  )
}
