import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getScreenAgentById, getScreenAgentByToken } from "@/lib/screen-agents/manager"
import { errorResponse, successResponse } from "@/lib/utils/api-response"

// GET /api/screen-agents/[id]/share - Get shareable link
export async function GET(
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

    // Only owner can get share link
    if (agent.ownerId !== session.user.id) {
      return errorResponse("Forbidden", 403)
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000"
    const shareUrl = `${baseUrl}/present/${agent.shareableToken}`

    return successResponse({
      shareableToken: agent.shareableToken,
      shareUrl,
      linkExpirationDate: agent.linkExpirationDate,
      linkMaxUses: agent.linkMaxUses,
      linkUseCount: agent.linkUseCount,
      status: agent.status,
    })
  } catch (error: unknown) {
    console.error("Get share link error:", error)
    const message = error instanceof Error ? error.message : "Failed to get share link"
    return errorResponse(message, 500)
  }
}

// GET /api/screen-agents/share/[token] - Get screen agent by shareable token (public endpoint)
export async function GETByToken(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // This endpoint is public - no authentication required
    const { token } = await params

    const agent = await getScreenAgentByToken(token)

    if (!agent) {
      return errorResponse("Screen agent not found or not available", 404)
    }

    // Check if link has expired
    if (agent.linkExpirationDate && agent.linkExpirationDate < new Date()) {
      return errorResponse("Share link has expired", 410)
    }

    // Check if link has reached max uses
    if (agent.linkMaxUses && agent.linkUseCount >= agent.linkMaxUses) {
      return errorResponse("Share link has reached maximum uses", 410)
    }

    // Return minimal public information
    return successResponse({
      id: agent._id.toString(),
      name: agent.name,
      description: agent.description,
      status: agent.status,
      shareableToken: agent.shareableToken,
    })
  } catch (error: unknown) {
    console.error("Get screen agent by token error:", error)
    const message = error instanceof Error ? error.message : "Failed to get screen agent"
    return errorResponse(message, 500)
  }
}
