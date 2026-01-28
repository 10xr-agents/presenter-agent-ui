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

const mockCreate = vi.fn()
vi.mock("@/lib/observability", () => ({
  getTracedOpenAIWithConfig: () => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }),
}))

import { generatePlan } from "../planning-engine"

// Allow engines to pass API key check (mock is used for actual call)
vi.stubEnv("OPENAI_API_KEY", "test-key-for-planning")

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
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: validPlanResponse } }],
      usage: { prompt_tokens: 200, completion_tokens: 100 },
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

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const call = mockCreate.mock.calls[0]
    const messages = call[0]?.messages as Array<{ role: string; content: string }>
    const userContent = messages?.find((m) => m.role === "user")?.content ?? ""
    expect(userContent).toContain(
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

    const call = mockCreate.mock.calls[0]
    const messages = call[0]?.messages as Array<{ role: string; content: string }>
    const userContent = messages?.find((m) => m.role === "user")?.content ?? ""
    expect(userContent).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
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

    const call = mockCreate.mock.calls[0]
    const messages = call[0]?.messages as Array<{ role: string; content: string }>
    const userContent = messages?.find((m) => m.role === "user")?.content ?? ""
    expect(userContent).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
  })
})
