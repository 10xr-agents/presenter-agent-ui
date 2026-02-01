# Gemini API Usage in Screen Agent Platform

This document describes how we use **Google Gemini** as the sole LLM provider across the Screen Agent Platform: agent orchestration, planning, verification, reasoning, and cost tracking.

**Reference:** [Gemini API Documentation](https://ai.google.dev/gemini-api/docs) · [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3) · [Pricing](https://ai.google.dev/gemini-api/docs/pricing)

---

## Overview

- **Provider:** Google Gemini only (no OpenAI/Anthropic).
- **SDK:** `@google/genai` (JavaScript/TypeScript).
- **Default model:** `gemini-3-flash-preview` (Gemini 3 Flash). Optionally use `gemini-3-pro-preview` for heavier reasoning via env overrides.
- **Primary API:** `generateContent` with `systemInstruction` for single-turn text generation; multi-turn and **function calling** via `AgentRunner` for the chat/agent API.
- **Authentication:** `GEMINI_API_KEY` (server-side). Get keys at [Google AI Studio](https://aistudio.google.com/apikey).

---

## API Patterns We Use

### 1. Single-turn text generation (`generateWithGemini`)

Used for planning, refinement, verification, action generation, critic, self-correction, outcome prediction, reasoning, and web search.

**Location:** `lib/llm/gemini-client.ts`

**Pattern (aligns with Gemini API):**

- **System prompt:** Passed as `config.systemInstruction`.
- **User content:** Passed as `contents` (string).
- **Config:** `temperature`, `maxOutputTokens`; optional `model` override; optional `thinkingLevel` (`"minimal"` | `"low"` | `"medium"` | `"high"`) for Gemini 3/2.5 reasoning.
- **Response:** When `responseJsonSchema` is set, `response.text` is a single JSON string conforming to the schema; otherwise plain text. Plus `usageMetadata` (prompt/completion/thought token counts when thinking is used).

```typescript
// Conceptual mapping to Gemini API
const response = await ai.models.generateContent({
  model,
  contents: userPrompt,
  config: {
    systemInstruction: systemPrompt,
    temperature,
    maxOutputTokens,
  },
})
// response.text, response.usageMetadata
```

**Reference:** [Generate content](https://ai.google.dev/gemini-api/docs) (REST/JS: `generateContent` with `systemInstruction`).

**Structured outputs (mandatory for JSON responses):** All LLM calls that expect a JSON-shaped response should use **structured output** so the model returns valid JSON only (no free text, no markdown, no thought+answer mix). We pass `responseJsonSchema` in options; the client sets `responseMimeType: "application/json"` and `responseJsonSchema` in the config. This avoids parsing failures (e.g. verification returning thought + answer in one block) and ensures type-safe, predictable results.

- **Verification:** `VERIFICATION_RESPONSE_SCHEMA` — `action_succeeded`, `task_completed`, `confidence`, `reason`, optional `sub_task_completed`. See `lib/llm/response-schemas.ts` and `lib/agent/verification/semantic-verification.ts`.
- **Action generation:** `ACTION_RESPONSE_SCHEMA` — `thought`, `action`. See `lib/agent/llm-client.ts` and direct-action / action-generation nodes.

**Reference:** [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

**Structured output status (all single-turn LLM calls):** Every `generateWithGemini` call that expects a JSON-shaped response uses `responseJsonSchema`. We use the safe parser `parseStructuredResponse<T>()` from `lib/llm/parse-structured-response.ts` instead of raw `JSON.parse()` to handle edge cases (see [Structured Output Edge Cases](#structured-output-edge-cases) below).

| Purpose (from Models table) | File(s) | Schema | Notes |
|-----------------------------|---------|--------|-------|
| General / actions | `lib/agent/llm-client.ts` | ✅ `ACTION_RESPONSE_SCHEMA` | thought, action |
| Verification | `lib/agent/verification/semantic-verification.ts` | ✅ `VERIFICATION_RESPONSE_SCHEMA` | observation + full-DOM |
| Planning | `lib/agent/planning-engine.ts` | ✅ `PLANNING_RESPONSE_SCHEMA` | steps[] |
| Step refinement | `lib/agent/step-refinement-engine.ts` | ✅ `STEP_REFINEMENT_SCHEMA` | toolName, toolType, parameters, action |
| Replanning | `lib/agent/replanning-engine.ts` | ✅ `PLAN_VALIDATOR_SCHEMA` | valid, reason, suggestedChanges?, needsFullReplan? |
| Critic | `lib/agent/critic-engine.ts` | ✅ `CRITIC_RESPONSE_SCHEMA` | approved, confidence, reason?, suggestion? |
| Self-correction | `lib/agent/self-correction-engine.ts` | ✅ `SELF_CORRECTION_SCHEMA` | strategy, reason, correctedAction, correctedDescription? |
| Outcome prediction | `lib/agent/outcome-prediction-engine.ts` | ✅ `OUTCOME_PREDICTION_SCHEMA` | description, domChanges?, nextGoal? |
| Reasoning (task context) | `lib/agent/reasoning-engine.ts` | ✅ `TASK_CONTEXT_ANALYSIS_SCHEMA` | hasSufficientContext, missingFields, needsWebSearch, searchQuery, reasoning |
| Reasoning (completeness) | `lib/agent/reasoning-engine.ts` | ✅ `INFORMATION_COMPLETENESS_SCHEMA` | canProceed, missingInformation, userQuestion, reasoning |
| Context analyzer | `lib/agent/reasoning/context-analyzer.ts` | ✅ `CONTEXT_ANALYSIS_SCHEMA` | source, requiredSources, missingInfo, searchQuery, reasoning, confidence |
| Search manager | `lib/agent/reasoning/search-manager.ts` | ✅ `SEARCH_EVALUATION_SCHEMA` | solved, refinedQuery?, shouldRetry, shouldAskUser, reasoning, confidence |
| Contingency planning | `lib/agent/conditional-planning.ts` | ✅ `CONTINGENCY_RESPONSE_SCHEMA` | contingencies[] |
| Hierarchical plan | `lib/agent/hierarchical-planning.ts` | ✅ `HIERARCHICAL_SUBTASKS_SCHEMA` | subTasks[] |
| Web search synthesis | `lib/agent/web-search.ts` | ✅ `WEB_SEARCH_SUMMARY_SCHEMA` | summary |
| Agent API (chat) | `lib/ai/agent-runner.ts` | N/A | Multi-turn; uses `generateContent` directly, not single JSON response |

**Grounding with Google Search:** For planning and verification we pass `useGoogleSearchGrounding: true`, which adds `tools: [{ googleSearch: {} }]` to the config. The model can then search the web when it improves the answer (e.g. current procedures, factual checks). Responses may include `groundingMetadata` (webSearchQueries, groundingChunks, groundingSupports) for citations. Billing: per search query when the tool is used (see [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)). Reference: [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search).

**Multimodal (Vision) Input:** For the hybrid vision + skeleton pipeline, we support image inputs alongside text. The `generateWithGemini` function accepts an optional `images` parameter:

```typescript
// Multimodal input with screenshot
const result = await generateWithGemini(systemPrompt, userPrompt, {
  model: "gemini-3-flash-preview",
  images: [{ data: screenshotBase64, mimeType: "image/jpeg" }],
  responseJsonSchema: MY_SCHEMA,
})
```

When images are provided, the client builds multimodal content with images placed before the text prompt (visual context first). This is used in:

- **Planning** (when query has visual/spatial references)
- **Step refinement** (when task requires visual understanding)
- **Action generation** (for visual element identification)

**Image token costs** (from Gemini docs):
- Low detail mode (≤768x768): ~258 tokens fixed
- High detail mode: 85 base + 170 per 512x512 tile
- 1024px wide screenshot: ~1,000-1,100 tokens

Reference: [Gemini Vision](https://ai.google.dev/gemini-api/docs/vision), [Image tokens](https://ai.google.dev/gemini-api/docs/tokens#image-tokens).

**Thinking (Gemini 3 / 2.5):** Gemini 3 and 2.5 series use an internal reasoning process that improves multi-step planning, coding, and analysis. We pass `thinkingLevel` via `generateWithGemini` where relevant: **`thinkingLevel: "high"`** for planning, verification, critic, replanning, self-correction, outcome prediction, hierarchical and conditional planning (maximize reasoning depth); **`thinkingLevel: "low"`** for step refinement, context analysis, search manager, reasoning (analyzeTaskContext, verifyInformationCompleteness), action generation, and web search synthesis (minimize latency). When omitted, the model uses its default (e.g. `high` for Gemini 3). Reference: [Thinking](https://ai.google.dev/gemini-api/docs/thinking), [Gemini 3 thinking level](https://ai.google.dev/gemini-api/docs/gemini-3#thinking-level).

| Component | thinkingLevel | Purpose |
|-----------|---------------|---------|
| Planning, verification, critic, replanning, self-correction, outcome prediction, hierarchical/conditional planning | **high** | Maximize reasoning depth for complex multi-step tasks. |
| Step refinement, context analysis, search manager, reasoning, action generation, web search synthesis | **low** | Minimize latency for instruction-following and high-throughput paths. |

### 2. Multi-turn agent with function calling (`AgentRunner`)

Used by `POST /api/ai/agent` for chat-style agent runs with tools.

**Location:** `lib/ai/agent-runner.ts`

**Pattern:**

- **Model:** `gemini-3-flash-preview` (configurable via `AgentConfig.model`).
- **Contents:** Conversational history formatted as `contents[]` with `role` and `parts` (text and/or `functionCall` / `functionResponse`).
- **System:** `config.systemInstruction`.
- **Tools:** `config.tools` → `functionDeclarations`; when the model returns `functionCalls`, we execute tools and append `functionResponse` parts, then call `generateContent` again until the model returns text only.

**Reference:** [Function Calling](https://ai.google.dev/gemini-api/docs/function-calling).

---

## Models

| Purpose              | Model                     |
|----------------------|---------------------------|
| General / actions    | `gemini-3-flash-preview`  |
| Planning             | `gemini-3-flash-preview`  |
| Step refinement      | `gemini-3-flash-preview`  |
| Verification         | `gemini-3-flash-preview`  |
| Replanning           | `gemini-3-flash-preview`  |
| Critic               | `gemini-3-flash-preview`  |
| Self-correction      | `gemini-3-flash-preview`  |
| Outcome prediction   | `gemini-3-flash-preview`  |
| Reasoning / context  | `gemini-3-flash-preview`  |
| Contingency planning | `gemini-3-flash-preview`  |
| Hierarchical plan    | `gemini-3-flash-preview`  |
| Agent API (chat)     | `gemini-3-flash-preview`  |

Supported model IDs in our pricing module (see `lib/cost/pricing.ts`) include:

- **Gemini 3 (preview, default):** `gemini-3-flash-preview`, `gemini-3-pro-preview`, `gemini-3-pro-image-preview`
- **Gemini 2.x:** `gemini-2.0-flash`, `gemini-2.5-flash`
- **Gemini 1.5:** `gemini-1.5-pro`, `gemini-1.5-flash`
- **Gemini 1.0:** `gemini-1.0-pro`

Context limits (from Gemini docs): e.g. 1M input / 64k output for Gemini 3; see [models page](https://ai.google.dev/gemini-api/docs/models/gemini) for current limits.

---

## Grounding with Google Search vs Tavily

| Use case | Tool | When |
|----------|------|------|
| **Planning** | Google Search grounding | Always enabled (`useGoogleSearchGrounding: true`). Plans can be grounded in current info (e.g. product steps, procedures). |
| **Verification** | Google Search grounding | Always enabled. Verification can cite real-world facts when judging success. |
| **Web search (reasoning)** | Tavily | Used when the reasoning engine decides external search is needed (e.g. "how to X in OpenEMR"). Domain-restricted to the current site when configured. Use Tavily when confidence from Google Search grounding is lower or when domain-specific search is required (e.g. site-specific docs). |

**Summary:** Planner and verification LLM calls use **Grounding with Google Search** for better factual accuracy and citations. **Tavily** remains the provider for explicit web-search flows (context analysis → search query → Tavily API → synthesis); use it when results need to be scoped to a domain or when Google Search did not yield sufficient confidence.

---

## Where Gemini Is Used

| Component                  | File(s)                                      | Action type / purpose           |
|---------------------------|----------------------------------------------|----------------------------------|
| **LLM client**            | `lib/llm/gemini-client.ts`                   | `generateWithGemini()`           |
| **Action generation**     | `lib/agent/llm-client.ts`                   | ACTION_GENERATION, DIRECT_ACTION |
| **Planning**              | `lib/agent/planning-engine.ts`              | PLANNING                         |
| **Step refinement**       | `lib/agent/step-refinement-engine.ts`       | REFINEMENT                       |
| **Verification**          | `lib/agent/verification/semantic-verification.ts` | VERIFICATION              |
| **Replanning**            | `lib/agent/replanning-engine.ts`             | PLAN_VALIDATION                  |
| **Critic**                | `lib/agent/critic-engine.ts`                 | CRITIC                           |
| **Self-correction**       | `lib/agent/self-correction-engine.ts`       | SELF_CORRECTION                  |
| **Outcome prediction**    | `lib/agent/outcome-prediction-engine.ts`    | OUTCOME_PREDICTION               |
| **Reasoning / context**   | `lib/agent/reasoning-engine.ts`, `context-analyzer.ts`, `search-manager.ts` | CONTEXT_ANALYSIS, etc. |
| **Conditional planning**  | `lib/agent/conditional-planning.ts`          | CONTINGENCY_CHECK                |
| **Hierarchical planning** | `lib/agent/hierarchical-planning.ts`         | HIERARCHICAL_PLANNING            |
| **Web search (synthesis)** | `lib/agent/web-search.ts`                   | MULTI_SOURCE_SYNTHESIS           |
| **Chat/agent API**        | `lib/ai/agent-runner.ts`, `app/api/ai/agent/route.ts` | Multi-turn + tools        |

All of the above (except the chat API) use `generateWithGemini()` for a single request/response. The chat API uses `GoogleGenAI` directly in `AgentRunner` for multi-turn and function calls.

---

## Configuration

| Variable         | Required | Description                                                       |
|------------------|---------|-------------------------------------------------------------------|
| `GEMINI_API_KEY` | Yes*    | API key for Gemini. Required for agent/LLM features. Get at [Google AI Studio](https://aistudio.google.com/apikey). |

See `.env.example` and `docs/DEVELOPMENT.md` for the full env list.

---

## Cost and Usage Tracking

- **Pricing:** `lib/cost/pricing.ts` — single source of truth for Gemini model pricing (USD per 1M tokens). Updated from [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).
- **Recording:** `lib/cost/usage-service.ts` — `recordUsage()` dual-writes to:
  - **MongoDB** (`TokenUsageLog`) for billing and auditing.
  - **LangFuse** (when enabled) for observability.
- **Token usage:** Each engine that calls `generateWithGemini()` (or the agent runner) passes token counts and context (`tenantId`, `userId`, `taskId`, `actionType`, etc.) so that `recordUsage()` can compute cost and persist it.
- **Provider:** All logged usage uses provider `GOOGLE` (see `lib/models/token-usage-log.ts` and `lib/cost/usage-service.ts`).

### LangFuse tracking (when keys are set)

When LangFuse keys (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`) are set, LangFuse is enabled by default. We create **one trace per interact request** and pass its ID through the graph so all usage and scores attach to that trace (used for cost calculation).

| What | Where | How |
|------|--------|-----|
| **Trace per interact** | Start of each interact | `run-graph.ts` creates a `langfuseTraceId` and passes it through graph state; `startInteractTrace()` receives it so all scores attach to the same trace. |
| **LLM cost & tokens** | Every `recordUsage()` call (planning, verification, critic, step refinement, etc.) | Dual-write from `usage-service.ts`: scores `llm_cost_usd` and `llm_tokens_total`, linked via trace ID. |
| **Verification result** | After verification node | `recordVerificationScore()` → scores `verification_success`, `verification_confidence` (with trace ID). |
| **Correction attempt** | After correction node | `recordCorrectionAttempt()` → score `correction_success` (with trace ID). |
| **Task status** | End of interact flow | `finalizeInteractTrace()` → score `task_status` (with trace ID). |
| **Node execution** | Planning, context_analysis, action, etc. | `recordNodeExecution()` — **console only** (no LangFuse span). |
| **Generation** | LLM calls | `recordGeneration()` — **console only** (no LangFuse generation). |

MongoDB remains the source of truth for billing and per-session/task usage; LangFuse traces give per-request cost and score visibility.

---

## Error Handling and Observability

- **Gemini client:** `lib/llm/gemini-client.ts` catches errors, reports them to **Sentry** (with tags such as `component: "gemini-client"`, `model`), and rethrows. Empty or invalid responses are also reported.
- **Observability:** LLM traces and scores are sent to **LangFuse** when enabled; Sentry remains the primary tool for errors and performance. See `docs/INTERACT_FLOW_WALKTHROUGH.md` (Phase 1 Task 2 & 3) for details.

---

## Structured Output Edge Cases

Even though Gemini's structured output (`responseMimeType: "application/json"` + `responseJsonSchema`) **guarantees syntactically valid JSON**, there are documented edge cases where parsing can fail or require sanitization:

### Why Parsing is Still Needed

The Gemini SDK returns `response.text` as a **string**, not a parsed JavaScript object. Even the official Gemini documentation shows:

```javascript
// From Gemini docs - JSON.parse is required even with structured output
const recipe = recipeSchema.parse(JSON.parse(response.text));
```

Structured output guarantees the string will be **valid JSON matching your schema**, but it's still a string that must be parsed.

### Known Edge Cases

| Issue | Description | Frequency |
|-------|-------------|-----------|
| **Invisible characters** | BOM (Byte Order Mark), zero-width spaces, zero-width joiners | Rare |
| **Markdown fences** | Response wrapped in ` ```json ... ``` ` despite structured output | Very rare |
| **Truncation** | Response cut off when `maxOutputTokens` is exceeded; unbalanced braces | Occasional |
| **Grounding artifacts** | Extra content when `useGoogleSearchGrounding` is enabled | Very rare |
| **Encoding issues** | Character encoding mismatches from certain prompts | Very rare |

### Safe Parser: `parseStructuredResponse<T>()`

**Location:** `lib/llm/parse-structured-response.ts`

Instead of raw `JSON.parse()`, use the safe parser which handles all known edge cases:

```typescript
import { parseStructuredResponse, isParseSuccess, getField } from "@/lib/llm/parse-structured-response"

// After calling generateWithGemini with responseJsonSchema
const result = parseStructuredResponse<MyResponseType>(content, {
  generationName: "my_generation",
  taskId: context?.taskId,
  sessionId: context?.sessionId,
  schemaName: "MY_RESPONSE_SCHEMA",
})

if (isParseSuccess(result)) {
  // Access parsed data with type safety
  const myField = getField(result.data, "myField", defaultValue)
} else {
  // Handle parse failure with diagnostics
  log.warn(`Parse failed: ${result.error}`, result.diagnostics)
  // result.diagnostics.issueType tells you what went wrong:
  // "empty_content" | "markdown_wrapped" | "invisible_chars" | "truncated_json" | "invalid_json"
}
```

### What the Safe Parser Does

1. **Strips invisible characters**: BOM, zero-width spaces, zero-width joiners, soft hyphens
2. **Removes markdown fences**: Handles ` ```json ``` ` and ` ``` ``` ` wrapping
3. **Detects truncation**: Checks for unbalanced braces/brackets
4. **Attempts repair**: For truncated JSON, tries to close open structures
5. **Reports diagnostics**: Logs and reports to Sentry with detailed context when parsing fails
6. **Provides fallback info**: Returns the raw content and issue type for graceful degradation

### When to Use

| Scenario | Use Safe Parser? |
|----------|-----------------|
| Any `generateWithGemini` call with `responseJsonSchema` | **Yes** |
| Agent API multi-turn responses (function calling) | No (different format) |
| Raw text responses (no JSON expected) | No |

### Migration

Replace this pattern:

```typescript
// ❌ Old pattern - fails silently on edge cases
try {
  const parsed = JSON.parse(content)
  // use parsed...
} catch {
  return { success: false, confidence: 0.3, reason: content.substring(0, 200) }
}
```

With:

```typescript
// ✅ New pattern - handles edge cases with diagnostics
const result = parseStructuredResponse<MyType>(content, { generationName: "...", schemaName: "..." })
if (isParseSuccess(result)) {
  // use result.data...
} else {
  log.warn(`Parse failed: ${result.error}`, result.diagnostics)
  return { success: false, confidence: 0.3, reason: `Parse error (${result.diagnostics.issueType})` }
}
```

### Files Using Safe Parser

| File | Schema | Notes |
|------|--------|-------|
| `lib/agent/verification/semantic-verification.ts` | `VERIFICATION_RESPONSE_SCHEMA` | Full-DOM and observation-based verification |

**TODO:** Migrate remaining engines to use `parseStructuredResponse` for consistency.

---

## References (Gemini API)

- [Gemini API – Get started](https://ai.google.dev/gemini-api/docs)
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Generate content](https://ai.google.dev/gemini-api/docs) (including `systemInstruction`)
- [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) (JSON Schema, `responseMimeType`, `responseJsonSchema`)
- [Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Models overview](https://ai.google.dev/gemini-api/docs/models/gemini)
- [Thinking](https://ai.google.dev/gemini-api/docs/thinking) (thinking level, thought summaries)
- [Gemini API Cookbook](https://ai.google.dev/gemini-api/cookbook)

---

## Related Docs

- `INTERACT_FLOW_WALKTHROUGH.md` — End-to-end interact flow, observability, cost tracking.
- `ARCHITECTURE.md` — System architecture and intelligence layer (agent, LLM integration).
- `HYBRID_VISION_SKELETON_EXTENSION_SPEC.md` — Extension specification for hybrid vision + skeleton mode.
- `lib/llm/gemini-client.ts` — Implementation of `generateWithGemini` (including multimodal support).
- `lib/llm/multimodal-helpers.ts` — Multimodal content builders for vision input.
- `lib/ai/agent-runner.ts` — Multi-turn agent and function calling.
