/**
 * Critic Engine Unit Tests (Phase 4 Task 1)
 *
 * Tests for the pre-execution reflection layer that validates
 * action intent before sending to client.
 *
 * Note: These tests only test the pure functions that don't require
 * database connections or external services.
 */

import { describe, expect, it, vi } from "vitest"

// Mock environment to avoid database connection
vi.mock("@/lib/db/mongoose", () => ({
  connectMongoose: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/cost", () => ({
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

import { shouldTriggerCritic } from "../critic-engine"

describe("Critic Engine", () => {
  describe("shouldTriggerCritic", () => {
    // High-risk actions always trigger critic
    it("triggers for finish() action", () => {
      expect(shouldTriggerCritic("finish()")).toBe(true)
    })

    it("triggers for fail() action", () => {
      expect(shouldTriggerCritic("fail('some reason')")).toBe(true)
    })

    it("triggers for setValue() action", () => {
      expect(shouldTriggerCritic("setValue(123, 'test')")).toBe(true)
    })

    // Low confidence triggers critic
    it("triggers when confidence is below threshold (0.85)", () => {
      expect(shouldTriggerCritic("click(123)", 0.7)).toBe(true)
      expect(shouldTriggerCritic("click(123)", 0.5)).toBe(true)
      expect(shouldTriggerCritic("click(123)", 0.84)).toBe(true)
    })

    it("does not trigger when confidence is at or above threshold", () => {
      expect(shouldTriggerCritic("click(123)", 0.85)).toBe(false)
      expect(shouldTriggerCritic("click(123)", 0.9)).toBe(false)
      expect(shouldTriggerCritic("click(123)", 1.0)).toBe(false)
    })

    // Verification failure triggers critic
    it("triggers when there was a verification failure", () => {
      expect(shouldTriggerCritic("click(123)", 0.9, true)).toBe(true)
    })

    it("does not trigger for simple click without failure or low confidence", () => {
      expect(shouldTriggerCritic("click(123)", 0.9, false)).toBe(false)
      expect(shouldTriggerCritic("click(123)")).toBe(false)
    })

    // Edge cases
    it("handles malformed action strings gracefully", () => {
      expect(shouldTriggerCritic("", 0.9)).toBe(false)
      expect(shouldTriggerCritic("invalid", 0.9)).toBe(false)
    })

    it("is case-insensitive for action names", () => {
      expect(shouldTriggerCritic("FINISH()")).toBe(true)
      expect(shouldTriggerCritic("Finish()")).toBe(true)
      expect(shouldTriggerCritic("SETVALUE(1, 'x')")).toBe(true)
    })
  })
})
