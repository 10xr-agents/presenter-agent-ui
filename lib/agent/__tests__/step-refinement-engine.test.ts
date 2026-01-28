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

import type { PlanStep } from "@/lib/models/task"
import { refineStep } from "../step-refinement-engine"

// Allow engines to pass API key check (mock is used for actual call)
vi.stubEnv("OPENAI_API_KEY", "test-key-for-step-refinement")

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
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: validRefinementResponse } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
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
      { tenantId: "t1", userId: "u1" }
    )

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const call = mockCreate.mock.calls[0]
    const messages = call[0]?.messages as Array<{ role: string; content: string }>
    const userContent = messages?.find((m) => m.role === "user")?.content ?? ""
    expect(userContent).toContain(
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
      { tenantId: "t1", userId: "u1" }
    )

    const call = mockCreate.mock.calls[0]
    const messages = call[0]?.messages as Array<{ role: string; content: string }>
    const userContent = messages?.find((m) => m.role === "user")?.content ?? ""
    expect(userContent).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
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
      { tenantId: "t1", userId: "u1" }
    )

    const call = mockCreate.mock.calls[0]
    const messages = call[0]?.messages as Array<{ role: string; content: string }>
    const userContent = messages?.find((m) => m.role === "user")?.content ?? ""
    expect(userContent).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
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
      { tenantId: "t1", userId: "u1" }
    )

    const call = mockCreate.mock.calls[0]
    const messages = call[0]?.messages as Array<{ role: string; content: string }>
    const userContent = messages?.find((m) => m.role === "user")?.content ?? ""
    expect(userContent).not.toContain("Previous action succeeded; the full user goal is not yet achieved")
  })
})
