import { Plus } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ScreenAgentList } from "@/components/screen-agents/screen-agent-list"
import { PageShell } from "@/components/shell/page-shell"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { listScreenAgents } from "@/lib/screen-agents/manager"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

export default async function ScreenAgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Get tenant state and organization ID
  const tenantState = await getTenantState(session.user.id)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }

  // In normal mode, use user ID; in organization mode, use organization ID
  const agentsOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  const agents = await listScreenAgents({
    organizationId: agentsOrgId,
    ownerId: tenantState === "normal" ? session.user.id : undefined,
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
    <PageShell
      title="Screen Agents"
      description="Manage your interactive screen presentation agents"
      action={
        <Button asChild size="sm">
          <Link href="/screen-agents/new">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Create Agent
          </Link>
        </Button>
      }
    >
      <ScreenAgentList initialAgents={initialAgents} organizationId={agentsOrgId} />
    </PageShell>
  )
}
