/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"
import { getUserNotifications, markNotificationAsRead } from "@/lib/notifications/manager"
import { GET, POST } from "../notifications/route"

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock("@/lib/notifications/manager", () => ({
  getUserNotifications: vi.fn(),
  markNotificationAsRead: vi.fn(),
}))

describe("Notifications API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("GET /api/notifications", () => {
    it("should return notifications", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any)

      const mockNotifications = [
        {
          _id: "notif-1",
          type: "session_completed",
          title: "Test",
          message: "Test message",
          metadata: {},
          channels: ["in_app"],
          status: "read",
          sentAt: new Date(),
          readAt: new Date(),
          createdAt: new Date(),
        },
      ]

      vi.mocked(getUserNotifications).mockResolvedValue(mockNotifications as any)

      const request = new Request("http://localhost/api/notifications")
      const response = await GET(request)
      const data = (await response.json()) as { notifications?: unknown[] }

      expect(response.status).toBe(200)
      expect(data.notifications).toHaveLength(1)
    })

    it("should filter notifications by status", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any)

      const request = new Request("http://localhost/api/notifications?status=read")
      await GET(request)

      expect(getUserNotifications).toHaveBeenCalledWith(
        "user-123",
        expect.objectContaining({ status: "read" })
      )
    })
  })

  describe("POST /api/notifications", () => {
    it("should mark notification as read", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any)

      const mockNotification = {
        _id: "notif-1",
        userId: "user-123",
        type: "session_completed",
        title: "Test",
        message: "Test message",
        metadata: {},
        channels: ["in_app"],
        status: "read",
        sentAt: new Date(),
        readAt: new Date(),
        createdAt: new Date(),
      }

      vi.mocked(markNotificationAsRead).mockResolvedValue(mockNotification as any)

      const request = new Request("http://localhost/api/notifications", {
        method: "POST",
        body: JSON.stringify({ notificationId: "notif-1" }),
      })

      const response = await POST(request)
      const data = (await response.json()) as { notification?: { id: string; status: string } }

      expect(response.status).toBe(200)
      expect(data.notification?.status).toBe("read")
      expect(markNotificationAsRead).toHaveBeenCalledWith("notif-1")
    })

    it("should return 400 if notificationId is missing", async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { id: "user-123" },
      } as any)

      const request = new Request("http://localhost/api/notifications", {
        method: "POST",
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      const data = (await response.json()) as { error?: string }

      expect(response.status).toBe(400)
      expect(data.error).toBe("notificationId is required")
    })
  })
})
