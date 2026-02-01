import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getSessionFromRequest } from "@/lib/auth/session"
import { POST } from "../interact/route"

// Mock dependencies
vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: vi.fn(),
}))

vi.mock("@/lib/middleware/rate-limit", () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/db/mongoose", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/utils/debug-logger", () => ({
  createDebugLog: vi.fn().mockResolvedValue(undefined),
  extractHeaders: vi.fn().mockReturnValue({}),
}))

vi.mock("@/lib/pusher/server", () => ({
  triggerInteractResponse: vi.fn().mockResolvedValue(undefined),
  triggerNewMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/knowledge-extraction/rag-helper", () => ({
  getRAGChunks: vi.fn().mockResolvedValue({ chunks: [], hasOrgKnowledge: false, duration: 0 }),
}))

vi.mock("@/lib/agent/graph/route-integration", () => ({
  runInteractGraph: vi.fn().mockResolvedValue({
    success: true,
    taskId: "test-task-id",
    isNewTask: true,
    thought: "Test thought",
    action: "click(1)",
    currentStepIndex: 0,
    webSearchPerformed: false,
    complexity: "simple",
    complexityReason: "test",
    status: "executing",
    graphDuration: 100,
  }),
}))

vi.mock("@/lib/models", () => ({
  Task: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
  TaskAction: {
    create: vi.fn(),
  },
  Session: {
    findOne: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    }),
    findOneAndUpdate: vi.fn().mockResolvedValue({
      sessionId: "test-session-id",
      userId: "user-123",
      tenantId: "tenant-123",
    }),
    create: vi.fn(),
  },
  Message: {
    create: vi.fn().mockResolvedValue({
      _id: "msg-1",
      messageId: "msg-1",
    }),
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}))

describe("POST /api/agent/interact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return 401 if session is missing", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue(null)

    const request = new NextRequest("http://localhost/api/agent/interact", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com",
        query: "Click the button",
        dom: "<html><body>Test</body></html>",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.success).toBe(false)
    expect(data.code).toBe("UNAUTHORIZED")
  })

  it("should return 400 if request body is invalid", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue({
      userId: "user-123",
      tenantId: "tenant-123",
    })

    const request = new NextRequest("http://localhost/api/agent/interact", {
      method: "POST",
      body: JSON.stringify({
        // Missing required fields
        url: "https://example.com",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.code).toBe("VALIDATION_ERROR")
  })

  it("should return 400 if URL is invalid", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue({
      userId: "user-123",
      tenantId: "tenant-123",
    })

    const request = new NextRequest("http://localhost/api/agent/interact", {
      method: "POST",
      body: JSON.stringify({
        url: "not-a-valid-url",
        query: "Click the button",
        dom: "<html><body>Test</body></html>",
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
  })
})
