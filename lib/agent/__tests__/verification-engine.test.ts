/**
 * Verification Engine Unit Tests (Task 2: Low-confidence completion handling)
 *
 * Tests computeGoalAchieved: goal achieved when task_completed && confidence >= 0.70;
 * low-confidence completion when goalAchieved && confidence < 0.85.
 *
 * @see docs/VERIFICATION_PROCESS.md
 */

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db/mongoose", () => ({ connectMongoose: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/cost", () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

import { computeGoalAchieved } from "../verification-engine"

describe("Verification Engine", () => {
  describe("computeGoalAchieved (Task 2: low-confidence completion)", () => {
    it("sets goalAchieved=true when task_completed and confidence >= 0.70", () => {
      expect(computeGoalAchieved(true, 0.7)).toEqual({
        goalAchieved: true,
        lowConfidenceCompletion: true,
      })
      expect(computeGoalAchieved(true, 0.75)).toEqual({
        goalAchieved: true,
        lowConfidenceCompletion: true,
      })
      expect(computeGoalAchieved(true, 0.84)).toEqual({
        goalAchieved: true,
        lowConfidenceCompletion: true,
      })
      expect(computeGoalAchieved(true, 0.85)).toEqual({
        goalAchieved: true,
        lowConfidenceCompletion: false,
      })
      expect(computeGoalAchieved(true, 0.9)).toEqual({
        goalAchieved: true,
        lowConfidenceCompletion: false,
      })
    })

    it("sets goalAchieved=false when confidence < 0.70 even if task_completed", () => {
      expect(computeGoalAchieved(true, 0.69)).toEqual({
        goalAchieved: false,
        lowConfidenceCompletion: false,
      })
      expect(computeGoalAchieved(true, 0.5)).toEqual({
        goalAchieved: false,
        lowConfidenceCompletion: false,
      })
    })

    it("sets goalAchieved=false when task_completed is false", () => {
      expect(computeGoalAchieved(false, 0.9)).toEqual({
        goalAchieved: false,
        lowConfidenceCompletion: false,
      })
      expect(computeGoalAchieved(false, 0.7)).toEqual({
        goalAchieved: false,
        lowConfidenceCompletion: false,
      })
    })

    it("boundary: exactly 0.70 is goalAchieved and low-confidence", () => {
      expect(computeGoalAchieved(true, 0.70)).toEqual({
        goalAchieved: true,
        lowConfidenceCompletion: true,
      })
    })

    it("boundary: exactly 0.85 is goalAchieved but not low-confidence", () => {
      expect(computeGoalAchieved(true, 0.85)).toEqual({
        goalAchieved: true,
        lowConfidenceCompletion: false,
      })
    })
  })
})
