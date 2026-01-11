import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getScreenAgentById, pauseScreenAgent } from "@/lib/screen-agents/manager"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// POST /api/screen-agents/[id]/pause - Pause screen agent
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

    // Only owner can pause
    if (agent.ownerId !== session.user.id) {
      return errorResponse("Forbidden", 403)
    }

    // Can only pause active agents
    if (agent.status !== "active") {
      return errorResponse("Only active agents can be paused", 400)
    }

    const pausedAgent = await pauseScreenAgent(id)

    if (!pausedAgent) {
      return errorResponse("Failed to pause screen agent", 500)
    }

    return successResponse({
      id: pausedAgent._id.toString(),
      name: pausedAgent.name,
      status: pausedAgent.status,
    })
  } catch (error: unknown) {
    console.error("Pause screen agent error:", error)
    const message = error instanceof Error ? error.message : "Failed to pause screen agent"
    return errorResponse(message, 500)
  }
}
