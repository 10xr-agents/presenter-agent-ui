import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  deleteScreenAgent,
  getScreenAgentById,
  hasScreenAgentAccess,
  updateScreenAgent,
  type UpdateScreenAgentData,
} from "@/lib/screen-agents/manager"
import { errorResponse, successResponse } from "@/lib/utils/api-response"
import { updateScreenAgentSchema, validateRequest } from "@/lib/utils/validation"

// GET /api/screen-agents/[id] - Get screen agent details
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

    // Check access permissions
    const hasAccess = await hasScreenAgentAccess(
      id,
      session.user.id,
      agent.organizationId
    )

    if (!hasAccess) {
      return errorResponse("Forbidden", 403)
    }

    return successResponse({
      id: agent._id.toString(),
      name: agent.name,
      description: agent.description,
      ownerId: agent.ownerId,
      organizationId: agent.organizationId,
      teamId: agent.teamId,
      visibility: agent.visibility,
      status: agent.status,
      targetWebsiteUrl: agent.targetWebsiteUrl,
      voiceConfig: agent.voiceConfig,
      conversationConfig: agent.conversationConfig,
      knowledgeDocumentIds: agent.knowledgeDocumentIds,
      domainRestrictions: agent.domainRestrictions,
      sessionTimeoutMinutes: agent.sessionTimeoutMinutes,
      maxSessionDurationMinutes: agent.maxSessionDurationMinutes,
      shareableToken: agent.shareableToken,
      linkExpirationDate: agent.linkExpirationDate,
      linkMaxUses: agent.linkMaxUses,
      linkUseCount: agent.linkUseCount,
      totalPresentationCount: agent.totalPresentationCount,
      totalViewerCount: agent.totalViewerCount,
      totalMinutesConsumed: agent.totalMinutesConsumed,
      averageSessionDuration: agent.averageSessionDuration,
      completionRate: agent.completionRate,
      viewerSatisfactionScore: agent.viewerSatisfactionScore,
      lastActivatedAt: agent.lastActivatedAt,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    })
  } catch (error: unknown) {
    console.error("Get screen agent error:", error)
    const message = error instanceof Error ? error.message : "Failed to get screen agent"
    return errorResponse(message, 500)
  }
}

// PATCH /api/screen-agents/[id] - Update screen agent
export async function PATCH(
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

    // Only owner can update
    if (agent.ownerId !== session.user.id) {
      return errorResponse("Forbidden", 403)
    }

    const body = (await req.json()) as UpdateScreenAgentData

    // Validate request body
    const validation = await validateRequest(updateScreenAgentSchema, body)
    if (!validation.success) {
      return errorResponse("Validation failed", 400, {
        errors: validation.error.issues,
      })
    }

    const updatedAgent = await updateScreenAgent(id, validation.data)

    if (!updatedAgent) {
      return errorResponse("Failed to update screen agent", 500)
    }

    return successResponse({
      id: updatedAgent._id.toString(),
      name: updatedAgent.name,
      description: updatedAgent.description,
      ownerId: updatedAgent.ownerId,
      organizationId: updatedAgent.organizationId,
      teamId: updatedAgent.teamId,
      visibility: updatedAgent.visibility,
      status: updatedAgent.status,
      targetWebsiteUrl: updatedAgent.targetWebsiteUrl,
      voiceConfig: updatedAgent.voiceConfig,
      shareableToken: updatedAgent.shareableToken,
      updatedAt: updatedAgent.updatedAt,
    })
  } catch (error: unknown) {
    console.error("Update screen agent error:", error)
    const message = error instanceof Error ? error.message : "Failed to update screen agent"
    return errorResponse(message, 500)
  }
}

// DELETE /api/screen-agents/[id] - Delete screen agent
export async function DELETE(
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

    // Only owner can delete
    if (agent.ownerId !== session.user.id) {
      return errorResponse("Forbidden", 403)
    }

    const deleted = await deleteScreenAgent(id)

    if (!deleted) {
      return errorResponse("Failed to delete screen agent", 500)
    }

    return successResponse({ success: true })
  } catch (error: unknown) {
    console.error("Delete screen agent error:", error)
    const message = error instanceof Error ? error.message : "Failed to delete screen agent"
    return errorResponse(message, 500)
  }
}
