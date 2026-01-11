import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getScreenAgentById, publishScreenAgent } from "@/lib/screen-agents/manager"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// POST /api/screen-agents/[id]/publish - Publish screen agent
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("Unauthorized", 401)
    }

    const { id } = await params

    const agent = await getScreenAgentById(id)

    if (!agent) {
      return errorResponse("Screen agent not found", 404)
    }

    // Only owner can publish
    if (agent.ownerId !== session.user.id) {
      return errorResponse("Forbidden", 403)
    }

    // Can only publish draft agents
    if (agent.status !== "draft") {
      return errorResponse("Only draft agents can be published", 400)
    }

    const publishedAgent = await publishScreenAgent(id)

    if (!publishedAgent) {
      return errorResponse("Failed to publish screen agent", 500)
    }

    return successResponse({
      id: publishedAgent._id.toString(),
      name: publishedAgent.name,
      status: publishedAgent.status,
      shareableToken: publishedAgent.shareableToken,
      lastActivatedAt: publishedAgent.lastActivatedAt,
    })
  } catch (error: unknown) {
    console.error("Publish screen agent error:", error)
    const message = error instanceof Error ? error.message : "Failed to publish screen agent"
    return errorResponse(message, 500)
  }
}
