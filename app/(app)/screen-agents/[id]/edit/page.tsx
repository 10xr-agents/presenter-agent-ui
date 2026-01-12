import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { EditForm } from "@/components/screen-agents/edit-form"
import { auth } from "@/lib/auth"
import { getScreenAgentById, hasScreenAgentAccess } from "@/lib/screen-agents/manager"

export default async function EditScreenAgentPage({
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

  // Only owner can edit
  if (agent.ownerId !== session.user.id) {
    redirect(`/screen-agents/${id}`)
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
    visibility: agent.visibility,
    targetWebsiteUrl: agent.targetWebsiteUrl,
    voiceConfig: agent.voiceConfig,
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Edit Screen Agent</h1>
        <p className="mt-0.5 text-sm text-foreground">
          Update your Screen Agent configuration
        </p>
      </div>
      <EditForm agent={agentData} />
    </div>
  )
}
