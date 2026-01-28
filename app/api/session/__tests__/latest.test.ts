import { NextRequest } from "next/server"
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

vi.mock("@/lib/models", () => ({
  Session: {
    findOne: vi.fn(),
  },
  Message: {
    countDocuments: vi.fn().mockResolvedValue(0),
  },
}))

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

    const { Session } = await import("@/lib/models")
    vi.mocked(Session.findOne).mockResolvedValue(null)

    const request = new NextRequest("http://localhost/api/session/latest")

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.success).toBe(false)
    expect(data.code).toBe("SESSION_NOT_FOUND")
  })
})
