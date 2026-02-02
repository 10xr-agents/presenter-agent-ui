/**
 * Memory Service Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock mongoose models
vi.mock("@/lib/db/mongoose", () => ({
  connectDB: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/models/task", () => ({
  Task: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
}))

vi.mock("@/lib/models/session", () => ({
  BrowserSession: {
    findOneAndUpdate: vi.fn(),
    findOne: vi.fn(),
  },
}))

import { Task } from "@/lib/models/task"
import { BrowserSession } from "@/lib/models/session"
import {
  taskRemember,
  taskRecall,
  taskRecallAll,
  sessionRecall,
  sessionRecallAll,
  exportToSessionMemory,
  sessionRemember,
  taskForget,
  sessionForget,
} from "./memory-service"

describe("Memory Service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("taskRemember", () => {
    it("should store a value in task memory", async () => {
      const mockTask = { taskId: "task-123", memory: { testKey: "testValue" } }
      ;(Task as any).findOneAndUpdate.mockResolvedValue(mockTask)

      const result = await taskRemember("task-123", "testKey", "testValue")

      expect(result.success).toBe(true)
      expect(result.value).toBe("testValue")
      expect((Task as any).findOneAndUpdate).toHaveBeenCalledWith(
        { taskId: "task-123" },
        { $set: { "memory.testKey": "testValue" } },
        { new: true }
      )
    })

    it("should return error if task not found", async () => {
      ;(Task as any).findOneAndUpdate.mockResolvedValue(null)

      const result = await taskRemember("nonexistent", "key", "value")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Task not found")
    })

    it("should handle complex values (arrays, objects)", async () => {
      const complexValue = { items: [1, 2, 3], meta: { count: 3 } }
      const mockTask = { taskId: "task-123", memory: { data: complexValue } }
      ;(Task as any).findOneAndUpdate.mockResolvedValue(mockTask)

      const result = await taskRemember("task-123", "data", complexValue)

      expect(result.success).toBe(true)
      expect(result.value).toEqual(complexValue)
    })
  })

  describe("taskRecall", () => {
    it("should retrieve a value from task memory", async () => {
      const mockTask = { taskId: "task-123", memory: { testKey: "testValue" } }
      ;(Task as any).findOne.mockResolvedValue(mockTask)

      const result = await taskRecall("task-123", "testKey")

      expect(result.success).toBe(true)
      expect(result.value).toBe("testValue")
    })

    it("should return null for non-existent key", async () => {
      const mockTask = { taskId: "task-123", memory: {} }
      ;(Task as any).findOne.mockResolvedValue(mockTask)

      const result = await taskRecall("task-123", "nonexistent")

      expect(result.success).toBe(true)
      expect(result.value).toBe(null)
    })

    it("should return error if task not found", async () => {
      ;(Task as any).findOne.mockResolvedValue(null)

      const result = await taskRecall("nonexistent", "key")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Task not found")
    })
  })

  describe("taskRecallAll", () => {
    it("should retrieve all task memory", async () => {
      const mockMemory = { key1: "value1", key2: [1, 2, 3] }
      const mockTask = { taskId: "task-123", memory: mockMemory }
      ;(Task as any).findOne.mockResolvedValue(mockTask)

      const result = await taskRecallAll("task-123")

      expect(result.success).toBe(true)
      expect(result.value).toEqual(mockMemory)
    })

    it("should return empty object for task with no memory", async () => {
      const mockTask = { taskId: "task-123", memory: undefined }
      ;(Task as any).findOne.mockResolvedValue(mockTask)

      const result = await taskRecallAll("task-123")

      expect(result.success).toBe(true)
      expect(result.value).toEqual({})
    })
  })

  describe("sessionRecall", () => {
    it("should retrieve a value from session memory", async () => {
      const mockSession = { sessionId: "session-123", memory: { testKey: "testValue" } }
      ;(BrowserSession as any).findOne.mockResolvedValue(mockSession)

      const result = await sessionRecall("session-123", "testKey")

      expect(result.success).toBe(true)
      expect(result.value).toBe("testValue")
    })

    it("should return error if session not found", async () => {
      ;(BrowserSession as any).findOne.mockResolvedValue(null)

      const result = await sessionRecall("nonexistent", "key")

      expect(result.success).toBe(false)
      expect(result.error).toContain("Session not found")
    })
  })

  describe("sessionRecallAll", () => {
    it("should retrieve all session memory", async () => {
      const mockMemory = { preference: "dark", savedData: { items: [] } }
      const mockSession = { sessionId: "session-123", memory: mockMemory }
      ;(BrowserSession as any).findOne.mockResolvedValue(mockSession)

      const result = await sessionRecallAll("session-123")

      expect(result.success).toBe(true)
      expect(result.value).toEqual(mockMemory)
    })
  })

  describe("exportToSessionMemory", () => {
    it("should export value from task to session memory", async () => {
      const mockTask = { taskId: "task-123", memory: { exportKey: "exportValue" } }
      const mockSession = { sessionId: "session-123", memory: { exportKey: "exportValue" } }

      ;(Task as any).findOne.mockResolvedValue(mockTask)
      ;(BrowserSession as any).findOneAndUpdate.mockResolvedValue(mockSession)

      const result = await exportToSessionMemory("session-123", "task-123", "exportKey")

      expect(result.success).toBe(true)
      expect(result.value).toBe("exportValue")
      expect((BrowserSession as any).findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: "session-123" },
        { $set: { "memory.exportKey": "exportValue" } },
        { new: true }
      )
    })

    it("should use custom sessionKey when provided", async () => {
      const mockTask = { taskId: "task-123", memory: { originalKey: "value" } }
      const mockSession = { sessionId: "session-123", memory: { customKey: "value" } }

      ;(Task as any).findOne.mockResolvedValue(mockTask)
      ;(BrowserSession as any).findOneAndUpdate.mockResolvedValue(mockSession)

      const result = await exportToSessionMemory(
        "session-123",
        "task-123",
        "originalKey",
        "customKey"
      )

      expect(result.success).toBe(true)
      expect((BrowserSession as any).findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: "session-123" },
        { $set: { "memory.customKey": "value" } },
        { new: true }
      )
    })

    it("should return error if key not found in task memory", async () => {
      const mockTask = { taskId: "task-123", memory: {} }
      ;(Task as any).findOne.mockResolvedValue(mockTask)

      const result = await exportToSessionMemory("session-123", "task-123", "nonexistent")

      expect(result.success).toBe(false)
      expect(result.error).toContain("not found in task memory")
    })
  })

  describe("sessionRemember", () => {
    it("should store a value in session memory", async () => {
      const mockSession = { sessionId: "session-123", memory: { key: "value" } }
      ;(BrowserSession as any).findOneAndUpdate.mockResolvedValue(mockSession)

      const result = await sessionRemember("session-123", "key", "value")

      expect(result.success).toBe(true)
      expect(result.value).toBe("value")
    })
  })

  describe("taskForget", () => {
    it("should remove a key from task memory", async () => {
      const mockTask = { taskId: "task-123", memory: {} }
      ;(Task as any).findOneAndUpdate.mockResolvedValue(mockTask)

      const result = await taskForget("task-123", "keyToRemove")

      expect(result.success).toBe(true)
      expect((Task as any).findOneAndUpdate).toHaveBeenCalledWith(
        { taskId: "task-123" },
        { $unset: { "memory.keyToRemove": 1 } },
        { new: true }
      )
    })
  })

  describe("sessionForget", () => {
    it("should remove a key from session memory", async () => {
      const mockSession = { sessionId: "session-123", memory: {} }
      ;(BrowserSession as any).findOneAndUpdate.mockResolvedValue(mockSession)

      const result = await sessionForget("session-123", "keyToRemove")

      expect(result.success).toBe(true)
      expect((BrowserSession as any).findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: "session-123" },
        { $unset: { "memory.keyToRemove": 1 } },
        { new: true }
      )
    })
  })
})
