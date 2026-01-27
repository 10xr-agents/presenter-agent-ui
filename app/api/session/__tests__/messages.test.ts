import { describe, it, expect, beforeEach, vi } from "vitest"
import { GET } from "../[sessionId]/messages/route"
import { NextRequest } from "next/server"
import { getSessionFromRequest } from "@/lib/auth/session"

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

vi.mock("@/lib/models", () => ({
  Session: {
    findOne: vi.fn(),
  },
  Message: {
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}))

describe("GET /api/session/[sessionId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return 401 if session is missing", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue(null)

    const request = new NextRequest("http://localhost/api/session/test-session-id/messages")
    const context = { params: Promise.resolve({ sessionId: "test-session-id" }) }

    const response = await GET(request, context)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.success).toBe(false)
    expect(data.code).toBe("UNAUTHORIZED")
  })

  it("should return 400 if sessionId format is invalid", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue({
      userId: "user-123",
      tenantId: "tenant-123",
    })

    const request = new NextRequest("http://localhost/api/session/invalid-id/messages")
    const context = { params: Promise.resolve({ sessionId: "invalid-id" }) }

    const response = await GET(request, context)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.code).toBe("VALIDATION_ERROR")
  })
})
