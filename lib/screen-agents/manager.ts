import { randomBytes } from "crypto"
import { connectDB } from "@/lib/db/mongoose"
import { IScreenAgent, ScreenAgent } from "@/lib/models/screen-agent"
import { getImplicitVisibility } from "@/lib/screen-agents/visibility"

export interface CreateScreenAgentData {
  name: string
  description: string
  ownerId: string
  organizationId: string
  teamId?: string
  // Visibility is implicit and determined by tenant mode - do not expose in API
  targetWebsiteUrl: string
  websiteCredentials?: {
    username: string
    password: string
  }
  loginNotes?: string
  voiceConfig?: {
    provider: "elevenlabs" | "openai" | "cartesia"
    voiceId: string
    language: string
    speechRate?: number
    pitch?: number
  }
  conversationConfig?: {
    personalityPrompt?: string
    welcomeMessage?: string
    fallbackResponse?: string
    guardrails?: string[]
  }
  knowledgeDocumentIds?: string[]
  domainRestrictions?: string[]
  sessionTimeoutMinutes?: number
  maxSessionDurationMinutes?: number
}

export interface UpdateScreenAgentData {
  name?: string
  description?: string
  visibility?: "private" | "team" | "organization" | "public"
  targetWebsiteUrl?: string
  websiteCredentials?: {
    username: string
    password: string
  }
  loginNotes?: string
  voiceConfig?: {
    provider?: "elevenlabs" | "openai" | "cartesia"
    voiceId?: string
    language?: string
    speechRate?: number
    pitch?: number
  }
  conversationConfig?: {
    personalityPrompt?: string
    welcomeMessage?: string
    fallbackResponse?: string
    guardrails?: string[]
  }
  knowledgeDocumentIds?: string[]
  domainRestrictions?: string[]
  sessionTimeoutMinutes?: number
  maxSessionDurationMinutes?: number
}

// Generate unique shareable token
function generateShareableToken(): string {
  return randomBytes(32).toString("hex")
}

// Create a new Screen Agent
export async function createScreenAgent(
  data: CreateScreenAgentData
): Promise<IScreenAgent> {
  await connectDB()

  const shareableToken = generateShareableToken()

  // Determine implicit visibility based on tenant mode
  // Visibility is inferred, not configured
  const implicitVisibility = await getImplicitVisibility(data.ownerId, data.teamId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = await (ScreenAgent as any).create({
    name: data.name,
    description: data.description,
    ownerId: data.ownerId,
    organizationId: data.organizationId,
    teamId: data.teamId,
    visibility: implicitVisibility,
    status: "draft",
    targetWebsiteUrl: data.targetWebsiteUrl,
    websiteCredentials: data.websiteCredentials
      ? {
          username: data.websiteCredentials.username,
          password: data.websiteCredentials.password, // Will be encrypted in application layer
        }
      : undefined,
    loginNotes: data.loginNotes,
    voiceConfig: data.voiceConfig ?? {
      provider: "openai",
      voiceId: "alloy",
      language: "en",
      speechRate: 1.0,
      pitch: 0,
    },
    conversationConfig: data.conversationConfig,
    knowledgeDocumentIds: data.knowledgeDocumentIds || [],
    domainRestrictions: data.domainRestrictions,
    sessionTimeoutMinutes: data.sessionTimeoutMinutes || 60,
    maxSessionDurationMinutes: data.maxSessionDurationMinutes || 120,
    shareableToken,
    linkUseCount: 0,
    totalPresentationCount: 0,
    totalViewerCount: 0,
    totalMinutesConsumed: 0,
    averageSessionDuration: 0,
    completionRate: 0,
    viewerAuthRequired: false,
    dataCollectionConsent: false,
    recordingEnabled: true,
  })

  return agent
}

// Get Screen Agent by ID
export async function getScreenAgentById(id: string): Promise<IScreenAgent | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ScreenAgent as any).findById(id)
}

// Get Screen Agent by shareable token
export async function getScreenAgentByToken(
  token: string
): Promise<IScreenAgent | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ScreenAgent as any).findOne({ shareableToken: token, status: "active" })
}

// List Screen Agents
export async function listScreenAgents(options: {
  organizationId?: string
  teamId?: string
  ownerId?: string
  status?: "draft" | "active" | "paused" | "archived"
  visibility?: "private" | "team" | "organization" | "public"
  limit?: number
  offset?: number
}): Promise<IScreenAgent[]> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {}

  if (options.organizationId) {
    query.organizationId = options.organizationId
  }

  if (options.teamId) {
    query.teamId = options.teamId
  }

  if (options.ownerId) {
    query.ownerId = options.ownerId
  }

  if (options.status) {
    query.status = options.status
  }

  if (options.visibility) {
    query.visibility = options.visibility
  }

  const limit = options.limit || 50
  const offset = options.offset || 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ScreenAgent as any)
    .find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset)
}

// Update Screen Agent
export async function updateScreenAgent(
  id: string,
  data: UpdateScreenAgentData
): Promise<IScreenAgent | null> {
  await connectDB()

  // Remove visibility from update data - it's implicit and not configurable
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { visibility, ...updateData } = data as UpdateScreenAgentData & { visibility?: string }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = await (ScreenAgent as any).findByIdAndUpdate(
    id,
    {
      $set: updateData,
    },
    { new: true }
  )

  return agent
}

// Delete Screen Agent
export async function deleteScreenAgent(id: string): Promise<boolean> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (ScreenAgent as any).deleteOne({ _id: id })

  return result.deletedCount === 1
}

// Publish Screen Agent (change status to active)
export async function publishScreenAgent(id: string): Promise<IScreenAgent | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = await (ScreenAgent as any).findByIdAndUpdate(
    id,
    {
      $set: {
        status: "active",
        lastActivatedAt: new Date(),
      },
    },
    { new: true }
  )

  return agent
}

// Pause Screen Agent (change status to paused)
export async function pauseScreenAgent(id: string): Promise<IScreenAgent | null> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = await (ScreenAgent as any).findByIdAndUpdate(
    id,
    {
      $set: {
        status: "paused",
      },
    },
    { new: true }
  )

  return agent
}

// Check if user has access to Screen Agent
export async function hasScreenAgentAccess(
  agentId: string,
  userId: string,
  organizationId?: string
): Promise<boolean> {
  await connectDB()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agent = await (ScreenAgent as any).findById(agentId)

  if (!agent) {
    return false
  }

  // Owner always has access
  if (agent.ownerId === userId) {
    return true
  }

  // Organization check
  if (organizationId && agent.organizationId === organizationId) {
    // If organization visibility, all org members have access
    if (agent.visibility === "organization" || agent.visibility === "public") {
      return true
    }
  }

  // Public agents are accessible to everyone
  if (agent.visibility === "public") {
    return true
  }

  return false
}
