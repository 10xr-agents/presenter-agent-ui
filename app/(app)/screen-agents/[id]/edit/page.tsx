import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { EditForm } from "@/components/screen-agents/edit-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    <div className="container mx-auto py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Screen Agent</h1>
          <p className="text-muted-foreground mt-1">
            Update your Screen Agent configuration
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Agent Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <EditForm agent={agentData} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
