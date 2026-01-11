import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { ScreenAgentDetail } from "@/components/screen-agents/screen-agent-detail"
import { auth } from "@/lib/auth"
import { getScreenAgentById, hasScreenAgentAccess } from "@/lib/screen-agents/manager"

export default async function ScreenAgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const { id } = await params

  const agent = await getScreenAgentById(id)

  if (!agent) {
    notFound()
  }

  // Check access permissions
  const hasAccess = await hasScreenAgentAccess(id, session.user.id, agent.organizationId)

  if (!hasAccess) {
    redirect("/screen-agents")
  }

  const agentData = {
    id: agent._id.toString(),
    name: agent.name,
    description: agent.description,
    status: agent.status,
    visibility: agent.visibility,
    targetWebsiteUrl: agent.targetWebsiteUrl,
    voiceConfig: agent.voiceConfig,
    totalPresentationCount: agent.totalPresentationCount,
    totalViewerCount: agent.totalViewerCount,
    totalMinutesConsumed: agent.totalMinutesConsumed,
    averageSessionDuration: agent.averageSessionDuration,
    completionRate: agent.completionRate,
    shareableToken: agent.shareableToken,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  }

  return (
    <div className="container mx-auto py-8">
      <ScreenAgentDetail agent={agentData} />
    </div>
  )
}
