# Cost Tracking Audit — Gemini & Tavily

This document summarizes how **Gemini** and **Tavily** API usage is tracked for costing and where token/usage breakdown is recorded at each step.

---

## 1. Costing pipeline

- **Central recording:** `lib/cost/usage-service.ts` — `recordUsage(input)`.
- **Dual-write:** MongoDB (`TokenUsageLog`) for billing/auditing; LangFuse for observability (scores `llm_cost_usd`, `llm_tokens_total`), linked by `langfuseTraceId` per interact.
- **Pricing:** `lib/cost/pricing.ts` — `calculateTokenCost(provider, model, usage)` (Gemini only; per‑1M input/output).
- **Breakdown:** Each `recordUsage` call stores `actionType`, `inputTokens`, `outputTokens`, `model`, `provider`, `tenantId`, `userId`, `sessionId`, `taskId`, `langfuseTraceId`. Aggregations use `getUsageSummary(filters)` with breakdown by `byActionType`, `byModel`, `byProvider`.

---

## 2. Gemini API — call sites and tracking

All Gemini calls go through `lib/llm/gemini-client.ts` → `generateWithGemini()`, which returns `content`, `promptTokens`, `completionTokens`. Cost tracking is done by calling `recordUsage()` after each call with those token counts.

| Step / component | File | Action type | Tracked |
|------------------|------|-------------|--------|
| **Planning** | `lib/agent/planning-engine.ts` | `PLANNING` | ✅ |
| **Step refinement** | `lib/agent/step-refinement-engine.ts` | `REFINEMENT` | ✅ |
| **Semantic verification (full DOM)** | `lib/agent/verification/semantic-verification.ts` | `VERIFICATION` | ✅ |
| **Semantic verification (observations only)** | `lib/agent/verification/semantic-verification.ts` | `VERIFICATION` | ✅ |
| **Critic** | `lib/agent/critic-engine.ts` | `CRITIC` | ✅ |
| **Replanning** | `lib/agent/replanning-engine.ts` | `PLAN_VALIDATION` | ✅ |
| **Self-correction** | `lib/agent/self-correction-engine.ts` | `SELF_CORRECTION` | ✅ |
| **Outcome prediction** | `lib/agent/outcome-prediction-engine.ts` | `OUTCOME_PREDICTION` | ✅ |
| **Conditional planning** | `lib/agent/conditional-planning.ts` | `CONTINGENCY_CHECK` | ✅ |
| **Hierarchical planning** | `lib/agent/hierarchical-planning.ts` | `HIERARCHICAL_PLANNING` | ✅ |
| **Action generation** | `lib/agent/llm-client.ts` | `ACTION_GENERATION` | ✅ |
| **Dynamic interrupt (RAG/ask)** | `lib/agent/dynamic-interrupt.ts` | `DYNAMIC_INTERRUPT` | ✅ |
| **Context analysis** | `lib/agent/reasoning/context-analyzer.ts` | `CONTEXT_ANALYSIS` | ✅ |
| **Search evaluation** | `lib/agent/reasoning/search-manager.ts` | `MULTI_SOURCE_SYNTHESIS` | ✅ |
| **Web search summary (LLM)** | `lib/agent/web-search.ts` | `MULTI_SOURCE_SYNTHESIS` | ✅ |
| **Reasoning: analyzeTaskContext** | `lib/agent/reasoning-engine.ts` | `CONTEXT_ANALYSIS` | ✅ (when `usageContext` passed) |
| **Reasoning: verifyInformationCompleteness** | `lib/agent/reasoning-engine.ts` | `CONTEXT_ANALYSIS` | ✅ (when `usageContext` passed) |

**Interact graph:** Context analysis and search manager receive `usageContext` (tenantId, userId, sessionId, taskId, langfuseTraceId) from the context-analysis node so all Gemini usage in that path is recorded and linked to the same trace.

---

## 3. Token usage breakdown at each step

- **Per call:** Each `recordUsage()` writes one log row: `actionType`, `inputTokens`, `outputTokens`, `model`, `costUSD`, `costCents`, `metadata` (e.g. query, url, operation name).
- **Per request:** All interact-path usage shares the same `langfuseTraceId` (and typically `sessionId`, `taskId`), so you can:
  - In MongoDB: filter by `taskId` / `sessionId` / `langfuseTraceId` and group by `actionType` for step-level breakdown.
  - In LangFuse: use the trace ID to see all scores (cost, tokens) for that message.
- **Aggregation:** `getUsageSummary(filters)` returns `breakdown.byActionType`, `breakdown.byModel`, `breakdown.byProvider` for high-level and step-level reporting.

---

## 4. Tavily API

- **Usage:** `lib/agent/web-search.ts` — `performTavilyAPI()` calls `https://api.tavily.com/search` (HTTP POST). No token-based usage; Tavily is request-based.
- **Costing:** Tavily is **not** included in the current costing logic. `TokenUsageLog` and `recordUsage` are built for LLM token usage (Gemini). To include Tavily you would need either:
  - A separate store (e.g. “external API usage”) and a small wrapper that records per-request or per-tenant usage, or
  - An optional, separate “Tavily request count” (or cost) field and aggregation, if you have a per-request cost model.

---

## 5. AgentRunner (`/api/ai/agent`) — not in costing

- **Location:** `app/api/ai/agent/route.ts` uses `lib/ai/agent-runner.ts`.
- **Behavior:** Calls `this.client.models.generateContent()` directly (Google GenAI SDK), not `generateWithGemini()`. No `recordUsage()` is called.
- **Result:** Usage from this route is **not** recorded in MongoDB or LangFuse.
- **Optional improvement:** Have `AgentRunner.run()` return usage (e.g. from `response.usageMetadata`) and call `recordUsage()` in the route with tenantId/userId (e.g. from session) and an action type such as `DIRECT_ACTION` or `GENERAL`.

---

## 6. Action types (reference)

Defined in `lib/models/token-usage-log.ts` as `LLMActionType`:

- `PLANNING`, `PLAN_VALIDATION`, `REFINEMENT`, `VERIFICATION`, `CONTEXT_ANALYSIS`, `SELF_CORRECTION`, `ACTION_GENERATION`, `OUTCOME_PREDICTION`, `DIRECT_ACTION`, `CRITIC`, `MULTI_SOURCE_SYNTHESIS`, `DYNAMIC_INTERRUPT`, `SKILLS_RETRIEVAL`, `CONTINGENCY_CHECK`, `HIERARCHICAL_PLANNING`, `GENERAL`

Use these for consistent step-level breakdown in reports and dashboards.
