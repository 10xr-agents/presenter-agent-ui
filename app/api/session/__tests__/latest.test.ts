import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getSessionFromRequest } from "@/lib/auth/session"
import { GET } from "../latest/route"

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

vi.mock("@/lib/utils/cors", () => ({
  addCorsHeaders: vi.fn((_req, res) => res),
  handleCorsPreflight: vi.fn().mockReturnValue(null),
}))

vi.mock("@/lib/utils/error-debug", () => ({
  buildErrorDebugInfo: vi.fn().mockReturnValue({ timestamp: Date.now() }),
}))

vi.mock("@/lib/models", () => {
  // Helper to create chainable mock (defined inside factory to avoid hoisting issues)
  const createChainableMock = (returnValue: unknown) => {
    const chainable = {
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(returnValue),
    }
    return vi.fn().mockReturnValue(chainable)
  }

  return {
    Session: {
      findOne: createChainableMock(null),
    },
    Message: {
      countDocuments: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(0),
      }),
    },
  }
})

describe("GET /api/session/latest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return 401 if session is missing", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue(null)

    const request = new NextRequest("http://localhost/api/session/latest")

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.success).toBe(false)
    expect(data.code).toBe("UNAUTHORIZED")
  })

  it("should return 404 if no session found", async () => {
    vi.mocked(getSessionFromRequest).mockResolvedValue({
      userId: "user-123",
      tenantId: "tenant-123",
    })

    // Session.findOne already returns chainable mock with null result from module mock

    const request = new NextRequest("http://localhost/api/session/latest")

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.code).toBe("SESSION_NOT_FOUND")
  })
})
