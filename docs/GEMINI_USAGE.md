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

**Structured output status by component (verification):**

| Purpose (from Models table) | File(s) | Structured output? | Notes |
|-----------------------------|---------|--------------------|-------|
| General / actions | `lib/agent/llm-client.ts` | ✅ Yes | `ACTION_RESPONSE_SCHEMA` |
| Verification | `lib/agent/verification/semantic-verification.ts` | ✅ Yes | `VERIFICATION_RESPONSE_SCHEMA` (observation + full-DOM) |
| Planning | `lib/agent/planning-engine.ts` | ❌ No | Parses `<Step>`, `<Description>`, etc. |
| Step refinement | `lib/agent/step-refinement-engine.ts` | ❌ No | Parses thought/action or tool from text |
| Replanning | `lib/agent/replanning-engine.ts` | ❌ No | Parses validation result from text |
| Critic | `lib/agent/critic-engine.ts` | ❌ No | Parses `<Approved>`, `<Reason>`, etc. |
| Self-correction | `lib/agent/self-correction-engine.ts` | ❌ No | Parses correction from text |
| Outcome prediction | `lib/agent/outcome-prediction-engine.ts` | ❌ No | Parses `<Description>`, DOM changes from text |
| Reasoning / context | `lib/agent/reasoning-engine.ts`, `context-analyzer.ts`, `search-manager.ts` | ❌ No | Various text/JSON parsing |
| Contingency planning | `lib/agent/conditional-planning.ts` | ❌ No | Parses contingency from text |
| Hierarchical plan | `lib/agent/hierarchical-planning.ts` | ❌ No | Parses sub-tasks from text |
| Web search synthesis | `lib/agent/web-search.ts` | ❌ No | Free-form synthesis text |
| Agent API (chat) | `lib/ai/agent-runner.ts` | N/A | Multi-turn; uses `generateContent` directly, not single JSON response |

**Grounding with Google Search:** For planning and verification we pass `useGoogleSearchGrounding: true`, which adds `tools: [{ googleSearch: {} }]` to the config. The model can then search the web when it improves the answer (e.g. current procedures, factual checks). Responses may include `groundingMetadata` (webSearchQueries, groundingChunks, groundingSupports) for citations. Billing: per search query when the tool is used (see [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)). Reference: [Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search).

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
- `lib/llm/gemini-client.ts` — Implementation of `generateWithGemini`.
- `lib/ai/agent-runner.ts` — Multi-turn agent and function calling.
