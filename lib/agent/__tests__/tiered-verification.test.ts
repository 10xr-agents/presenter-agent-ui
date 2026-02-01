/**
 * Tiered Verification Unit Tests (Phase 5)
 *
 * Tests for the three-tier verification optimization:
 * - Tier 1: Deterministic heuristics
 * - Tier 2: Lightweight LLM (mocked)
 * - computeIsLastStep helper
 *
 * @see docs/VERIFICATION_PROCESS.md - Phase 5
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db/mongoose", () => ({
  connectMongoose: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/cost", () => ({
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/llm/gemini-client", () => ({
  DEFAULT_PLANNING_MODEL: "gemini-2.5-flash-preview-05-20",
  generateWithGemini: vi.fn(),
}))

import type { TaskPlan } from "@/lib/models/task"
import type { HierarchicalPlan, SubTask } from "../hierarchical-planning"
import {
  computeIsLastStep,
  estimateTokensSaved,
  type TieredVerificationOptions,
  tryDeterministicVerification,
} from "../verification/tiered-verification"

describe("Tiered Verification (Phase 5)", () => {
  describe("computeIsLastStep", () => {
    it("returns true when no plan provided", () => {
      expect(computeIsLastStep(undefined)).toBe(true)
    })

    it("returns true when on last step of main plan", () => {
      const plan: TaskPlan = {
        steps: [
          { id: "1", description: "Step 1", status: "completed" },
          { id: "2", description: "Step 2", status: "pending" },
        ],
        currentStepIndex: 1,
      }
      expect(computeIsLastStep(plan)).toBe(true)
    })

    it("returns false when not on last step of main plan", () => {
      const plan: TaskPlan = {
        steps: [
          { id: "1", description: "Step 1", status: "completed" },
          { id: "2", description: "Step 2", status: "pending" },
          { id: "3", description: "Step 3", status: "pending" },
        ],
        currentStepIndex: 1,
      }
      expect(computeIsLastStep(plan)).toBe(false)
    })

    it("returns true for single-step plan", () => {
      const plan: TaskPlan = {
        steps: [{ id: "1", description: "Only step", status: "pending" }],
        currentStepIndex: 0,
      }
      expect(computeIsLastStep(plan)).toBe(true)
    })
  })

  describe("tryDeterministicVerification", () => {
    const baseOptions: TieredVerificationOptions = {
      beforeUrl: "https://example.com",
      afterUrl: "https://example.com",
      action: "click(123)",
      actionType: "generic",
      isLastStep: false,
      meaningfulContentChange: false,
      complexity: "COMPLEX",
      userGoal: "Navigate to Google",
      observations: [],
      context: { tenantId: "test", userId: "test" },
    }

    describe("Check 1.1: Intermediate Navigation Success", () => {
      it("returns deterministic success for intermediate navigation with URL change", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          beforeUrl: "https://example.com",
          afterUrl: "https://google.com",
          actionType: "navigation",
          isLastStep: false,
        })

        expect(result).not.toBeNull()
        expect(result?.action_succeeded).toBe(true)
        expect(result?.task_completed).toBe(false)
        expect(result?.confidence).toBe(1.0)
        expect(result?.tier).toBe("deterministic")
      })

      it("returns null for last step navigation (should go to Tier 2/3)", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          beforeUrl: "https://example.com",
          afterUrl: "https://google.com",
          actionType: "navigation",
          isLastStep: true,
          complexity: "COMPLEX",
        })

        // Should fall through to Tier 2/3 for last step complex tasks
        expect(result).toBeNull()
      })
    })

    describe("Check 1.2: Intermediate DOM Interaction Success", () => {
      it("returns deterministic success for intermediate step with content change", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          meaningfulContentChange: true,
          isLastStep: false,
        })

        expect(result).not.toBeNull()
        expect(result?.action_succeeded).toBe(true)
        expect(result?.task_completed).toBe(false)
        expect(result?.confidence).toBe(0.95)
        expect(result?.tier).toBe("deterministic")
      })
    })

    describe("Check 1.3: Cross-Domain Navigation", () => {
      it("returns deterministic success for cross-domain navigation", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          beforeUrl: "https://example.com",
          afterUrl: "https://google.com",
          actionType: "generic",
          isLastStep: false,
        })

        expect(result).not.toBeNull()
        expect(result?.action_succeeded).toBe(true)
        expect(result?.task_completed).toBe(false)
        expect(result?.confidence).toBe(1.0)
        expect(result?.reason).toContain("Cross-domain")
      })
    })

    describe("Check 1.4: Look-Ahead Failure", () => {
      it("returns deterministic failure with routeToCorrection when next element missing", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          nextGoalCheck: {
            available: false,
            reason: "Submit button not found",
            required: true,
          },
        })

        expect(result).not.toBeNull()
        expect(result?.action_succeeded).toBe(false)
        expect(result?.task_completed).toBe(false)
        expect(result?.confidence).toBe(0.8)
        expect(result?.routeToCorrection).toBe(true)
        expect(result?.tier).toBe("deterministic")
      })

      it("returns null when next element is not required", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          nextGoalCheck: {
            available: false,
            reason: "Optional element not found",
            required: false,
          },
        })

        expect(result).toBeNull()
      })
    })

    describe("Check 1.5: Look-Ahead Success", () => {
      it("returns deterministic success when next element is available", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          isLastStep: false,
          nextGoalCheck: {
            available: true,
            reason: "Submit button found",
            required: true,
          },
        })

        expect(result).not.toBeNull()
        expect(result?.action_succeeded).toBe(true)
        expect(result?.task_completed).toBe(false)
        expect(result?.confidence).toBe(0.95)
        expect(result?.reason).toContain("look-ahead success")
      })
    })

    describe("Check 1.6: SIMPLE Navigation", () => {
      it("returns deterministic task_completed=true for SIMPLE navigation", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          beforeUrl: "https://example.com",
          afterUrl: "https://google.com",
          actionType: "navigation",
          complexity: "SIMPLE",
          isLastStep: true,
        })

        expect(result).not.toBeNull()
        expect(result?.action_succeeded).toBe(true)
        expect(result?.task_completed).toBe(true)
        expect(result?.confidence).toBe(1.0)
        expect(result?.reason).toContain("SIMPLE")
      })

      it("returns null for COMPLEX navigation on last step", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          beforeUrl: "https://example.com",
          afterUrl: "https://google.com",
          actionType: "navigation",
          complexity: "COMPLEX",
          isLastStep: true,
        })

        // Should fall through to Tier 2/3
        expect(result).toBeNull()
      })
    })

    describe("No change scenarios", () => {
      it("returns null when no changes detected (falls through)", () => {
        const result = tryDeterministicVerification({
          ...baseOptions,
          beforeUrl: "https://example.com",
          afterUrl: "https://example.com",
          meaningfulContentChange: false,
        })

        expect(result).toBeNull()
      })
    })
  })

  describe("estimateTokensSaved", () => {
    it("returns ~400 tokens saved for deterministic tier", () => {
      expect(estimateTokensSaved("deterministic")).toBe(400)
    })

    it("returns ~300 tokens saved for lightweight tier", () => {
      expect(estimateTokensSaved("lightweight")).toBe(300)
    })

    it("returns 0 tokens saved for full tier", () => {
      expect(estimateTokensSaved("full")).toBe(0)
    })
  })
})
