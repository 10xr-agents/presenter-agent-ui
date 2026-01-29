/**
 * Semantic Verification Unit Tests (Task 1: action_succeeded vs task_completed; Task 4: step-level vs task-level in prompt)
 *
 * Tests the contract for parsing LLM verification response: new schema
 * (action_succeeded, task_completed) and backward compat with legacy "match".
 * Task 4: Ensures prompt contract constants include explicit step-level vs task-level wording.
 *
 * @see docs/VERIFICATION_PROCESS.md
 */

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db/mongoose", () => ({ connectMongoose: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/cost", () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

import {
  parseSemanticVerificationResponse,
  STEP_TASK_LEVEL_CONTRACT,
  STEP_TASK_LEVEL_EXAMPLE,
} from "../verification/semantic-verification"

describe("parseSemanticVerificationResponse", () => {
  it("parses new schema (action_succeeded, task_completed)", () => {
    const json = JSON.stringify({
      action_succeeded: true,
      task_completed: false,
      confidence: 0.9,
      reason: "Form opened; task not yet complete.",
    })
    const result = parseSemanticVerificationResponse(json)
    expect(result).toEqual({
      action_succeeded: true,
      task_completed: false,
      match: false,
      reason: "Form opened; task not yet complete.",
      confidence: 0.9,
    })
  })

  it("sets match = task_completed for goal semantics", () => {
    const json = JSON.stringify({
      action_succeeded: true,
      task_completed: true,
      confidence: 0.9,
      reason: "Task complete.",
    })
    const result = parseSemanticVerificationResponse(json)
    expect(result.match).toBe(true)
    expect(result.task_completed).toBe(true)
  })

  it("falls back to legacy match when action_succeeded/task_completed missing", () => {
    const json = JSON.stringify({
      match: true,
      confidence: 0.85,
      reason: "Goal achieved.",
    })
    const result = parseSemanticVerificationResponse(json)
    expect(result.action_succeeded).toBe(true)
    expect(result.task_completed).toBe(true)
    expect(result.match).toBe(true)
  })

  it("falls back to match false when legacy match is false", () => {
    const json = JSON.stringify({
      match: false,
      confidence: 0.5,
      reason: "Action failed.",
    })
    const result = parseSemanticVerificationResponse(json)
    expect(result.action_succeeded).toBe(false)
    expect(result.task_completed).toBe(false)
    expect(result.match).toBe(false)
  })

  it("clamps confidence to [0, 1]", () => {
    const json = JSON.stringify({
      action_succeeded: true,
      task_completed: false,
      confidence: 1.5,
      reason: "Ok",
    })
    const result = parseSemanticVerificationResponse(json)
    expect(result.confidence).toBe(1)
  })

  it("defaults confidence to 0.5 when missing", () => {
    const json = JSON.stringify({
      action_succeeded: false,
      task_completed: false,
      reason: "No confidence",
    })
    const result = parseSemanticVerificationResponse(json)
    expect(result.confidence).toBe(0.5)
  })

  it("defaults reason when missing", () => {
    const json = JSON.stringify({
      action_succeeded: false,
      task_completed: false,
      confidence: 0.3,
    })
    const result = parseSemanticVerificationResponse(json)
    expect(result.reason).toBe("No reason")
  })

  it("throws on invalid JSON", () => {
    expect(() => parseSemanticVerificationResponse("not json")).toThrow()
    expect(() => parseSemanticVerificationResponse("")).toThrow()
  })

  it("extracts and parses JSON when response has leading text (e.g. thought summary)", () => {
    const json = JSON.stringify({
      action_succeeded: true,
      task_completed: true,
      confidence: 1.0,
      reason: "The action successfully navigated to the overview section.",
    })
    const withPrefix = `Thought summary: The user wanted to go to overview. URL changed. Answer:\n${json}`
    const result = parseSemanticVerificationResponse(withPrefix)
    expect(result.action_succeeded).toBe(true)
    expect(result.task_completed).toBe(true)
    expect(result.confidence).toBe(1.0)
    expect(result.reason).toBe("The action successfully navigated to the overview section.")
  })

  it("extracts and parses JSON from markdown code block", () => {
    const json = JSON.stringify({
      action_succeeded: true,
      task_completed: false,
      confidence: 0.9,
      reason: "Form opened.",
    })
    const withMarkdown = `\n\`\`\`json\n${json}\n\`\`\`\n`
    const result = parseSemanticVerificationResponse(withMarkdown)
    expect(result.action_succeeded).toBe(true)
    expect(result.task_completed).toBe(false)
    expect(result.confidence).toBe(0.9)
  })
})

describe("Step-level vs task-level prompt contract (Task 4)", () => {
  it("STEP_TASK_LEVEL_CONTRACT states task_completed only when entire request is done", () => {
    expect(STEP_TASK_LEVEL_CONTRACT).toContain("entire")
    expect(STEP_TASK_LEVEL_CONTRACT).toMatch(/task_completed.*true.*only/i)
    expect(STEP_TASK_LEVEL_CONTRACT).toMatch(/multi-step|final step/)
  })

  it("STEP_TASK_LEVEL_EXAMPLE includes Add patient multi-step example", () => {
    expect(STEP_TASK_LEVEL_EXAMPLE).toMatch(/Add a patient|Add patient/i)
    expect(STEP_TASK_LEVEL_EXAMPLE).toMatch(/action_succeeded.*true.*task_completed.*false/i)
    expect(STEP_TASK_LEVEL_EXAMPLE).toMatch(/task_completed.*true/i)
  })
})
