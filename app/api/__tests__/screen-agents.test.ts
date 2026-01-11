import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

// Mock screen agent manager
vi.mock("@/lib/screen-agents/manager", () => ({
  createScreenAgent: vi.fn(),
  getScreenAgentById: vi.fn(),
  listScreenAgents: vi.fn(),
  updateScreenAgent: vi.fn(),
  deleteScreenAgent: vi.fn(),
  publishScreenAgent: vi.fn(),
  pauseScreenAgent: vi.fn(),
  hasScreenAgentAccess: vi.fn(),
}))

// Mock validation
vi.mock("@/lib/utils/validation", () => ({
  createScreenAgentSchema: {},
  updateScreenAgentSchema: {},
  validateRequest: vi.fn(),
}))

import { auth } from "@/lib/auth"
import * as manager from "@/lib/screen-agents/manager"
import { validateRequest } from "@/lib/utils/validation"
import { POST as POSTPause } from "../screen-agents/[id]/pause/route"
import { POST as POSTPublish } from "../screen-agents/[id]/publish/route"
import { DELETE, GET as GETById, PATCH } from "../screen-agents/[id]/route"
import { GET as GETShare } from "../screen-agents/[id]/share/route"
import { GET, POST } from "../screen-agents/route"

describe("Screen Agents API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockSession = {
    user: {
      id: "user-123",
      email: "test@example.com",
    },
  }

  describe("GET /api/screen-agents", () => {
    it("should return 401 if not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null)

      const req = new NextRequest("http://localhost:3000/api/screen-agents")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
      expect(data.error).toBe("Unauthorized")
    })

    it("should list screen agents when authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
      vi.mocked(manager.listScreenAgents).mockResolvedValue([
        {
          _id: { toString: () => "agent-123" },
          name: "Test Agent",
          organizationId: "org-123",
          ownerId: "user-123",
          visibility: "private",
          status: "draft",
          shareableToken: "token-123",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never,
      ])

      const req = new NextRequest("http://localhost:3000/api/screen-agents")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data).toBeDefined()
      expect(Array.isArray(data.data)).toBe(true)
    })
  })

  describe("POST /api/screen-agents", () => {
    it("should return 401 if not authenticated", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null)

      const req = new NextRequest("http://localhost:3000/api/screen-agents", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Agent",
          organizationId: "org-123",
          targetWebsiteUrl: "https://example.com",
          voiceConfig: {
            provider: "openai",
            voiceId: "alloy",
            language: "en",
          },
        }),
      })
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.success).toBe(false)
    })

    it("should create screen agent when valid data provided", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
      vi.mocked(validateRequest).mockResolvedValue({
        success: true,
        data: {
          name: "Test Agent",
          organizationId: "org-123",
          targetWebsiteUrl: "https://example.com",
          voiceConfig: {
            provider: "openai",
            voiceId: "alloy",
            language: "en",
          },
        },
      })
      vi.mocked(manager.createScreenAgent).mockResolvedValue({
        _id: { toString: () => "agent-123" },
        name: "Test Agent",
        organizationId: "org-123",
        ownerId: "user-123",
        visibility: "private",
        status: "draft",
        shareableToken: "token-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)

      const req = new NextRequest("http://localhost:3000/api/screen-agents", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Agent",
          organizationId: "org-123",
          targetWebsiteUrl: "https://example.com",
          voiceConfig: {
            provider: "openai",
            voiceId: "alloy",
            language: "en",
          },
        }),
      })
      const response = await POST(req)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.data).toBeDefined()
      expect(data.data.name).toBe("Test Agent")
    })
  })

  describe("GET /api/screen-agents/[id]", () => {
    it("should return 404 if agent not found", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
      vi.mocked(manager.getScreenAgentById).mockResolvedValue(null)
      vi.mocked(manager.hasScreenAgentAccess).mockResolvedValue(false)

      const req = new NextRequest("http://localhost:3000/api/screen-agents/agent-123")
      const params = Promise.resolve({ id: "agent-123" })
      const response = await GETById(req, { params })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toBe("Screen agent not found")
    })
  })

  describe("POST /api/screen-agents/[id]/publish", () => {
    it("should return 403 if user is not owner", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
      vi.mocked(manager.getScreenAgentById).mockResolvedValue({
        _id: { toString: () => "agent-123" },
        ownerId: "other-user",
        status: "draft",
      } as never)

      const req = new NextRequest("http://localhost:3000/api/screen-agents/agent-123/publish", {
        method: "POST",
      })
      const params = Promise.resolve({ id: "agent-123" })
      const response = await POSTPublish(req, { params })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
    })
  })

  describe("POST /api/screen-agents/[id]/pause", () => {
    it("should return 400 if agent is not active", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
      vi.mocked(manager.getScreenAgentById).mockResolvedValue({
        _id: { toString: () => "agent-123" },
        ownerId: "user-123",
        status: "draft",
      } as never)

      const req = new NextRequest("http://localhost:3000/api/screen-agents/agent-123/pause", {
        method: "POST",
      })
      const params = Promise.resolve({ id: "agent-123" })
      const response = await POSTPause(req, { params })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe("Only active agents can be paused")
    })
  })

  describe("GET /api/screen-agents/[id]/share", () => {
    it("should return share link for owner", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(mockSession as never)
      vi.mocked(manager.getScreenAgentById).mockResolvedValue({
        _id: { toString: () => "agent-123" },
        ownerId: "user-123",
        shareableToken: "token-123",
        status: "active",
      } as never)

      const req = new NextRequest("http://localhost:3000/api/screen-agents/agent-123/share")
      const params = Promise.resolve({ id: "agent-123" })
      const response = await GETShare(req, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.shareableToken).toBe("token-123")
      expect(data.data.shareUrl).toBeDefined()
    })
  })
})
