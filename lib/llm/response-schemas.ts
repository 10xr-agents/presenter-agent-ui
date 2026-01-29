/**
 * JSON Schema definitions for Gemini structured outputs.
 * All LLM calls use responseMimeType: "application/json" + responseJsonSchema
 * so responses are valid JSON only (no free text or markdown).
 *
 * @see https://ai.google.dev/gemini-api/docs/structured-output
 */

import type { ResponseJsonSchema } from "./gemini-client"

/** Semantic verification result (observation-based and full-DOM). */
export const VERIFICATION_RESPONSE_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    action_succeeded: {
      type: "boolean",
      description:
        "True when this action did something useful (e.g. form opened, page navigated). False when nothing useful happened.",
    },
    task_completed: {
      type: "boolean",
      description:
        "True only when the entire user goal is done. For multi-step tasks, false until the final step.",
    },
    sub_task_completed: {
      type: "boolean",
      description:
        "When sub-task objective is provided: true only when that sub-task objective is achieved.",
    },
    confidence: {
      type: "number",
      description: "Confidence 0.0–1.0 in this verdict.",
      minimum: 0,
      maximum: 1,
    },
    reason: {
      type: "string",
      description: "Brief explanation for the verdict.",
    },
  },
  required: ["action_succeeded", "task_completed", "confidence", "reason"],
}

/** Action generation: thought (user-facing) + action (e.g. click(123), finish()). */
export const ACTION_RESPONSE_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    thought: {
      type: "string",
      description:
        "One short sentence explaining what you will do, for the user. No technical details like element IDs.",
    },
    action: {
      type: "string",
      description:
        "Single action: click(N), setValue(N, 'text'), scroll(N), finish(), or fail('reason').",
    },
  },
  required: ["thought", "action"],
}
