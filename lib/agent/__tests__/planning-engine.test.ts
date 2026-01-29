/**
 * Planning Engine Unit Tests (Verification + Planner: pass verification outcome into context)
 *
 * Ensures context.verificationSummary (action_succeeded, task_completed) is passed into the
 * planning prompt when regenerating so the LLM receives "Previous action succeeded; full goal not yet achieved."
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

import { generatePlan } from "../planning-engine"

vi.stubEnv("GEMINI_API_KEY", "test-key-for-planning")

describe("Planning Engine", () => {
  const validPlanResponse = `
<Plan>
<Step index="0">
<Description>Open the Patient menu</Description>
<Reasoning>Access the menu to add a patient</Reasoning>
<ToolType>DOM</ToolType>
<ExpectedOutcome>Menu opens</ExpectedOutcome>
</Step>
<Step index="1">
<Description>Click New/Search</Description>
<Reasoning>Start new patient flow</Reasoning>
<ToolType>DOM</ToolType>
<ExpectedOutcome>Form opens</ExpectedOutcome>
</Step>
</Plan>
`

  beforeEach(() => {
    mockGenerateWithGemini.mockReset()
    mockGenerateWithGemini.mockResolvedValue({
      content: validPlanResponse,
      promptTokens: 200,
      completionTokens: 100,
    })
  })

  it("includes verification context in user prompt when context.verificationSummary has action_succeeded and not task_completed", async () => {
    await generatePlan(
      "Add a new patient named Jas",
      "https://example.com",
      "<body><nav></nav></body>",
      [],
      false,
      undefined,
      {
        tenantId: "t1",
        userId: "u1",
        verificationSummary: { action_succeeded: true, task_completed: false },
      }
    )

    expect(mockGenerateWithGemini).toHaveBeenCalledTimes(1)
    const call = mockGenerateWithGemini.mock.calls[0]
    const userPrompt = (call?.[1] as string) ?? ""
    expect(userPrompt).toContain(
      "Previous action succeeded; the full user goal is not yet achieved. Create or adjust the plan for the remaining steps."
    )
  })

  it("does not include verification context when context has no verificationSummary", async () => {
    await generatePlan(
      "Add a new patient named Jas",
      "https://example.com",
      "<body><nav></nav></body>",
      [],
      false,
      undefined,
      { tenantId: "t1", userId: "u1" }
    )

    const call = mockGenerateWithGemini.mock.calls[0]
    const userPrompt = (call?.[1] as string) ?? ""
    expect(userPrompt).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
  })

  it("does not include verification context when task_completed is true", async () => {
    await generatePlan(
      "Add a new patient",
      "https://example.com",
      "<body></body>",
      [],
      false,
      undefined,
      {
        tenantId: "t1",
        userId: "u1",
        verificationSummary: { action_succeeded: true, task_completed: true },
      }
    )

    const call = mockGenerateWithGemini.mock.calls[0]
    const userPrompt = (call?.[1] as string) ?? ""
    expect(userPrompt).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
  })
})
