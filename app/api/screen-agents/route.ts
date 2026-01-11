import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  createScreenAgent,
  type CreateScreenAgentData,
  listScreenAgents,
} from "@/lib/screen-agents/manager"
import { checkUsageLimit } from "@/lib/usage/limits"
import { errorResponse, successResponse } from "@/lib/utils/api-response"
import { createScreenAgentSchema, validateRequest } from "@/lib/utils/validation"

// GET /api/screen-agents - List screen agents
export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("Unauthorized", 401)
    }

    const { searchParams } = new URL(req.url)
    const organizationId = searchParams.get("organizationId") || undefined
    const teamId = searchParams.get("teamId") || undefined
    const status = searchParams.get("status") || undefined
    const visibility = searchParams.get("visibility") || undefined
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    // If no organizationId specified, filter by owner only
    const ownerId = organizationId ? undefined : session.user.id

    const agents = await listScreenAgents({
      organizationId,
      teamId,
      ownerId,
      status: status as "draft" | "active" | "paused" | "archived" | undefined,
      visibility: visibility as
        | "private"
        | "team"
        | "organization"
        | "public"
        | undefined,
      limit,
      offset,
    })

    return successResponse(agents.map((agent) => ({
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
      shareableToken: agent.shareableToken,
      totalPresentationCount: agent.totalPresentationCount,
      totalViewerCount: agent.totalViewerCount,
      totalMinutesConsumed: agent.totalMinutesConsumed,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    })))
  } catch (error: unknown) {
    console.error("List screen agents error:", error)
    const message = error instanceof Error ? error.message : "Failed to list screen agents"
    return errorResponse(message, 500)
  }
}

// POST /api/screen-agents - Create screen agent
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return errorResponse("Unauthorized", 401)
    }

    const body = (await req.json()) as CreateScreenAgentData & {
      organizationId?: string
    }

    // Validate request body
    const validation = await validateRequest(createScreenAgentSchema, body)
    if (!validation.success) {
      return errorResponse("Validation failed", 400, {
        errors: validation.error.issues,
      })
    }

    const { organizationId } = body

    if (!organizationId) {
      return errorResponse("organizationId is required", 400)
    }

    // TODO: Verify user has access to organization
    // For now, we'll allow creation if organizationId is provided
    // In production, check Better Auth organization membership

    // Check usage limits before creating
    const limitCheck = await checkUsageLimit(validation.data.organizationId, "screen_agents", 1)
    if (!limitCheck.allowed) {
      return errorResponse("Screen agent limit reached", 403, {
        remaining: limitCheck.remaining,
      })
    }

    const agentData: CreateScreenAgentData = {
      name: validation.data.name,
      description: validation.data.description,
      ownerId: session.user.id,
      organizationId: validation.data.organizationId,
      teamId: validation.data.teamId,
      visibility: validation.data.visibility,
      targetWebsiteUrl: validation.data.targetWebsiteUrl,
      websiteCredentials: validation.data.websiteCredentials,
      voiceConfig: validation.data.voiceConfig,
      conversationConfig: validation.data.conversationConfig,
      knowledgeDocumentIds: validation.data.knowledgeDocumentIds,
      domainRestrictions: validation.data.domainRestrictions,
      sessionTimeoutMinutes: validation.data.sessionTimeoutMinutes,
      maxSessionDurationMinutes: validation.data.maxSessionDurationMinutes,
    }

    const agent = await createScreenAgent(agentData)

    return successResponse(
      {
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
        shareableToken: agent.shareableToken,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      },
      undefined,
      201
    )
  } catch (error: unknown) {
    console.error("Create screen agent error:", error)
    const message = error instanceof Error ? error.message : "Failed to create screen agent"
    return errorResponse(message, 500)
  }
}
