import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ScreenAgentAnalytics } from "@/components/analytics/screen-agent-analytics"
import { auth } from "@/lib/auth"
import { getScreenAgentById, hasScreenAgentAccess } from "@/lib/screen-agents/manager"

export default async function ScreenAgentAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  const { id } = await params

  try {
    // Verify screen agent exists and user has access
    const screenAgent = await getScreenAgentById(id)
    if (!screenAgent) {
      redirect("/screen-agents")
    }

    const hasAccess = await hasScreenAgentAccess(
      id,
      session.user.id,
      screenAgent.organizationId
    )

    if (!hasAccess) {
      redirect("/screen-agents")
    }

    return (
      <div className="container mx-auto py-8">
        <ScreenAgentAnalytics screenAgentId={id} />
      </div>
    )
  } catch (error: unknown) {
    console.error("Screen agent analytics page error:", error)
    redirect("/screen-agents")
  }
}
