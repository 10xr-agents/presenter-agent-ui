import { Plus } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { ScreenAgentList } from "@/components/screen-agents/screen-agent-list"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { listScreenAgents } from "@/lib/screen-agents/manager"
import { spacing } from "@/lib/utils/design-system"

export default async function ScreenAgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Get initial agents (limit to 50 for now)
  // In production, this would come from Better Auth active organization context
  const organizationId = "default-org" // TODO: Get from Better Auth active organization

  const agents = await listScreenAgents({
    organizationId,
    ownerId: organizationId ? undefined : session.user.id,
    limit: 50,
    offset: 0,
  })

  const initialAgents = agents.map((agent) => ({
    id: agent._id.toString(),
    name: agent.name,
    description: agent.description,
    status: agent.status,
    visibility: agent.visibility,
    targetWebsiteUrl: agent.targetWebsiteUrl,
    totalPresentationCount: agent.totalPresentationCount,
    totalViewerCount: agent.totalViewerCount,
    totalMinutesConsumed: agent.totalMinutesConsumed,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    shareableToken: agent.shareableToken,
  }))

  return (
    <div className={spacing.section}>
      <PageHeader
        title="Screen Agents"
        description="Manage your interactive screen presentation agents"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Screen Agents" },
        ]}
        actions={
          <Button asChild>
            <Link href="/screen-agents/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Link>
          </Button>
        }
      />
      <ScreenAgentList initialAgents={initialAgents} organizationId={organizationId} />
    </div>
  )
}
