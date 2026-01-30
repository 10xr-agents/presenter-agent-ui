/**
 * Step Refinement Engine Unit Tests (Verification + Planner: pass verification outcome into context)
 *
 * Ensures verificationSummary (action_succeeded, task_completed) is passed into the refinement
 * prompt so the LLM receives "Previous action succeeded; full goal not yet achieved" when appropriate.
 *
 * @see docs/VERIFICATION_PROCESS.md Task 7, docs/PLANNER_PROCESS.md
 */

import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/cost", () => ({ recordUsage: vi.fn().mockResolvedValue(undefined) }))

const mockGenerateWithGemini = vi.fn()
vi.mock("@/lib/llm/gemini-client", () => ({
  generateWithGemini: (...args: unknown[]) => mockGenerateWithGemini(...args),
  DEFAULT_PLANNING_MODEL: "gemini-3-flash-preview",
}))

import type { PlanStep } from "@/lib/models/task"
import { refineStep } from "../step-refinement-engine"

vi.stubEnv("GEMINI_API_KEY", "test-key-for-step-refinement")

describe("Step Refinement Engine", () => {
  const baseStep: PlanStep = {
    index: 0,
    description: "Click the Patient menu",
    reasoning: "Open the menu",
    toolType: "DOM",
    status: "pending",
  }

  const validRefinementResponse = `
<ToolName>
click
</ToolName>
<ToolType>
DOM
</ToolType>
<Parameters>
{"elementId": "68"}
</Parameters>
<Action>
click(68)
</Action>
`

  beforeEach(() => {
    mockGenerateWithGemini.mockReset()
    mockGenerateWithGemini.mockResolvedValue({
      content: validRefinementResponse,
      promptTokens: 100,
      completionTokens: 50,
    })
  })

  it("includes verification context in user prompt when action_succeeded and not task_completed", async () => {
    await refineStep(
      baseStep,
      "<div id=\"68\">Patient</div>",
      "https://example.com",
      [],
      [],
      false,
      { action_succeeded: true, task_completed: false },
      undefined,
      { tenantId: "t1", userId: "u1" }
    )

    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(1)
    const call = mockGenerateWithGemini.mock.calls[0]
    const userPrompt = (call?.[1] as string) ?? ""
    expect(userPrompt).toContain(
      "Previous action succeeded; the full user goal is not yet achieved. Continue with the next step."
    )
  })

  it("does not include verification context when verificationSummary is undefined", async () => {
    await refineStep(
      baseStep,
      "<div id=\"68\">Patient</div>",
      "https://example.com",
      [],
      [],
      false,
      undefined,
      undefined,
      { tenantId: "t1", userId: "u1" }
    )

    const call = mockGenerateWithGemini.mock.calls[0]
    const userPrompt = (call?.[1] as string) ?? ""
    expect(userPrompt).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
  })

  it("does not include verification context when task_completed is true", async () => {
    await refineStep(
      baseStep,
      "<div id=\"68\">Patient</div>",
      "https://example.com",
      [],
      [],
      false,
      { action_succeeded: true, task_completed: true },
      undefined,
      { tenantId: "t1", userId: "u1" }
    )

    const call = mockGenerateWithGemini.mock.calls[0]
    const userPrompt = (call?.[1] as string) ?? ""
    expect(userPrompt).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
  })

  it("does not include verification context when action_succeeded is false", async () => {
    await refineStep(
      baseStep,
      "<div id=\"68\">Patient</div>",
      "https://example.com",
      [],
      [],
      false,
      { action_succeeded: false, task_completed: false },
      undefined,
      { tenantId: "t1", userId: "u1" }
    )

    const call = mockGenerateWithGemini.mock.calls[0]
    const userPrompt = (call?.[1] as string) ?? ""
    expect(userPrompt).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
  })
})
