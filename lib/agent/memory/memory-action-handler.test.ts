/**
 * Memory Action Handler Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the memory service
vi.mock("./memory-service", () => ({
  taskRemember: vi.fn(),
  taskRecall: vi.fn(),
  taskRecallAll: vi.fn(),
  sessionRecall: vi.fn(),
  sessionRecallAll: vi.fn(),
  exportToSessionMemory: vi.fn(),
}))

import {
  taskRemember,
  taskRecall,
  taskRecallAll,
  sessionRecall,
  sessionRecallAll,
  exportToSessionMemory,
} from "./memory-service"

import {
  handleMemoryAction,
  isMemoryAction,
  parseMemoryAction,
} from "./memory-action-handler"

describe("Memory Action Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("isMemoryAction", () => {
    it("should return true for memory actions", () => {
      expect(isMemoryAction("remember")).toBe(true)
      expect(isMemoryAction("recall")).toBe(true)
      expect(isMemoryAction("exportToSession")).toBe(true)
    })

    it("should return false for non-memory actions", () => {
      expect(isMemoryAction("click")).toBe(false)
      expect(isMemoryAction("setValue")).toBe(false)
      expect(isMemoryAction("finish")).toBe(false)
    })
  })

  describe("parseMemoryAction", () => {
    it("should parse remember action", () => {
      const result = parseMemoryAction('remember("prices", [10.99, 24.99])')

      expect(result).not.toBeNull()
      expect(result?.actionName).toBe("remember")
      expect(result?.parameters.key).toBe("prices")
      expect(result?.parameters.value).toEqual([10.99, 24.99])
    })

    it("should parse recall action with default scope", () => {
      const result = parseMemoryAction('recall("prices")')

      expect(result).not.toBeNull()
      expect(result?.actionName).toBe("recall")
      expect(result?.parameters.key).toBe("prices")
      expect(result?.parameters.scope).toBe("task")
    })

    it("should parse recall action with session scope", () => {
      const result = parseMemoryAction('recall("savedData", "session")')

      expect(result).not.toBeNull()
      expect(result?.actionName).toBe("recall")
      expect(result?.parameters.key).toBe("savedData")
      expect(result?.parameters.scope).toBe("session")
    })

    it("should parse exportToSession action", () => {
      const result = parseMemoryAction('exportToSession("total")')

      expect(result).not.toBeNull()
      expect(result?.actionName).toBe("exportToSession")
      expect(result?.parameters.key).toBe("total")
    })

    it("should parse exportToSession with custom sessionKey", () => {
      const result = parseMemoryAction('exportToSession("myKey", "savedKey")')

      expect(result).not.toBeNull()
      expect(result?.actionName).toBe("exportToSession")
      expect(result?.parameters.key).toBe("myKey")
      expect(result?.parameters.sessionKey).toBe("savedKey")
    })

    it("should return null for non-memory actions", () => {
      expect(parseMemoryAction("click(42)")).toBeNull()
      expect(parseMemoryAction('setValue(10, "test")')).toBeNull()
    })
  })

  describe("handleMemoryAction - remember", () => {
    it("should handle remember action successfully", async () => {
      ;(taskRemember as any).mockResolvedValue({ success: true, value: "testValue" })

      const result = await handleMemoryAction({
        actionName: "remember",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "testKey", value: "testValue" },
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe("remember")
      expect(result.key).toBe("testKey")
      expect(result.scope).toBe("task")
      expect(taskRemember).toHaveBeenCalledWith("task-123", "testKey", "testValue")
    })

    it("should handle missing key parameter", async () => {
      const result = await handleMemoryAction({
        actionName: "remember",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { value: "testValue" },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Missing required parameter: key")
    })

    it("should handle missing value parameter", async () => {
      const result = await handleMemoryAction({
        actionName: "remember",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "testKey" },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Missing required parameter: value")
    })
  })

  describe("handleMemoryAction - recall", () => {
    it("should handle recall action from task memory", async () => {
      ;(taskRecall as any).mockResolvedValue({ success: true, value: "recalledValue" })

      const result = await handleMemoryAction({
        actionName: "recall",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "testKey", scope: "task" },
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe("recall")
      expect(result.key).toBe("testKey")
      expect(result.scope).toBe("task")
      expect(result.value).toBe("recalledValue")
      expect(taskRecall).toHaveBeenCalledWith("task-123", "testKey")
    })

    it("should handle recall action from session memory", async () => {
      ;(sessionRecall as any).mockResolvedValue({ success: true, value: "sessionValue" })

      const result = await handleMemoryAction({
        actionName: "recall",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "savedKey", scope: "session" },
      })

      expect(result.success).toBe(true)
      expect(result.scope).toBe("session")
      expect(sessionRecall).toHaveBeenCalledWith("session-123", "savedKey")
    })

    it("should handle recall all with * key", async () => {
      const allMemory = { key1: "value1", key2: "value2" }
      ;(taskRecallAll as any).mockResolvedValue({ success: true, value: allMemory })

      const result = await handleMemoryAction({
        actionName: "recall",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "*" },
      })

      expect(result.success).toBe(true)
      expect(result.key).toBe("*")
      expect(result.value).toEqual(allMemory)
      expect(taskRecallAll).toHaveBeenCalledWith("task-123")
    })

    it("should handle recall all from session with * key", async () => {
      const allMemory = { saved1: "data1" }
      ;(sessionRecallAll as any).mockResolvedValue({ success: true, value: allMemory })

      const result = await handleMemoryAction({
        actionName: "recall",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "*", scope: "session" },
      })

      expect(result.success).toBe(true)
      expect(result.scope).toBe("session")
      expect(sessionRecallAll).toHaveBeenCalledWith("session-123")
    })
  })

  describe("handleMemoryAction - exportToSession", () => {
    it("should handle exportToSession action", async () => {
      ;(exportToSessionMemory as any).mockResolvedValue({
        success: true,
        value: "exportedValue",
      })

      const result = await handleMemoryAction({
        actionName: "exportToSession",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "dataKey" },
      })

      expect(result.success).toBe(true)
      expect(result.action).toBe("exportToSession")
      expect(result.key).toBe("dataKey")
      expect(result.scope).toBe("session")
      expect(exportToSessionMemory).toHaveBeenCalledWith(
        "session-123",
        "task-123",
        "dataKey",
        undefined
      )
    })

    it("should handle exportToSession with custom sessionKey", async () => {
      ;(exportToSessionMemory as any).mockResolvedValue({
        success: true,
        value: "exportedValue",
      })

      const result = await handleMemoryAction({
        actionName: "exportToSession",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "originalKey", sessionKey: "customKey" },
      })

      expect(result.success).toBe(true)
      expect(exportToSessionMemory).toHaveBeenCalledWith(
        "session-123",
        "task-123",
        "originalKey",
        "customKey"
      )
    })

    it("should handle export failure", async () => {
      ;(exportToSessionMemory as any).mockResolvedValue({
        success: false,
        error: "Key not found",
      })

      const result = await handleMemoryAction({
        actionName: "exportToSession",
        taskId: "task-123",
        sessionId: "session-123",
        parameters: { key: "nonexistent" },
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("Key not found")
    })
  })

  describe("handleMemoryAction - unknown action", () => {
    it("should handle unknown memory action", async () => {
      const result = await handleMemoryAction({
        actionName: "unknownAction" as any,
        taskId: "task-123",
        sessionId: "session-123",
        parameters: {},
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Unknown memory action")
    })
  })
})
