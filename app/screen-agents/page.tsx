import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ScreenAgentList } from "@/components/screen-agents/screen-agent-list"
import { auth } from "@/lib/auth"
import { listScreenAgents } from "@/lib/screen-agents/manager"

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
    <div className="container mx-auto py-8">
      <ScreenAgentList initialAgents={initialAgents} organizationId={organizationId} />
    </div>
  )
}
