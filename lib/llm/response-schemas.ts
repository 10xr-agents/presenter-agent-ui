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

/** Planning: array of steps with description, reasoning, toolType, expectedOutcome. */
export const PLANNING_RESPONSE_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      description: "Ordered list of plan steps.",
      items: {
        type: "object",
        properties: {
          index: { type: "number", description: "Step index (0-based)." },
          description: { type: "string", description: "User-friendly step description." },
          reasoning: { type: "string", description: "Why this step is needed." },
          toolType: {
            type: "string",
            enum: ["DOM", "SERVER", "MIXED"],
            description: "DOM (browser), SERVER (API), or MIXED.",
          },
          expectedOutcome: { type: "string", description: "What should happen after this step." },
        },
        required: ["index", "description"],
      },
    },
  },
  required: ["steps"],
}

/** Step refinement: tool name, type, parameters, and action string. */
export const STEP_REFINEMENT_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    toolName: { type: "string", description: "e.g. click, setValue, finish, fail." },
    toolType: {
      type: "string",
      enum: ["DOM", "SERVER"],
      description: "DOM (browser) or SERVER.",
    },
    parameters: {
      type: "object",
      description: "Key-value parameters for the tool.",
      additionalProperties: true,
    },
    action: {
      type: "string",
      description: "Full action string e.g. click(123), setValue(456, 'text').",
    },
  },
  required: ["toolName", "toolType", "parameters", "action"],
}

/** Task context analysis: sufficient context, missing fields, search need. */
export const TASK_CONTEXT_ANALYSIS_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    hasSufficientContext: { type: "boolean", description: "True if we can proceed without search." },
    missingFields: {
      type: "array",
      items: { type: "string" },
      description: "Specific fields/info needed.",
    },
    needsWebSearch: { type: "boolean", description: "True if we need documentation/examples." },
    searchQuery: { type: "string", description: "Refined query for search." },
    reasoning: { type: "string", description: "Brief explanation." },
  },
  required: ["hasSufficientContext", "missingFields", "needsWebSearch", "searchQuery", "reasoning"],
}

/** Information completeness after search. */
export const INFORMATION_COMPLETENESS_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    canProceed: { type: "boolean", description: "True if we have enough info to attempt task." },
    missingInformation: {
      type: "array",
      items: { type: "string" },
      description: "Info still missing that only user can provide.",
    },
    userQuestion: {
      type: "string",
      description: "User-friendly question if canProceed is false.",
    },
    reasoning: { type: "string", description: "Brief explanation." },
  },
  required: ["canProceed", "missingInformation", "userQuestion", "reasoning"],
}

/** Context analyzer: source, requiredSources, searchQuery, reasoning, confidence. */
export const CONTEXT_ANALYSIS_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    source: {
      type: "string",
      enum: ["MEMORY", "PAGE", "WEB_SEARCH", "ASK_USER"],
      description: "Primary information source.",
    },
    requiredSources: {
      type: "array",
      items: { type: "string", enum: ["MEMORY", "PAGE", "WEB_SEARCH", "ASK_USER"] },
      description: "All sources needed for this query.",
    },
    missingInfo: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          type: { type: "string", enum: ["EXTERNAL_KNOWLEDGE", "PRIVATE_DATA"] },
          description: { type: "string" },
        },
        required: ["field", "type", "description"],
      },
      description: "Missing information classification.",
    },
    searchQuery: { type: "string", description: "Refined query for Tavily if WEB_SEARCH." },
    reasoning: { type: "string", description: "Explanation." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence 0-1." },
  },
  required: ["source", "requiredSources", "missingInfo", "searchQuery", "reasoning", "confidence"],
}

/** Search evaluation: solved, refinedQuery, shouldRetry, shouldAskUser, reasoning, confidence. */
export const SEARCH_EVALUATION_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    solved: { type: "boolean", description: "True if search results solve the problem." },
    refinedQuery: { type: "string", description: "Refined query for retry if shouldRetry." },
    shouldRetry: { type: "boolean", description: "True if refined query might help." },
    shouldAskUser: { type: "boolean", description: "True if we need private data from user." },
    reasoning: { type: "string", description: "Explanation." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence 0-1." },
  },
  required: ["solved", "shouldRetry", "shouldAskUser", "reasoning", "confidence"],
}

/** Critic: approved (boolean), confidence, reason, suggestion. */
export const CRITIC_RESPONSE_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    approved: { type: "boolean", description: "True if action makes sense for the goal." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence 0-1." },
    reason: { type: "string", description: "Explanation when not approved." },
    suggestion: { type: "string", description: "Suggested fix when not approved." },
  },
  required: ["approved", "confidence"],
}

/** Self-correction: strategy, reason, correctedAction, correctedDescription. */
export const SELF_CORRECTION_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    strategy: {
      type: "string",
      enum: [
        "ALTERNATIVE_SELECTOR",
        "ALTERNATIVE_TOOL",
        "GATHER_INFORMATION",
        "UPDATE_PLAN",
        "RETRY_WITH_DELAY",
      ],
      description: "Correction strategy.",
    },
    reason: { type: "string", description: "Why this correction." },
    correctedAction: { type: "string", description: "Action string e.g. click(456)." },
    correctedDescription: { type: "string", description: "User-friendly description of the step." },
  },
  required: ["strategy", "reason", "correctedAction"],
}

/** Plan validator (replanning): valid, reason, suggestedChanges, needsFullReplan. */
export const PLAN_VALIDATOR_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    valid: { type: "boolean", description: "True if remaining steps can still be executed." },
    reason: { type: "string", description: "Explanation." },
    suggestedChanges: {
      type: "array",
      items: { type: "string" },
      description: "e.g. skip step 1, change step 2 to ...",
    },
    needsFullReplan: { type: "boolean", description: "True if full re-plan is needed." },
  },
  required: ["valid", "reason"],
}

/** Outcome prediction: description, domChanges, nextGoal. */
const DOM_CHANGES_SCHEMA = {
  type: "object",
  properties: {
    elementShouldExist: { type: "string" },
    elementShouldNotExist: { type: "string" },
    elementShouldHaveText: {
      type: "object",
      properties: { selector: { type: "string" }, text: { type: "string" } },
      required: ["selector", "text"],
    },
    urlShouldChange: { type: "boolean" },
    attributeChanges: {
      type: "array",
      items: {
        type: "object",
        properties: { attribute: { type: "string" }, expectedValue: { type: "string" } },
        required: ["attribute", "expectedValue"],
      },
    },
    elementsToAppear: {
      type: "array",
      items: {
        type: "object",
        properties: { role: { type: "string" }, selector: { type: "string" } },
      },
    },
    elementsToDisappear: {
      type: "array",
      items: {
        type: "object",
        properties: { role: { type: "string" }, selector: { type: "string" } },
      },
    },
  },
}
const NEXT_GOAL_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    selector: { type: "string" },
    textContent: { type: "string" },
    role: { type: "string" },
    required: { type: "boolean" },
  },
  required: ["description", "required"],
}
export const OUTCOME_PREDICTION_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    description: { type: "string", description: "User-friendly expected outcome description." },
    domChanges: { ...DOM_CHANGES_SCHEMA, description: "DOM expectations." },
    nextGoal: { ...NEXT_GOAL_SCHEMA, description: "Look-ahead for next step (optional)." },
  },
  required: ["description"],
}

/** Contingency planning: array of contingencies. */
export const CONTINGENCY_RESPONSE_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    contingencies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          condition: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "ELEMENT_MISSING",
                  "POPUP_DETECTED",
                  "ERROR_DISPLAYED",
                  "URL_CHANGED",
                  "FORM_VALIDATION",
                  "CUSTOM",
                ],
              },
              pattern: { type: "string" },
              selector: { type: "string" },
              textMatch: { type: "string" },
              description: { type: "string" },
            },
            required: ["type", "description"],
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["CLICK", "WAIT", "SCROLL", "NAVIGATE", "SKIP_STEP", "RESUME_MAIN"],
                },
                target: { type: "string" },
                description: { type: "string" },
              },
              required: ["type", "description"],
            },
          },
          priority: { type: "number" },
        },
        required: ["id", "condition", "actions", "priority"],
      },
    },
  },
  required: ["contingencies"],
}

/** Hierarchical planning: subTasks array. */
export const HIERARCHICAL_SUBTASKS_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    subTasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          index: { type: "number" },
          name: { type: "string" },
          objective: { type: "string" },
          inputs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                required: { type: "boolean" },
                source: { type: "string" },
              },
              required: ["name", "description", "required", "source"],
            },
          },
          outputs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                extractionHint: { type: "string" },
              },
              required: ["name", "description", "extractionHint"],
            },
          },
          estimatedSteps: { type: "number" },
          stepsIncluded: {
            type: "array",
            items: { type: "number" },
          },
        },
        required: ["id", "index", "name", "objective", "inputs", "outputs", "estimatedSteps"],
      },
    },
  },
  required: ["subTasks"],
}

/** Web search summary: single summary string in structured form. */
export const WEB_SEARCH_SUMMARY_SCHEMA: ResponseJsonSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2-3 sentence summary of key information from search results.",
    },
  },
  required: ["summary"],
}
