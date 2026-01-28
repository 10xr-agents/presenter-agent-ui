# Interact Flow: Step-by-Step Walkthrough

**Purpose:** Explain how the backend processes a command from the Chrome extension from first request to completion. This document is the **canonical** flow description and **implementation roadmap** for the interact flow.  
**Example prompt:** *"Add a new patient with name 'Jas'"*

**Roadmap format:** When adding or updating implementation roadmap sections, follow the structure and best practices in `THIN_CLIENT_ROADMAP.md` (Objectives, Deliverables, Definition of Done, References, task ordering).

---

## Production Readiness Status

| Component | Status | Phase | Notes |
|-----------|--------|-------|-------|
| **Core Interact Loop** | ✅ Implemented | — | `app/api/agent/interact/route.ts` (now uses LangGraph) |
| **4-Step Reasoning Pipeline** | ✅ Implemented | — | Context analysis, web search, ASK_USER |
| **Planning Engine** | ✅ Implemented | — | `lib/agent/planning-engine.ts` |
| **Verification Engine** | ✅ Implemented | — | `lib/agent/verification-engine.ts` |
| **Self-Correction Engine** | ✅ Implemented | — | `lib/agent/self-correction-engine.ts` |
| **Outcome Prediction** | ✅ Implemented | — | `lib/agent/outcome-prediction-engine.ts` |
| **Step Refinement** | ✅ Implemented | — | `lib/agent/step-refinement-engine.ts` |
| **LangGraph.js + Complexity Routing** | ✅ **DEFAULT** | 1 | `lib/agent/graph/` - Always enabled, no flag needed |
| **LangFuse + Sentry Separation** | ✅ **COMPLETE** | 1 | `lib/observability/` - Enable with `ENABLE_LANGFUSE=true` |
| **Hybrid Cost Tracking** | ✅ **COMPLETE** | 1 | `lib/cost/` - Dual-write to MongoDB + LangFuse |
| **Action Chaining** | ✅ **COMPLETE** | 2 | `lib/agent/chaining/` - Chain safety analysis + partial failure recovery |
| **Knowledge Extraction Pipeline** | ✅ **COMPLETE** | 2 | `lib/knowledge/` - Multi-format doc ingestion + web crawling |
| **Two-Phase SPA Ingestion** | 🔲 Planned | 3 | Required for Knowledge Extraction |
| **DOM Similarity Algorithm** | ✅ **COMPLETE** | 3 | `lib/agent/dom-similarity.ts` - Jaccard similarity on element signatures |
| **Dynamic Re-Planning** | ✅ **COMPLETE** | 3 | `lib/agent/replanning-engine.ts` - Plan health check on DOM/URL change |
| **Look-Ahead Verification** | ✅ **COMPLETE** | 3 | `nextGoal` in ExpectedOutcome schema + verification engine |
| **Critic Loop** | ✅ **COMPLETE** | 4 | `lib/agent/critic-engine.ts` - Pre-execution reflection |
| **Multi-Source Synthesis** | ✅ **COMPLETE** | 4 | `requiredSources` array in context analysis |
| **Dynamic Interrupt** | ✅ **COMPLETE** | 4 | `lib/agent/dynamic-interrupt.ts` - Mid-flight MISSING_INFO handling |
| **Skills Library** | ✅ **COMPLETE** | 4 | `lib/models/skill.ts` + `lib/agent/skills-service.ts` - Tenant/domain scoped |
| **Conditional Planning** | ✅ **COMPLETE** | 4 | `lib/agent/conditional-planning.ts` - Tree of thoughts with contingencies |
| **Hierarchical Planning** | ✅ **COMPLETE** | 4 | `lib/agent/hierarchical-planning.ts` - Sub-task decomposition |

**Legend:** ✅ = Complete/Default | 🔄 = In Progress | 🔲 Planned

**Critical Path:** ~~LangGraph + Complexity Routing~~ → ~~LangFuse~~ → ~~Cost Tracking~~ → ~~Action Chaining~~ → ~~Skills Library~~ → ✅ Phase 4 Complete

---

## High-Level Loop

1. **Extension** sends `POST /api/agent/interact` with `{ url, query, dom, taskId?, sessionId? }`.
2. **Backend** authenticates, fetches RAG, runs reasoning/planning, calls LLM (or step refinement), predicts outcome, stores the action, returns `{ thought, action, taskId, sessionId, ... }`.
3. **Extension** executes the action (e.g. `click(68)`, `setValue(42, "Jas")`) on the page, then sends the **next** request with **updated `url` and `dom`** and **the same `taskId`** from the response.
4. **Backend** verifies the **previous** action against the new DOM/URL, then produces the **next** action. Repeat until `finish()` or `fail()` or max steps/retries.

### ⚠️ Client contract: why the same step can repeat

If the extension **does not send `taskId`** on the request that follows an executed action, the backend treats every request as a **new task**. That causes:

- Each request: "go to overview section" with **no taskId** → backend returns the **first** step again (e.g. `click(169)`).
- The same message is effectively processed many times and the user sees "1 step processed" repeatedly.

**Required behavior:**

- **First request (new task):** Send `{ url, query, dom, sessionId? }` — no `taskId`.
- **After executing an action:** Send the **next** request with:
  - **`taskId`** from the previous response (required for continuation).
  - **Updated `dom`** (and `url` if it changed) after the click/input.
  - **`sessionId`** unchanged.
  - Optionally the same `query` or omit it; the backend will verify and return the next step or `finish()`.

If the extension stores the response’s `taskId` and sends it (with updated dom) on the next call, the loop advances: verification → next action or completion — and the same step will not repeat.

**Troubleshooting: same step repeats even when client sends `taskId`**

The backend persists each returned action as a **TaskAction** so the next request can load `previousActions` and route to **verification** (not `direct_action`). If the same step keeps repeating with `hasTaskId: true` in logs, check server logs for:

1. **After first request:** `[RouteIntegration] saveGraphResults: creating TaskAction taskId=..., stepIndex=0, action=click(169)` — confirms the action was persisted. If you see `TaskAction.create failed`, inspect the error (e.g. validation, duplicate key).
2. **On follow-up request:** `[RouteIntegration] loadTaskContext: taskId=..., previousActions.length=1, hasLastAction=true, lastAction=click(169)` — confirms the task had one previous action and `lastAction` is set. If `previousActions.length=0` or `hasLastAction=false`, the follow-up is not seeing the persisted action (wrong `taskId`, wrong tenant, or TaskAction not created).
3. **Router:** `[Graph:router] Routing to verification (existing task)` — confirms the graph is going to verification. If you still see `Routing to direct_action (SIMPLE task)` on the follow-up, the state had `previousActions.length === 0` (see step 2).

Ensure the client sends the **exact `taskId`** from the previous response (`data.taskId`) and that the same tenant/user is used.

---

## Phase 1: First Request (New Task)

**Extension sends:** `{ url: "https://app.example.com/", query: "add a new patient with name \"Jas\"", dom: "<html>...", sessionId?: "..." }`  
**No `taskId`** → this starts a new task.

### Step 1.1 — Auth & rate limit

- Validate Bearer token → `userId`, `tenantId`. Return **401** if missing/invalid.
- Apply rate limit (e.g. 10 req/min for interact). Return **429** if exceeded.

### Step 1.2 — Parse & validate body

- Parse JSON body.
- Validate with `interactRequestBodySchema`: `url`, `query`, `dom` required; `taskId`, `sessionId`, `lastActionStatus`, `previousUrl`, etc. optional.
- Return **400** if validation fails.

### Step 1.3 — Session

- If `sessionId` provided: load session, optionally update last message with `lastActionStatus` / `lastActionError`.
- If not: create new session, store **user message** with `content: "add a new patient with name \"Jas\""`.

### Step 1.4 — RAG (knowledge)

- Call `getRAGChunks(url, query, tenantId)`.
- **Always** fetched once per request (before task resolution). We do **not** “decide when to query knowledge” — we always pull RAG first.
- Uses **allowed_domains** and org-specific vs public knowledge.
- Returns `{ chunks, hasOrgKnowledge }`. Chunks are passed to context analysis, planning, and action prompts; extension never sees them.

### Step 1.5 — New task: reasoning pipeline (before planning)

Because there is **no `taskId`**, we run the **4-step reasoning pipeline** **before** creating the task or generating a plan. **No DOM actions run until after planning** (Step 1.6) and we produce the first action.

**1. Context analysis (LLM)**

- `analyzeContext({ query, url, chatHistory, pageSummary, ragChunks, hasOrgKnowledge })`.
- **Implemented as an LLM call** (gpt-4o-mini). The **context analyzer** decides whether we already have what we need or must search/ask.
- It is given: user `query`, `url`, **chat history** (memory), **page summary** (from DOM), **RAG chunks** (knowledge), and `hasOrgKnowledge`.
- It returns **source**: `MEMORY` (chat has it), `PAGE` (visible on screen), `WEB_SEARCH` (need external search), or `ASK_USER` (need user input).
- So **the LLM decides**: use knowledge/memory/page vs run web search vs ask user. We do **not** use a separate “when to query knowledge” step — RAG is always queried; the LLM decides if that (plus memory/page) is enough or if we need search.

**2. ASK_USER (if needed)**

- If `source === "ASK_USER"`: return `NeedsUserInputResponse` (e.g. “I need the following information…”) and **stop**. No task created.

**3. Web search (if needed) — Tavily**

- **When:** Only if `source === "WEB_SEARCH"` (context analysis decided external search is needed).
- **Call path:** `manageSearch(...)` → `performWebSearch()` → `performTavilySearch()` → `performTavilyAPI()` (HTTP to `https://api.tavily.com/search`).
- Uses refined query from context analysis (not raw user input).
- Domain filtering: restricts results to the current page's domain by default.
- Iterative refinement: evaluates results, refines query if needed (max 3 attempts).
- If “should ask user” and not solved → return `NeedsUserInputResponse` and **stop**.
- Otherwise, `webSearchResult` is stored on the task (injected into planning/action prompts).
- **If source is MEMORY or PAGE:** web search is **skipped**; Tavily is **not** called here.

**4. Create task**

- Generate `taskId` (UUID).
- Create **Task** with `taskId`, `tenantId`, `userId`, `url`, `query`, `status: "active"`, optional `webSearchResult`.
- Set `currentStepIndex = 0`.

### Step 1.6 — Planning (after reasoning)

- **Planning runs only after** reasoning (context analysis + optional web search) and task creation.
- Load task. If no **plan** exists:
  - `generatePlan(query, url, dom, chunks, hasOrgKnowledge, webSearchResult)`.
  - Store plan in `task.plan`, set `status: "executing"`.
- Plan has **steps** (e.g. “Open Patient menu”, “Click New/Search”, “Fill form”, “Submit”). `currentStepIndex` points at the next step to run.
- Planning receives **RAG chunks** and **webSearchResult** (if any); it does **not** decide when to search — that was already decided by context analysis.

### Step 1.7 — Step refinement or LLM action

**If plan exists and current step is refinable:**

- `refineStep(currentPlanStep, dom, url, previousActions, chunks, hasOrgKnowledge)`.
- Produces a **DOM tool** action (e.g. `click(68)`) from the plan step. If it returns a **SERVER** tool, we fall back to LLM.

**If no refinement (or SERVER / refinement failed):**

- Build **action prompt** via `buildActionPrompt({ query, currentTime, previousActions, ragChunks, hasOrgKnowledge, dom, systemMessages })`.
- Optional **system messages**: e.g. “Previous action failed… try a different strategy” if `lastActionStatus === "failure"`.
- **Call LLM** `callActionLLM(system, user)`.
- **Parse** `<Thought>...</Thought><Action>...</Action>` from the response → `thought`, `action`.

**Special handling:**

- `googleSearch("...")` → run **`performWebSearch`** (Tavily). Inject summary into `thought`, replace action with `wait(1)`. **This is the second place Tavily is used** (when the LLM explicitly requests search mid-task).
- `verifySuccess("...")` → either keep it or convert to `finish()` depending on recent failures.
- `finish()` after recent failures → force `verifySuccess("...")` first.

### Step 1.8 — Action validation

- `validateActionName(action)`: must be one of `click(id)`, `setValue(id, "text")`, `finish()`, `fail(reason)`, `navigate(...)`, `goBack()`, etc.
- If invalid → mark task **failed**, return **400**.

### Step 1.9 — Outcome prediction (Task 9)

- `predictOutcome(action, thought, dom, url, chunks, hasOrgKnowledge)`.
- **Action-type** matters:
  - **Dropdown** (e.g. `click` on `aria-haspopup`) → **fixed** template: `urlShouldChange: false`, `aria-expanded`, menu-like elements. No LLM.
  - **Navigation** (`navigate`, `goBack`) → **fixed** template: `urlShouldChange: true`. No LLM.
  - **Generic** → LLM-based prediction.
- Result → `expectedOutcome` (description + DOM expectations). Stored with the action.

### Step 1.10 — Store action & update task

- **TaskAction** created: `stepIndex`, `thought`, `action`, `expectedOutcome`, `domSnapshot`, `metrics`.
- Task **metrics** updated (steps, durations, token usage).
- If **plan** exists: mark current step **completed**, advance `plan.currentStepIndex`.
- If action is `finish()` or `fail()`: set task `status` to **completed** or **failed**, update session status.

### Step 1.11 — Save assistant message & respond

- If **session** exists: create **Message** with `role: "assistant"`, `content: thought`, `actionString: action`, optional `domSummary` / `snapshotId`.
- Return **NextActionResponse**:
  - `thought`, `action`, `taskId`, `hasOrgKnowledge`
  - `usage`, `metrics`, `plan`, `stepIndex`, `status`
  - `verification` (none on first request), `expectedOutcome`, `sessionId`, etc.

---

## Phase 2: Extension executes action

- Extension parses `action` (e.g. `click(68)`).
- Finds element with **id 68** in the DOM (or similar mapping), runs `click` via Chrome automation.
- Page may change: new URL, new DOM (e.g. dropdown opens or form loads).
- Extension sends the **next** request with **same `taskId`**, **updated `url`** and **`dom`**.

---

## Phase 3: Subsequent Request (Continuation)

**Extension sends:** `{ url, query, dom, taskId, sessionId?, previousUrl?, lastActionStatus?, ... }`  
**`taskId`** present → we’re continuing an existing task.

### Step 3.1 — Auth, validation, RAG

- Same as Phase 1: auth, rate limit, body validation, **RAG** (chunks fetched again for this request).

### Step 3.2 — Load task & history

- Load **Task** by `taskId` + `tenantId`. **404** if not found. **409** if `status` is `completed` or `failed`.
- Load **action history**: from **Messages** (or fallback **TaskAction**), build `previousActions` and `currentStepIndex`.

### Step 3.3 — Verify **previous** action (Task 7)

- Load **TaskActions** for this task. Take the **last** one (the action we told the extension to run).
- If it has **`expectedOutcome`**:
  - **previousUrl**: use `previousUrl` from body, or **last verification record**’s `actualState.url` (for step N−1), or **task baseline** `task.url`.
  - `verifyAction(expectedOutcome, dom, url, previousUrl, previousAction.action)`:
    - **DOM checks**: e.g. URL change, `aria-expanded`, elements appeared, element exist/not exist/text (dropdowns skip strict checks).
    - **Semantic verification**: LLM compares expected vs actual — **skipped for dropdowns** (DOM-only).
    - **Popup override**: for dropdowns, if URL unchanged and `aria-expanded` OK, boost confidence.
  - Persist **VerificationRecord** (success, confidence, reason, etc.).
  - On **success**: reset `consecutiveFailures`.
  - On **failure**: trigger **self-correction** (Task 8).

### Step 3.4 — Self-correction (Task 8) when verification fails

- Check **retry limits**: `maxRetriesPerStep` (e.g. 3) and **consecutive** failures.
- If **over limit** → mark task **failed**, return **400** `MAX_RETRIES_EXCEEDED` or `CONSECUTIVE_FAILURES_EXCEEDED`.
- Otherwise:
  - `generateCorrection(failedStep, verificationResult, dom, url, chunks, hasOrgKnowledge, failedAction)`.
  - Uses **action-type** (e.g. dropdown): inject hints like “select a **menu item** (e.g. New/Search), not another nav button.”
  - Returns **corrected** step and **retry action** (e.g. `click(79)` for “New/Search”).
  - Store **CorrectionRecord**, update **plan** with corrected step, set task `status: "correcting"`.
  - **Return immediately** with `thought` + `action: retryAction` (and `correction` metadata). **No new TaskAction** appended; extension will execute the retry.

### Step 3.5 — Max steps check

- If `currentStepIndex >= MAX_STEPS_PER_TASK` (e.g. 50): mark task **failed**, return **400** `MAX_STEPS_EXCEEDED`.

### Step 3.6 — Next action (same as Phase 1)

- **Planning**: use existing plan; advance to next step if previous step completed.
- **Refine or LLM**: same as Steps 1.7–1.8 (refine current plan step or `buildActionPrompt` + `callActionLLM`, parse, validate).
- **Outcome prediction**: same as Step 1.9 (dropdown/navigation fixed vs generic LLM).
- **Store TaskAction**, update metrics, plan, task status.
- **Save assistant message**, return **NextActionResponse** (including `verification` for the **previous** action).

---

## Phase 4: Loop until done

- Extension **repeats**: execute action → send `{ url, dom, taskId, ... }` → backend verifies previous action, optionally corrects, then returns next action.
- Loop ends when:
  - **`finish()`**: task **completed**, session status updated.
  - **`fail(reason)`**: task **failed**.
  - **Max steps** or **max retries / consecutive failures**: task **failed**, **400** with corresponding code.

---

## Example Flow: “Add a new patient with name ‘Jas’”

| # | Who | What |
|---|-----|------|
| 1 | Extension | Sends `query: "add a new patient with name \"Jas\""`, `url`, `dom`. No `taskId`. |
| 2 | Backend | Auth, RAG, context analysis (e.g. MEMORY or PAGE). Create task, generate plan. |
| 3 | Backend | Plan step 0 e.g. “Open Patient menu”. Refine → `click(68)` (Patient button). Predict outcome (dropdown) → fixed template. Store TaskAction, return `{ thought, action: "click(68)", taskId }`. |
| 4 | Extension | Executes `click(68)`. Dropdown opens. Sends request with same `taskId`, updated `dom`. |
| 5 | Backend | Verify previous action (dropdown): URL unchanged, `aria-expanded`, menu-like content → **pass**. Plan step 1 e.g. “Click New/Search”. Refine → `click(79)`. Store, return `action: "click(79)"`. |
| 6 | Extension | Executes `click(79)`. Navigates to “Add patient” form. Sends `taskId`, new `url`, `dom`. |
| 7 | Backend | Verify `click(79)` (e.g. URL change). Next step: fill form. Refine or LLM → e.g. `setValue(101, "Jas")` for name field. Store, return. |
| 8 | Extension | Fills “Jas” in name field, sends updated `dom`. |
| 9 | Backend | Verify `setValue`. Next step: submit. LLM → `click(201)` (Submit). Store, return. |
| 10 | Extension | Clicks Submit. Success screen. Sends final `dom`. |
| 11 | Backend | Verify `click(201)`. Next action: `finish()`. Task **completed**. Return `finish()`. |
| 12 | Extension | Shows “Task completed” (or similar). Stops loop. |

If at step 5 we had **wrongly** clicked “Visits” instead of “New/Search”, verification would **fail** (e.g. no form, wrong URL). Self-correction would suggest **“select menu item New/Search”** and return `click(79)`; extension retries, and we continue as above.

---

## When is Tavily (web search) used?

**Tavily is used only in two cases:**

1. **Reasoning (Step 1.5):** `source === "WEB_SEARCH"` → `manageSearch` → `performWebSearch` → Tavily. Skipped when source is MEMORY or PAGE.
2. **Action (Step 1.7):** LLM returns `googleSearch("...")` → we run `performWebSearch` (Tavily), inject results into `thought`, replace action with `wait(1)`.

In the **“Add a new patient”** example, context is typically **MEMORY** or **PAGE**, and the plan uses only DOM actions (`click`, `setValue`). **Tavily is not used** in that flow.

---

## Planning, knowledge, and web-search decisions

**Are we doing any planning before starting the task?**

- Yes. For **new tasks**, we run **reasoning** (context analysis + optional web search) **first**, then **create the task**, then **planning** (step-by-step breakdown), then produce the **first action**. No DOM actions execute until we have a plan (or fallback) and return that first action. So we always plan before acting.

**How do we decide when to do web search?**

- A dedicated **LLM** — the **context analyzer** (`analyzeContext`, gpt-4o-mini) — decides. It receives the user query, URL, chat history, page summary, and **RAG chunks**. It returns **source**: `MEMORY` | `PAGE` | `WEB_SEARCH` | `ASK_USER`. If **source === `WEB_SEARCH`**, we run Tavily (`manageSearch` → `performWebSearch`). Otherwise we skip web search.

**Do we figure out “do we have the required information?” and “when to query knowledge vs web search?” in the LLM?**

- **Knowledge (RAG):** We **always** query it up front (`getRAGChunks`). We do **not** decide “when to query knowledge” — we always fetch RAG before reasoning.
- **Use knowledge vs web search vs ask user:** The **context analyzer LLM** decides. It sees RAG chunks (and memory, page) and chooses the **best source**. So the **same LLM** determines whether we already have enough (MEMORY/PAGE) or need **web search** (WEB_SEARCH) or **user input** (ASK_USER).

---

## Summary

- **First request:** Session + RAG + reasoning (context, optional search) → create task → plan → refine or LLM → validate → predict outcome → store action → return `thought` + `action` + `taskId`.
- **Later requests:** Load task + history → **verify previous action** (using `dom`/`url`) → on failure, **self-correct** and return retry action; else **next** refine/LLM → predict outcome → store action → return.
- **Extension:** Executes each `action`, then sends updated `url`/`dom` with same `taskId` until `finish()` / `fail()` or error.

All processing is **server-side**; the extension only sends state (url, dom, query, taskId) and executes returned actions.

---

## Planned Open-Source Stack

We plan to use the following open-source (and optionally paid) technologies to implement and improve the interact flow. **LangFuse** is acceptable in its paid form; it offers a **free trial** for initial use.

### Smart Ingestion Pipeline (Node.js)

For HTML/web content (the majority of the agent’s work), we use a **Node.js “Smart Ingestion” stack** instead of Python-based **Marker**. No single pure Node.js library matches Marker’s layout intelligence 1:1, but this combination gives **structured**, **clean** input for RAG and context analysis.

#### 1. Converter: **Turndown** (+ `turndown-plugin-gfm`)

- **Role:** HTML → Markdown. Replaces Marker for HTML conversion.
- **Why:** Raw `innerText` flattens tables and lists into “soup”; Turndown preserves **structure** (tables, lists, headings) so the LLM can distinguish e.g. “Patient Name” vs “DOB” in grids.
- **Critical:** Use **`turndown-plugin-gfm`** for **tables** (GitHub Flavored Markdown).
- **Example:**

```typescript
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"

const turndownService = new TurndownService({ headingStyle: "atx" })
turndownService.use(gfm) // Critical for tables
const markdown = turndownService.turndown(htmlContent)
```

#### 2. Cleaner: **@mozilla/readability**

- **Role:** Noise reduction before Markdown conversion. Strips ads, navbars, footers, scripts.
- **Why:** Raw DOM sent to the Context Analyzer wastes tokens; Readability (Firefox “Reader View” algorithm) scores content density and extracts the **main article** or **main form**.
- **Result:** Cleaner, focused input → fewer hallucinations, better reasoning.

#### 3. Manipulator: **Cheerio**

- **Role:** Pre-processing “DOM surgery” on the server.
- **Why:** Readability can over-strip (e.g. a sidebar form you need). Cheerio lets you remove `display: none`, `aria-hidden="true"`, etc. *before* conversion so the pipeline matches what the user actually sees.

#### 4. PDFs: **Gotenberg** (Docker)

- **Use when:** RAG must ingest complex PDFs (e.g. OpenEMR manuals) and we stay in Node.js.
- **Approach:** Do **not** use pure Node PDF libs (e.g. `pdf-parse`) for complex layouts. Use **Gotenberg** (Docker API) to **convert PDF → HTML**, then run the same **HTML → Turndown → Markdown** pipeline.
- **Flow:** `PDF` → **Gotenberg** → `HTML` → **Turndown** (+ Readability/Cheerio as needed) → `Markdown`.
- **Rationale:** Chrome’s PDF rendering preserves layout better than JS-based extractors; converting to HTML first reuses the robust Turndown pipeline.

**Marker vs Node stack (high level):**

| Feature | Marker (Python) | Node stack (Turndown + Readability + Cheerio) |
|--------|------------------|-----------------------------------------------|
| **PDF parsing** | ⭐⭐⭐⭐⭐ (OCR/layout) | ⭐⭐ (text-only) or ⭐⭐⭐⭐ via Gotenberg → HTML |
| **HTML parsing** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (faster, native) |
| **Tables** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ (good enough for forms) |
| **Speed** | Slow (ML models) | **Instant** (regex/heuristics) |

**Recommendation:** Use the Node stack for HTML/web; use **Gotenberg → HTML → Turndown** for complex PDFs when needed.

---

### Reason → Act → Verify Layer

#### 1. Orchestration: **LangGraph.js** (MIT)

- **Role:** Formalize the “Reason → Act → Verify” loop as a **graph** (nodes + edges).
- **Why:** Replaces custom `task.status` and ad hoc state with a **state machine** that natively supports **persistence**, **cycles**, and **branching**. On failure at Step 3, LangGraph retains state for Steps 1–2; you can resume, debug, or fork alternative paths.
- **Implementation:** Define nodes (e.g. `reasoning`, `execution`, `verification`) and edges (`if success → next`, `if fail → correct`). Simplifies correction and refinement flows.

#### 2. Observability: **LangFuse** (Open Source / Paid Cloud; free trial)

- **Role:** **Traceability** for the agent: full trace from *Input → Context Analysis → Plan → Action → Result*.
- **Why:** When the agent hallucinates or fails, we can see which retrieval chunk or step caused it. **Scores** (e.g. “Did verification pass?”) support tracking success rate over time as prompts change.
- **Note:** We are OK using the **paid** version; **free trial** is used for initial adoption.

#### 3. Memory (Episodic Learning): **Zep** (Apache 2.0)

- **Role:** Decouple **memory** from application logic; support “learning from mistakes.”
- **Why:** Zep classifies memories into **Facts** (e.g. “Jaswanth is a patient”) and **Summaries** (interaction history). **Vector search** over history lets the agent ask *“Have I failed this specific task before?”* and get e.g. *“Yes; last time `click(68)` failed; you used `click(79)` instead.”*
- **Alignment:** Supports the **Episodic Memory (Skills Library)** improvement in § LLM Flow & Advanced Logic.

---

### Summary: “Leap” Stack

| Layer | Tool | License | Benefit |
|-------|------|---------|---------|
| **Smart ingestion** | **Turndown** + **Readability** + **Cheerio** (+ **Gotenberg** for PDFs) | Various (MIT, etc.) | Structured HTML→Markdown; less noise; faster than Marker for web. |
| **Orchestration** | **LangGraph.js** | MIT | Reason→Act→Verify state machine; persistence, cycles, correction flows. |
| **Observability** | **LangFuse** | MIT / Paid (free trial) | Full agent trace; scores; success-rate tracking. |
| **Memory** | **Zep** | Apache 2.0 | Episodic learning; vector search over past failures/successes. |

**Recommendation:** Start with **Foundation** (LangGraph.js, LangFuse, **Hybrid Cost Tracking**) per § Implementation Roadmap: Foundation, then **Knowledge Extraction** (migrate to app + MongoDB, smart ingestion, Zep) per § Implementation Roadmap: Knowledge Extraction. LangGraph.js simplifies the interact loop; cost tracking (dual-write to DB + LangFuse) ensures we capture token usage and cost from the first LLM calls; smart ingestion and Zep are used in the knowledge extraction migration.

---

## Implementation Roadmap: Overview

Implementation order (do **Foundation** and **Knowledge Extraction** first, then **Batch & Adapt**, then **LLM Flow & Advanced Logic**):

| Phase | Section | Tasks |
|-------|---------|-------|
| **1** | Foundation (Orchestration, Observability & Cost Tracking) | Orchestration + **Complexity Routing** (LangGraph.js), Observability (LangFuse + Sentry separation), **Hybrid Cost Tracking (Dual-Write)** |
| **2** | Knowledge Extraction | Migrate from browser automation service to app + MongoDB; smart ingestion; **Two-phase SPA ingestion**; Zep memory |
| **3** | Batch & Adapt | Action chaining (with partial failure handling), dynamic re-planning (with DOM similarity algorithm), look-ahead verification |
| **4** | LLM Flow & Advanced Logic | Critic loop, multi-source synthesis, episodic memory (with scope/limits), conditional planning, hierarchical planning |

**⚠️ CRITICAL CHANGES:**
- **Complexity Routing** moved to **Foundation** (bundled with LangGraph) — do NOT defer
- **DOM Similarity Algorithm** required before Dynamic Re-Planning
- **Skills Library scope/limits** required for Episodic Memory
- **Two-phase SPA ingestion** required for Knowledge Extraction migration

---

## Implementation Roadmap: Foundation (Orchestration, Observability & Cost Tracking)

These tasks come **first** in the roadmap. They establish the **orchestration** (LangGraph.js), **observability** (LangFuse + Sentry separation), and **cost tracking** (dual-write to DB + LangFuse) that the rest of the flow builds on. We track costs **as early as possible**—in Foundation—so every LLM call is accounted for from day one. Format follows `THIN_CLIENT_ROADMAP.md` for best practices.

### Task 1: Orchestration + Complexity Routing (LangGraph.js)

**Objective:** Migrate the custom interact loop (Reason → Act → Verify) to **LangGraph.js** **with complexity routing built-in from day one**. Replace ad hoc `task.status` and state handling with a **graph-based state machine** that natively supports persistence, cycles, branching, and **fast-path bypass for simple tasks**.

**⚠️ CRITICAL:** Complexity routing MUST be implemented alongside LangGraph—not after. Without fast-path, every "Click Logout" runs through the full graph, adding unnecessary latency.

**Deliverable:**

- **Server:** Define LangGraph **nodes** (e.g. `complexity_check`, `reasoning`, `planning`, `execution`, `verification`, `correction`) and **edges** (`if SIMPLE → direct_action`, `if COMPLEX → reasoning`, `if success → next`, `if fail → correct`, etc.). Integrate with `POST /api/agent/interact` (or equivalent). Persist graph state so execution can resume, fork, or debug.
- **Fast-Path Node:** Implement `complexity_check` as the **entry node**. If `complexity === SIMPLE`, route directly to `direct_action` node (skip reasoning, planning). If `complexity === COMPLEX`, proceed to `reasoning` node.
- **Benefit:** Correction and refinement flows become easier to manage; "time travel" and alternative-path debugging are supported; simple tasks complete 2-3x faster.

**Graph Structure:**

```
                    ┌─────────────────┐
                    │ complexity_check │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │ SIMPLE                      │ COMPLEX
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │  direct_action  │           │    reasoning    │
    └────────┬────────┘           └────────┬────────┘
             │                             │
             │                    ┌────────┴────────┐
             │                    │    planning     │
             │                    └────────┬────────┘
             │                             │
             └──────────┬──────────────────┘
                        ▼
              ┌─────────────────┐
              │    execution    │
              └────────┬────────┘
                       │
              ┌────────┴────────┐
              │  verification   │
              └────────┬────────┘
                       │
         ┌─────────────┴─────────────┐
         │ SUCCESS                   │ FAILURE
         ▼                           ▼
   (next step or finish)     ┌─────────────────┐
                             │   correction    │
                             └────────┬────────┘
                                      │
                                      └──► execution (retry)
```

**Complexity Classification Criteria:**

| Complexity | Criteria | Example |
|------------|----------|---------|
| **SIMPLE** | Single action, no ambiguity, element clearly identifiable | "Click Logout", "Click the Submit button" |
| **COMPLEX** | Multi-step, requires reasoning, form fill, or navigation | "Add a new patient with name Jas" |

**Implementation:**

```typescript
// lib/agent/complexity-classifier.ts
interface ComplexityResult {
  complexity: "SIMPLE" | "COMPLEX"
  confidence: number
  reason: string
}

function classifyComplexity(query: string, dom: string): ComplexityResult {
  // Heuristics (fast, no LLM):
  // 1. Word count < 5 and contains action verb → likely SIMPLE
  // 2. Contains "fill", "add", "create", "form" → likely COMPLEX
  // 3. Query mentions multiple fields or steps → COMPLEX
  
  // LLM fallback for ambiguous cases (optional)
}
```

**Definition of Done:**

- [x] Interact flow runs through LangGraph; nodes and edges match current Reason→Act→Verify loop.
- [x] `complexity_check` node classifies tasks as SIMPLE or COMPLEX.
- [x] SIMPLE tasks bypass `reasoning` and `planning` nodes (latency improvement pending measurement).
- [x] State is persisted; failure at verification can resume or branch without losing prior context.
- [x] No regression in existing interact behavior; extension contract unchanged.
- [x] LangGraph is now the **default and only execution path** (no feature flag needed).

**Implementation Details (Completed 2026-01-28):**

| File | Purpose |
|------|---------|
| `lib/agent/graph/types.ts` | Graph state types and configuration |
| `lib/agent/graph/complexity-classifier.ts` | Fast heuristic-based complexity classification (no LLM) |
| `lib/agent/graph/nodes/*.ts` | Individual graph nodes (10 nodes) |
| `lib/agent/graph/interact-graph.ts` | LangGraph state machine definition |
| `lib/agent/graph/executor.ts` | Graph execution wrapper |
| `lib/agent/graph/route-integration.ts` | Bridge between route and graph |
| `lib/agent/graph/index.ts` | Module exports |
| `app/api/agent/interact/route.ts` | Clean route handler using LangGraph |

**Status: ALWAYS ENABLED**

LangGraph is now the default execution path. No feature flag or environment variable is needed.
The legacy monolithic route handler has been removed.

**Metrics to Track:**

- Latency: SIMPLE path p50/p95 vs COMPLEX path p50/p95
- Classification accuracy: % of SIMPLE tasks that actually needed COMPLEX treatment
- Throughput: Requests/second improvement

**References:** § Planned Open-Source Stack (LangGraph.js), `SERVER_SIDE_AGENT_ARCH.md` §4, § Batch & Adapt Task 3 (Complexity Routing).

---

### Task 2: Observability (LangFuse + Sentry Separation)

**Objective:** Integrate **LangFuse** for **LLM-specific traceability** while maintaining **Sentry** for **error monitoring**. Establish clear boundaries to avoid duplicate instrumentation.

**⚠️ CRITICAL:** We already have comprehensive Sentry integration. LangFuse adds value for LLM-specific traces but must NOT duplicate Sentry's error monitoring.

**Observability Separation Matrix:**

| Concern | Tool | What to Log |
|---------|------|-------------|
| **Errors, exceptions, crashes** | **Sentry** | Stack traces, error types, error frequency, user impact |
| **LLM traces, prompt versions, latency** | **LangFuse** | Input/output tokens, prompt templates, model versions, generations |
| **Business metrics (task completion)** | **MongoDB + Dashboard** | Task success rate, steps per task, user retention |
| **Performance (p50/p95 latency)** | **Both** (Sentry for alerts, LangFuse for LLM-specific) | Request duration, LLM call duration |

**What LangFuse Captures (NOT Sentry):**

1. **LLM Generations:** Each `callActionLLM`, `analyzeContext`, `generatePlan` call → LangFuse generation with prompt, completion, tokens, latency
2. **Trace Hierarchy:** Full trace from request → context → plan → action → verify → correct
3. **Prompt Versioning:** Track prompt template changes and their effect on success rate
4. **Scores:** Verification pass/fail, correction success, user satisfaction (if captured)
5. **RAG Retrieval:** Which chunks were retrieved, relevance scores

**What Sentry Continues to Capture (NOT LangFuse):**

1. **Exceptions:** All `try/catch` errors, unhandled rejections
2. **Error Breadcrumbs:** Sequence of events leading to error
3. **User Context:** Which user/tenant experienced the error
4. **Release Tracking:** Which deployment introduced a regression

**Deliverable:**

- **Server:** Instrument interact flow with LangFuse for LLM-specific traces. Emit **traces** that cover context analysis, planning, action generation, verification, and self-correction. Add **scores** where useful (e.g. verification outcome). Use **free trial** initially; **paid** is acceptable per team decision.
- **Integration Pattern:** Create a `lib/observability/langfuse-client.ts` wrapper that handles trace creation, generation logging, and scores. Do NOT call LangFuse directly in business logic.
- **Sentry Integration:** Continue using existing Sentry instrumentation for errors. Do NOT log errors to LangFuse; only log LLM-specific data.

**LangFuse Trace Structure:**

```typescript
// Example trace hierarchy
trace: "interact-request-{taskId}"
├── span: "context-analysis"
│   └── generation: "analyzeContext" (input, output, tokens)
├── span: "planning"
│   └── generation: "generatePlan" (input, output, tokens)
├── span: "execution"
│   └── generation: "callActionLLM" (input, output, tokens)
├── span: "verification"
│   └── generation: "verifyAction" (if LLM-based)
│   └── score: "verification_success" (true/false)
└── span: "correction" (if needed)
    └── generation: "generateCorrection" (input, output, tokens)
```

**Definition of Done:**

- [x] LangFuse traces cover the full interact flow (context → plan → action → verify → correct).
- [x] At least one score (e.g. verification pass/fail) is recorded per verification.
- [x] Team can inspect traces and scores in LangFuse UI (cloud or self-hosted).
- [x] **No duplicate error logging** between Sentry and LangFuse; clear separation documented.
- [x] LangFuse wrapper exists (`lib/observability/langfuse-client.ts`); business logic uses wrapper.

**Implementation Details (Completed 2026-01-28):**

| File | Purpose |
|------|---------|
| `lib/observability/langfuse-client.ts` | LangFuse client wrapper with trace/span/score APIs |
| `lib/observability/index.ts` | Module exports |
| `lib/agent/llm-client.ts` | Updated to use `observeOpenAI` wrapper |
| `lib/agent/graph/route-integration.ts` | Full trace integration for interact flow |
| `env.mjs` | LangFuse env var validation |
| `.env.example` | LangFuse configuration section |

**How to Enable:**

```bash
# In .env.local
ENABLE_LANGFUSE=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # or US: https://us.cloud.langfuse.com
```

**What's Traced:**

| Node | Trace Type | Data Captured |
|------|------------|---------------|
| `complexity_check` | Span | Query, DOM length, complexity result |
| `context_analysis` | Span | Query, hasOrgKnowledge, analysis result |
| `planning` | Span | Query, complexity, step count, goal |
| `direct_action` | Span | Query, action, thought, LLM usage |
| `action_generation` | Span | Query, step index, action, LLM usage |
| Verification | Score | `verification_success` (0/1), `verification_confidence` |
| Correction | Score + Span | `correction_success` (0/1), strategy, attempt |

**Metrics to Track in LangFuse:**

| Metric | Purpose |
|--------|---------|
| Token usage per generation | Cost attribution |
| Latency per generation | Performance optimization |
| Verification success rate | Prompt quality |
| Correction frequency | Self-healing effectiveness |
| RAG chunk relevance | Knowledge quality |

**References:** § Planned Open-Source Stack (LangFuse), `SERVER_SIDE_AGENT_ARCH.md` §4, existing Sentry integration in `sentry.*.config.ts`.

---

### Task 3: Hybrid Cost Tracking (Dual-Write)

**Objective:** Track **LLM token usage and cost** **as early as possible** in the flow. Use a **dual-write** strategy: **LangFuse** for engineers (debugging, prompts, latency) and **your database** for accountants/CFO (invoicing, auditing, credit limits). Centralize logging in a **UsageService** so every LLM call writes to **both** stores; never log to DB and LangFuse separately in business logic.

**Rationale:** Cost tracking belongs in **Foundation** so we capture usage from the first orchestrated steps (Plan, Refine, Verify). If LangFuse goes down or we switch vendors, the DB still has every token accounted for.

**Deliverable:**

1. **Source-of-truth schema (MongoDB)**  
   Add a **TokenUsageLog** collection (or extend existing `Cost`-style models) for **billing**. Keep it immutable. Example shape:

   | Field | Purpose |
   |-------|---------|
   | `id` | UUID |
   | `tenantId` | Indexed for billing rollups |
   | `userId`, `sessionId`, `messageId`, `taskId` | Link to request/task |
   | `model`, `inputTokens`, `outputTokens`, `totalTokens`, `costUSD` | Cost data; compute `costUSD` at insert |
   | `actionType` | `PLANNING` \| `REFINEMENT` \| `VERIFICATION` \| `CONTEXT_ANALYSIS` \| … |
   | `provider` | `OPENAI` \| `ANTHROPIC` |
   | `timestamp` | When the call occurred |

   Align with or extend `lib/cost/tracker` / `Cost` as needed; ensure tenant-scoped indexes for fast rollups.

2. **Pricing module**  
   Create a central **pricing** helper (e.g. `lib/cost/pricing.ts` or equivalent). **Do not** hardcode prices in the UsageService. Keep pricing in one place so you can update when providers change rates.

3. **UsageService (dual-write)**  
   Implement a single **UsageService** (e.g. `lib/cost/usage-service.ts`) that:
   - Accepts LLM response + context (`tenantId`, `userId`, `sessionId`, `messageId`, `taskId`, `actionType`, optional `traceId`).
   - Computes tokens and cost via the pricing module.
   - **Writes to MongoDB** (TokenUsageLog / Cost) and **to LangFuse** (e.g. `createGeneration` with `traceId`, `usage`, `metadata`) in one place.
   - Uses **`Promise.allSettled`** for both writes so that neither blocks the user; log errors but do not fail the request.

4. **Graph injection**  
   Once **LangGraph** is in place (Task 1), every node that calls an LLM (**Planning**, **Refinement**, **Verification**, **Context Analysis**, **Self-Correction**) must call `UsageService.recordUsage` **before** returning. Pass `traceId` through graph state so LangFuse traces stay linked.  
   **Before LangGraph:** Instrument current interact flow LLM call sites (context analysis, planning, step refinement, verification, self-correction) with the same UsageService so we track costs immediately.

**Definition of Done:**

- [x] TokenUsageLog (or equivalent) schema exists in MongoDB; tenant-indexed for billing rollups.
- [x] Central pricing module exists; UsageService uses it for `costUSD`.
- [x] UsageService dual-writes to DB and LangFuse; writes are non-blocking (`Promise.allSettled`).
- [x] Every LangGraph node that invokes an LLM calls `UsageService.recordUsage`; pre–LangGraph, all interact LLM call sites are instrumented.

**Implementation Details:**

| Component | File Path | Description |
|-----------|-----------|-------------|
| TokenUsageLog Model | `lib/models/token-usage-log.ts` | MongoDB schema with tenant/user/session/task indexing |
| Pricing Module | `lib/cost/pricing.ts` | Centralized pricing for OpenAI, Anthropic, Google |
| Usage Service | `lib/cost/usage-service.ts` | Dual-write to MongoDB + LangFuse with Promise.allSettled |
| Cost Index | `lib/cost/index.ts` | Clean exports for all cost-related functions |

**Instrumented Engines:**

| Engine | Action Type | File |
|--------|-------------|------|
| LLM Client | ACTION_GENERATION, DIRECT_ACTION | `lib/agent/llm-client.ts` |
| Planning | PLANNING | `lib/agent/planning-engine.ts` |
| Step Refinement | REFINEMENT | `lib/agent/step-refinement-engine.ts` |
| Verification | VERIFICATION | `lib/agent/verification-engine.ts` |
| Correction | SELF_CORRECTION | `lib/agent/self-correction-engine.ts` |
| Outcome Prediction | OUTCOME_PREDICTION | `lib/agent/outcome-prediction-engine.ts` |

**Usage Example:**

```typescript
import { recordUsage } from "@/lib/cost"

// In any LLM call
const result = await recordUsage({
  tenantId: "tenant-123",
  userId: "user-456",
  sessionId: "session-789",
  taskId: "task-abc",
  provider: "openai",
  model: "gpt-4-turbo-preview",
  actionType: "PLANNING",
  inputTokens: 1500,
  outputTokens: 500,
  durationMs: 2500,
})
// result.success, result.logId, result.costUSD, result.costCents
```

**Why this wins:**

- **Auditability:** If LangFuse is down or we switch vendors, the DB still has every token and dollar for billing.
- **Performance:** Non-blocking dual-write avoids adding latency to user-facing responses.
- **Sync:** Writing to both in a single wrapper keeps debug dashboards (LangFuse) and invoices (DB) aligned.

**References:** § Planned Open-Source Stack (LangFuse), `lib/cost/tracker`, `SERVER_SIDE_AGENT_ARCH.md` §4.

---

### Task Order (Foundation)

| Order | Task | Status | Depends on | Delivers |
|-------|------|--------|------------|----------|
| **1** | Orchestration + Complexity Routing (LangGraph.js) | ✅ **COMPLETE** | Current interact flow | Graph-based loop; persistence; cycles; **fast-path for SIMPLE tasks** |
| **2** | Observability (LangFuse + Sentry Separation) | ✅ **COMPLETE** | Task 1 ✅ | Traces; scores; success-rate visibility; **clear tool boundaries** |
| **3** | Hybrid Cost Tracking (Dual-Write) | ✅ **COMPLETE** | Task 1 ✅, Task 2 ✅ | TokenUsageLog; UsageService; dual-write; cost tracked from first LLM calls |

**Task 1 Completion Notes (2026-01-28):**
- LangGraph.js implementation complete in `lib/agent/graph/`
- Complexity classifier uses fast heuristics (no LLM call)
- **Now the default and only execution path** - no feature flag needed
- Legacy route handler removed; all traffic flows through LangGraph
- 10 graph nodes: complexity_check, context_analysis, planning, step_refinement, direct_action, action_generation, verification, correction, outcome_prediction, finalize

**Task 2 Completion Notes (2026-01-28):**
- LangFuse wrapper implementation complete in `lib/observability/`
- Clear separation: LangFuse for LLM traces, Sentry for errors
- `observeOpenAI` wrapper auto-traces all OpenAI calls
- Full interact flow traced: complexity → context → plan → action → verify → correct
- Verification/correction scores recorded for evaluation
- Enable with `ENABLE_LANGFUSE=true` + credentials

**Task 3 Completion Notes (2026-01-28):**
- Hybrid cost tracking with dual-write strategy complete
- **TokenUsageLog model:** MongoDB collection for immutable billing records (`lib/models/token-usage-log.ts`)
- **Pricing module:** Centralized pricing for OpenAI, Anthropic, Google models (`lib/cost/pricing.ts`)
- **UsageService:** Dual-write service with `Promise.allSettled` for non-blocking writes (`lib/cost/usage-service.ts`)
- **All LLM engines instrumented:** Planning, Refinement, Verification, Correction, Outcome Prediction, Action Generation
- MongoDB indexes optimized for tenant-based billing rollups
- Cost tracked per action type: PLANNING, REFINEMENT, VERIFICATION, SELF_CORRECTION, OUTCOME_PREDICTION, ACTION_GENERATION, DIRECT_ACTION

---

## Implementation Roadmap: Knowledge Extraction

Knowledge-based processing uses **smart ingestion** (Turndown, Readability, Cheerio, Gotenberg) and **memory** (Zep) per § Planned Open-Source Stack. These tasks **migrate** knowledge extraction from the **browser automation service** APIs into **this app** and **MongoDB**.

### Task 1: Migrate Knowledge Extraction from Browser Automation Service to App + MongoDB

**Objective:** Today, `GET /api/knowledge/resolve` and RAG (**`getRAGChunks`**) **proxy** to the **browser automation / knowledge extraction service**. Chunks and RAG live in that external service. We **migrate** to **in-app** knowledge extraction: **smart ingestion** pipeline, **MongoDB** (and vector store) for storage, and **local** resolve/RAG. Use **Zep** for **memory** (episodic learning) in the knowledge layer.

**Deliverable:**

- **Ingestion:** Implement **smart ingestion** in this app: **Turndown** (+ `turndown-plugin-gfm`) for HTML→Markdown; **@mozilla/readability** for main-content extraction; **Cheerio** for pre-processing. For PDFs, **Gotenberg** (Docker) → HTML → Turndown. See § Planned Open-Source Stack.
- **Storage:** Store extracted chunks/documents in **MongoDB** (and existing vector store for RAG). Define Mongoose schemas as needed; tenant- and domain-scoped.
- **Resolve / RAG:** Replace **proxy** to the extraction service with **local** implementation. `GET /api/knowledge/resolve` and `getRAGChunks()` read from MongoDB/vector store instead of calling the browser automation service. Preserve **`ResolveKnowledgeResponse`** and **`allowed_domains`** behavior (§1.4, §5.6).
- **Memory:** Integrate **Zep** for episodic memory in the knowledge layer (e.g. "have we seen this URL/task before?"; "what worked last time?"). Use for retrieval-augmented context where applicable.

**Definition of Done:**

- [ ] Smart ingestion pipeline (Turndown, Readability, Cheerio; Gotenberg for PDFs) runs in-app.
- [ ] Chunks/documents stored in MongoDB (+ vector store); resolve and RAG use local data.
- [ ] No more calls to browser automation service for knowledge extraction; `BROWSER_AUTOMATION_RESOLVE_SCHEMA` proxy path removed or deprecated.
- [ ] Zep integrated for memory; knowledge-layer logic can query past context where useful.

**Evaluation:** Excellent move. Reduces dependency on external black-box APIs and gives **fine-grained control** over how tables are parsed (critical for medical records).

**⚠️ Risk:** **Cheerio pre-processing.** Be careful stripping `display: none` (and similar) elements. In **Single Page Apps (SPAs)**, "hidden" elements often become visible later (e.g. after a button click). Stripping them at ingestion time can mean RAG **misses context** that only appears post-interaction.

**⚠️ CRITICAL: Two-Phase SPA Ingestion Required**

For SPAs, implement **two-phase ingestion** (see § Production Hardening: Section B):

1. **Phase 1 (Initial Load):** Capture static content; preserve hidden elements; tag with `phase: "initial"`
2. **Phase 2 (Post-Interaction):** After user action (dropdown, tab switch), capture new content; deduplicate; tag with `phase: "post-interaction", triggerAction: "click(68)"`

**Advice:** 
- Avoid aggressively removing hidden or off-screen content in Phase 1
- Document **which view** is ingested (e.g. initial load vs post-interaction) so RAG scope is explicit
- Consider preserving structure that may become visible later
- Use `preserveHidden: true` in Phase 1 Cheerio options

**References:** § Planned Open-Source Stack (Smart Ingestion, Zep), § Production Hardening: Section B (Two-Phase SPA Ingestion), `SERVER_SIDE_AGENT_ARCH.md` §5, `THIN_SERVER_ROADMAP.md` Task 2, `BROWSER_AUTOMATION_RESOLVE_SCHEMA.md`.

---

### Task Order (Knowledge Extraction)

| Order | Task | Depends on | Delivers |
|-------|------|------------|----------|
| **1** | Migrate knowledge extraction to app + MongoDB | Current resolve/RAG proxy | Smart ingestion; MongoDB storage; local resolve/RAG; Zep memory |

---

## Implementation Roadmap: Batch & Adapt Improvements

This section follows **Foundation** and **Knowledge Extraction** in the implementation order. It covers moving from **"Step-by-Step"** to **"Batch & Adapt"** (fewer round-trips, better adaptation). Format follows `THIN_CLIENT_ROADMAP.md` for best practices.

### Summary

| Feature | Current | Improvement | Impact |
|--------|---------|-------------|--------|
| **Execution** | 1 request = 1 action | 1 request = **N actions** (chaining) | **~5× speedup** on form-fill |
| **Planning** | Static (created once) | **Dynamic** (plan health check on URL/DOM change) | **Higher success rate** |
| **Routing** | One size fits all | **Complexity** (SIMPLE vs COMPLEX) | **Lower latency** (simple) |
| **Verification** | Checks previous action only | Previous + **next-goal availability** (look-ahead) | **Better reasoning** |

### Task 1: Action Chaining

**Objective:** Allow the backend to return a **chain of actions** (`actions: [...]`) instead of a single `action`. Client executes them sequentially; on first failure, stops and reports state. Reduces N round-trips to 1 for form-fill clusters.

**⚠️ CRITICAL:** Partial failure handling is complex. This task includes explicit schema changes and recovery logic.

**Deliverable:**

- **Server:** Interact API supports optional `actions` in `NextActionResponse`. Planning/refinement identifies **clusters** of independent actions (e.g. form fields). Each item: `{ type: "click" | "setValue" | "wait" | ..., id?: number, text?: string, ms?: number }`. Legacy single `action` remains supported. Client may send `lastExecutedActionIndex`, `lastActionStatus`, `lastActionError` when chain partially failed.
- **Client:** Parse `actions` when present; execute sequentially; on first failure, stop and send next interact with updated `url`, `dom`, and failure info.

**Schema Changes Required:**

**Request Schema Extension (`interactRequestBodySchema`):**

```typescript
// lib/agent/schemas.ts - ADD to existing schema
export const interactRequestBodySchema = z.object({
  // ... existing fields ...
  
  // NEW: Chain partial failure reporting
  lastExecutedActionIndex: z.number().int().nonnegative().optional(),
  chainPartialState: z.object({
    executedActions: z.array(z.string()),           // Actions that succeeded
    domAfterLastSuccess: z.string().optional(),     // DOM state after last success (optional)
    totalActionsInChain: z.number().int().positive(),
  }).optional(),
})
```

**Response Schema Extension (`NextActionResponse`):**

```typescript
// lib/agent/schemas.ts - ADD to existing schema
export const nextActionResponseSchema = z.object({
  // ... existing fields ...
  
  // NEW: Chain response
  actions: z.array(z.object({
    action: z.string(),                    // e.g., "setValue(101, 'Jas')"
    description: z.string(),               // e.g., "Type patient name"
    index: z.number().int().nonnegative(), // Position in chain
    canFail: z.boolean().optional(),       // If true, continue chain on failure
  })).optional(),
  
  chainMetadata: z.object({
    totalActions: z.number().int().positive(),
    estimatedDuration: z.number().optional(),  // ms
    safeToChain: z.boolean(),                  // Server confidence
  }).optional(),
})
```

**Server-Side Recovery Logic:**

```typescript
// When client reports partial failure at index N:
// 1. Load chain from task.lastChain
// 2. Mark actions 0..N-1 as completed
// 3. Analyze DOM at failure point
// 4. Decide: retry action N, skip to N+1, or regenerate remaining chain

async function handleChainPartialFailure(
  taskId: string,
  lastExecutedActionIndex: number,
  chainPartialState: ChainPartialState,
  currentDom: string
): Promise<NextActionResponse> {
  // Recover from partial failure
  const task = await loadTask(taskId)
  const failedAction = task.lastChain?.actions[lastExecutedActionIndex + 1]
  
  if (!failedAction) {
    // Edge case: index mismatch
    return regenerateChain(task, currentDom)
  }
  
  // Options:
  // A) Retry failed action with different selector
  // B) Skip failed action if canFail=true
  // C) Regenerate remaining chain from current DOM
  
  // Default: Regenerate remaining chain
  return regenerateChainFromIndex(task, lastExecutedActionIndex + 1, currentDom)
}
```

**Chain Safety Criteria:**

Only chain actions when ALL criteria are met:

| Criterion | Reason |
|-----------|--------|
| Same form/container | Actions target elements in same logical group |
| No navigation expected | URL should not change during chain |
| No async dependencies | Action N+1 doesn't depend on server response from N |
| Low-risk actions only | No `finish()`, `fail()`, or destructive actions in chain |

**Definition of Done:**

- [x] Server returns optional `actions` array; client executes sequentially and reports partial-failure state.
- [x] Request schema includes `lastExecutedActionIndex` and `chainPartialState`.
- [x] Response schema includes `actions` array with `index` and `canFail` per action.
- [x] Server can recover from partial chain failure at any index.
- [ ] Form-fill flows show measurable reduction in round-trips when chains are used (target: 60% reduction for 5-field forms). *(Requires client integration and measurement)*

**Evaluation:** **High ROI.** This is the single most impactful change for user experience.

**Metrics to Track:**

- Chain success rate (full chain completes without failure)
- Partial failure rate (by index)
- Round-trip reduction (chains vs single actions)
- Recovery success rate (after partial failure)

**Rollback Strategy:** Feature flag `ENABLE_ACTION_CHAINING=true|false`. If false, always return single `action` (current behavior).

**References:** `SERVER_SIDE_AGENT_ARCH.md` §4.9.3, `THIN_SERVER_ROADMAP.md` Part E Task 19.

---

### Task 1.5: Knowledge Extraction Pipeline (Completed)

**Objective:** Enable "Cursor-style" indexing of external documentation links and multi-format document ingestion to augment RAG for the agent.

**Implementation Complete (2026-01-28):**

| Component | Location | Description |
|-----------|----------|-------------|
| **Document Extractors** | `lib/knowledge/extractors/` | PDF, DOCX, Markdown, Text, HTML, JSON, CSV |
| **HTML-to-Markdown** | `lib/knowledge/extractors/html-extractor.ts` | Turndown + Readability for clean conversion |
| **Web Crawler** | `lib/knowledge/crawler/` | Crawlee-based sitemap and spider crawling |
| **Ingestion Pipeline** | `lib/knowledge/ingestion/` | Unified pipeline with chunking and embeddings |
| **API Endpoints** | `app/api/knowledge/` | `index-link` and `ingest` routes |

**Supported Document Types:**

| Category | Extensions |
|----------|------------|
| Documents | PDF, DOCX, DOC |
| Text | TXT, MD, JSON, CSV, XML, YAML |
| Web | HTML, HTM, URL |
| Media | MP3, WAV, M4A, MP4, WEBM |

**Crawl Strategies:**

```typescript
// Single page
POST /api/knowledge/index-link
{ url: "https://docs.example.com/getting-started", strategy: "single" }

// Sitemap-based (discovers all pages from sitemap.xml)
POST /api/knowledge/index-link
{ url: "https://docs.example.com", strategy: "sitemap", maxPages: 100 }

// Spider crawl (follows links up to depth)
POST /api/knowledge/index-link
{ url: "https://docs.example.com", strategy: "spider", maxDepth: 2, maxPages: 50 }
```

**Key Features:**

- **Smart Content Extraction**: Cheerio + Readability removes navigation, ads, and noise
- **Markdown Conversion**: Turndown preserves code blocks, tables, and links
- **Sitemap Discovery**: Automatically checks `/sitemap.xml` and `robots.txt`
- **Chunking**: Intelligent text splitting with sentence/heading awareness
- **Embeddings**: Generates vector embeddings for RAG retrieval

**Architecture:**

```
[URL/File Input]
       │
       ▼
┌─────────────────────┐
│  detectDocumentType │  ← MIME/extension detection
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│    Extractor        │  ← PDF/DOCX/MD/HTML/etc.
│  (type-specific)    │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│    Chunker          │  ← Sentence/paragraph/heading aware
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  Embedding          │  ← Vector generation
│  Generation         │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│  MongoDB Storage    │  ← KnowledgeDocument model
└─────────────────────┘
```

**Definition of Done:** ✅ COMPLETE

- [x] Multi-format document extraction (PDF, DOCX, MD, TXT, HTML, JSON, CSV)
- [x] HTML-to-Markdown conversion with Turndown + Readability
- [x] Web crawler with sitemap and spider strategies
- [x] Unified ingestion pipeline with type detection
- [x] Text chunking with overlap for RAG
- [x] API endpoints for link indexing and document ingestion
- [x] Build passes with dynamic imports (Turbopack compatibility)

---

### Task 2: Dynamic Re-Planning (Plan Health Check)

**Objective:** Re-evaluate plan validity when **URL changes** or **DOM similarity drops below 70%**. Run a fast "Plan Validator" prompt before the next action; adapt or regenerate plan instead of blindly advancing `currentStepIndex`.

**⚠️ CRITICAL:** "DOM similarity < 70%" requires a defined algorithm. Do NOT leave this ambiguous.

**DOM Similarity Algorithm:**

```typescript
// lib/agent/dom-similarity.ts

interface DomSimilarityResult {
  similarity: number          // 0.0 to 1.0
  structuralChanges: string[] // What changed (e.g., "form removed", "navigation changed")
  shouldReplan: boolean       // Convenience flag
}

/**
 * Calculate DOM similarity using structural comparison (fast, no LLM)
 * 
 * Algorithm: Jaccard similarity on element signatures
 * - Extract element signatures: tag + id/class + role + aria-label
 * - Compare sets using Jaccard: |A ∩ B| / |A ∪ B|
 * - Weight interactive elements higher (inputs, buttons, links)
 */
export function calculateDomSimilarity(
  previousDom: string,
  currentDom: string
): DomSimilarityResult {
  const prevStructure = extractStructure(previousDom)
  const currStructure = extractStructure(currentDom)
  
  // Jaccard similarity on element signatures
  const intersection = prevStructure.filter(e => currStructure.includes(e))
  const union = new Set([...prevStructure, ...currStructure])
  
  const rawSimilarity = intersection.length / union.size
  
  // Weight interactive elements (2x importance)
  const prevInteractive = prevStructure.filter(isInteractive)
  const currInteractive = currStructure.filter(isInteractive)
  const interactiveIntersection = prevInteractive.filter(e => currInteractive.includes(e))
  const interactiveSimilarity = prevInteractive.length > 0 
    ? interactiveIntersection.length / prevInteractive.length 
    : 1.0
  
  // Combined score: 60% structural + 40% interactive
  const similarity = (rawSimilarity * 0.6) + (interactiveSimilarity * 0.4)
  
  // Detect major changes
  const structuralChanges: string[] = []
  if (!currStructure.some(e => e.includes('form'))) {
    if (prevStructure.some(e => e.includes('form'))) {
      structuralChanges.push('form removed')
    }
  }
  // ... more change detection
  
  return {
    similarity,
    structuralChanges,
    shouldReplan: similarity < 0.7 || structuralChanges.length > 0,
  }
}

function extractStructure(dom: string): string[] {
  // Extract element signatures
  // e.g., "button#submit.primary[role=button]"
  // Implementation uses Cheerio or regex
}

function isInteractive(signature: string): boolean {
  return /^(button|input|select|textarea|a\[href)/.test(signature)
}
```

**Re-Planning Trigger Conditions:**

| Condition | Threshold | Action |
|-----------|-----------|--------|
| URL changed | Any change | Trigger re-planning |
| DOM similarity < 70% | `similarity < 0.7` | Trigger re-planning |
| Interactive elements changed significantly | `interactiveSimilarity < 0.5` | Trigger re-planning |
| Expected element missing | Plan step N references element not in DOM | Trigger re-planning |

**Plan Validator Prompt (Fast):**

```typescript
// Use gpt-4o-mini for speed
const planValidatorPrompt = `
Current page state: ${domSummary}
Remaining plan steps:
${remainingSteps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')}

Question: Can these steps still be executed on the current page?

Respond with JSON:
{
  "valid": true/false,
  "reason": "brief explanation",
  "suggestedChanges": ["step 2 should be modified to...", ...] // optional
}
`
```

**Deliverable:**

- **Server:** Triggers: URL change (vs `previousUrl`) or DOM similarity < 70% (using defined algorithm). Plan Validator LLM: *"Given the current screen, does the remaining plan still make sense?"* Update or replace plan; then continue. Optional `rePlanning: true` in response.
- **Client:** When `rePlanning` indicated, show brief "Re-planning..." in UI. Continue sending `url`, `dom`, `previousUrl`.
- **DOM Similarity Module:** Implement `lib/agent/dom-similarity.ts` with the algorithm above.

**Definition of Done:**

- [x] DOM similarity algorithm implemented in `lib/agent/dom-similarity.ts`.
- [x] Plan health check runs on trigger (URL change OR similarity < 70%).
- [x] Plan Validator LLM prompt exists; uses fast model (gpt-4o-mini).
- [x] Plan updated when invalid; response includes `rePlanning: true`.
- [ ] Client shows re-planning indicator when server signals (if adopted). *(Client-side change pending)*
- [x] Unit tests for DOM similarity with known inputs/outputs.

**Metrics to Track:**

- Re-planning frequency (% of requests that trigger re-plan)
- Re-planning success rate (% of re-plans that lead to task completion)
- DOM similarity distribution (histogram of scores)
- False positive rate (re-plans that weren't necessary)

**References:** `SERVER_SIDE_AGENT_ARCH.md` §4.9.3, `THIN_SERVER_ROADMAP.md` Part E Task 20.

---

### ~~Task 3: Complexity Routing~~ → MOVED TO FOUNDATION

**⚠️ RELOCATED:** Complexity Routing is now **bundled with LangGraph** in Foundation (Task 1). See **§ Implementation Roadmap: Foundation, Task 1** for full specification.

**Rationale:** Complexity routing MUST be implemented alongside LangGraph to ensure the fast-path exists from day one. Without it, every simple task ("Click Logout") would traverse the full graph, adding unnecessary latency.

---

### Task 3: Semantic Look-Ahead Verification

**Objective:** When generating an action (e.g. `click(68)` for "Patient"), also predict **target of next step** (e.g. "expect to see 'New/Search'"). Verification checks **previous outcome** and **next-goal availability**. Catches mismatches during verification instead of on the next step.

**Deliverable:**

- **Server:** Outcome/action step produces optional `nextGoalDescription` / `nextGoalSelector`. Verification validates (1) previous action outcome, (2) next-goal availability. If (2) fails → verification failure → self-correction.
- **Client:** No change. QA verification and self-correction flows unchanged.

**Look-Ahead Verification Schema:**

```typescript
// Extension to expectedOutcome
interface ExpectedOutcomeWithLookAhead extends ExpectedOutcome {
  // Existing fields...
  
  // NEW: Look-ahead for next step
  nextGoal?: {
    description: string      // e.g., "Submit button should be visible"
    selector?: string        // e.g., "button[type='submit']"
    textContent?: string     // e.g., "Submit"
    required: boolean        // If false, missing next-goal is warning not failure
  }
}
```

**Definition of Done:**

- [x] `nextGoal` field added to `ExpectedOutcome` schema.
- [x] Verification checks (1) previous action outcome AND (2) next-goal availability.
- [x] Next-goal failure triggers verification failure (if `required: true`).
- [x] No client changes; compatibility verified.

**Metrics to Track:**

- Look-ahead hit rate (% of predictions that were accurate)
- Early failure detection rate (% of issues caught by look-ahead vs next step)

**References:** `SERVER_SIDE_AGENT_ARCH.md` §4.9.3, `THIN_SERVER_ROADMAP.md` Part E Task 22.

---

### Task Order and Dependencies

| Order | Task | Status | Depends on | Delivers |
|-------|------|--------|------------|----------|
| **1** | Action Chaining | ✅ **COMPLETE** | Foundation (LangGraph) | `actions[]` API, client chain execution, partial-failure reporting |
| **2** | Dynamic Re-Planning | ✅ **COMPLETE** | Plan + verification + DOM Similarity | Plan validator, URL/DOM triggers, `rePlanning` response flag |
| **3** | Semantic Look-Ahead Verification | ✅ **COMPLETE** | Verification engine, outcome prediction | Next-goal prediction, verification of next-goal availability |

**⚠️ NOTE:** Complexity Routing is now part of Foundation (Task 1: LangGraph + Complexity Routing). It is NOT a separate Batch & Adapt task.

**Action Chaining Completion Notes (2026-01-28):**
- Chain types and schemas implemented in `lib/agent/chaining/types.ts`
- Chain safety analyzer in `lib/agent/chaining/chain-analyzer.ts` - analyzes DOM for safe chaining opportunities
- Chain generator in `lib/agent/chaining/chain-generator.ts` - creates chains from LLM responses or form analysis
- Chain recovery in `lib/agent/chaining/chain-recovery.ts` - handles partial failure with retry/skip/regenerate strategies
- Request schema extended with `lastExecutedActionIndex`, `chainPartialState`, `chainActionError`
- Response schema extended with `actions[]` array and `chainMetadata`
- Action generation node enhanced to detect form-fill patterns and generate chains
- Safety criteria enforced: same container, no navigation, no async dependencies, low-risk actions only

**Dynamic Re-Planning Completion Notes (2026-01-28):**
- DOM similarity algorithm in `lib/agent/dom-similarity.ts` - Jaccard similarity on element signatures
- Interactive elements weighted 40% (buttons, inputs, links) + structural 60%
- Triggers: URL path change OR DOM similarity < 70% OR major structural changes
- Re-planning engine in `lib/agent/replanning-engine.ts` - validates plan health
- Plan validator uses fast gpt-4o-mini LLM call to check if remaining steps can execute
- Three actions: `continue` (plan valid), `modify` (apply suggested changes), `regenerate` (full replan)
- LangGraph integration via `replanning` node after verification success
- 21 unit tests for DOM similarity algorithm

**Look-Ahead Verification Completion Notes (2026-01-28):**
- `nextGoal` field added to `ExpectedOutcome` schema in `lib/models/task-action.ts`
- Outcome prediction engine updated to generate `nextGoal` for next step prediction
- Verification engine checks both: (1) previous action outcome AND (2) next-goal availability
- Next-goal failure on required elements caps confidence at 50% → triggers self-correction
- Check methods: selector, text content, ARIA role
- No client changes required - backward compatible

---

### Phase 4 Completion Notes (2026-01-28)

**Critic Loop (Task 1):**
- `lib/agent/critic-engine.ts` - Pre-execution reflection layer
- Validates action intent before sending to client
- Triggers for: high-risk actions (finish, fail, setValue), low confidence (<0.85), verification failures
- Fast gpt-4o-mini LLM call: "Does this action make sense for this goal?"
- Fail-open design - doesn't block on errors
- 9 unit tests

**Multi-Source Synthesis (Task 4):**
- Context analyzer now returns `requiredSources: InformationSource[]` array
- Complex queries can request multiple sources (e.g., `["MEMORY", "WEB_SEARCH"]`)
- Backward compatible - single `source` field maintained
- Orchestrator merges results from all required sources into planning context

**Dynamic Interrupt (Task 5):**
- `lib/agent/dynamic-interrupt.ts` - Mid-flight MISSING_INFO handling
- Detects `MISSING_INFO: [parameter]` patterns in LLM output
- Classifies: EXTERNAL_KNOWLEDGE (search) vs PRIVATE_DATA (ask user)
- Performs targeted web search or returns ASK_USER prompt
- Enriches context with retrieved data for re-running action generation
- 10 unit tests

**Skills Library / Episodic Memory (Task 6):**
- `lib/models/skill.ts` - Mongoose schema for skill triplets
- `lib/agent/skills-service.ts` - CRUD operations and retrieval
- Stores: (Goal, Failed_State, Successful_Action) triplets
- Constraints: tenant-isolated, domain-specific, 90-day TTL, max 10K per tenant, min 50% success rate
- Indexes: deduplication, TTL cleanup, efficient lookup
- Prompt injection: `buildSkillPromptInjection()` generates hints for action generation

**Conditional Planning (Task 7):**
- `lib/agent/conditional-planning.ts` - Tree of thoughts with contingencies
- Plans now include `contingencies: Contingency[]` for common failure scenarios
- Contingency types: POPUP_DETECTED, ELEMENT_MISSING, ERROR_DISPLAYED, FORM_VALIDATION, URL_CHANGED
- `checkContingencies()` matches failure state against contingency map
- Applied BEFORE calling expensive Correction LLM

**Hierarchical Planning (Task 8):**
- `lib/agent/hierarchical-planning.ts` - Sub-task decomposition
- Decomposes plans with >5 steps or distinct phases into bounded SubTasks
- Each SubTask has: inputs, outputs, estimated steps, status
- Accumulated outputs passed between SubTasks
- Context reset/trim between SubTasks for better reasoning
- Progress tracking: `getHierarchicalProgress()` returns completion percentage

**New LLMActionTypes added to token-usage-log:**
- CRITIC, MULTI_SOURCE_SYNTHESIS, DYNAMIC_INTERRUPT, SKILLS_RETRIEVAL, CONTINGENCY_CHECK, HIERARCHICAL_PLANNING

**Test Summary:** 40 tests passing (21 DOM similarity + 9 critic + 10 dynamic interrupt)

**References:** `THIN_CLIENT_ROADMAP.md` (roadmap format and best practices), `THIN_SERVER_ROADMAP.md` Part E (server-side task breakdown), `SERVER_SIDE_AGENT_ARCH.md` §4.9.3.

---

## Implementation Roadmap: LLM Flow & Advanced Logic Improvements

These **8 improvements** focus on **how the LLM thinks and plans** (context, planning, execution, verification) plus **memory**, **quality control**, and **task management**. They are ordered by **ease of implementation** (easiest first). Format follows `THIN_CLIENT_ROADMAP.md` for best practices.

### Summary

**LLM Flow (Think–Plan–Act):**

| Layer | Current | Upgrade | Benefit |
|-------|---------|---------|---------|
| **Context** | Single source (`PAGE` or `SEARCH`) | **Multi-Source** (`PAGE` + `SEARCH`) | Complex queries without hallucination |
| **Planning** | Linear steps (A → B → C) | **Conditional branches** (“If X, do Y”) | Handles popups, A/B tests |
| **Execution** | 1 action per request | **Action chaining** (N actions per request) | **~5× faster** form filling |
| **Verification** | Reactive (“Did it break?”) | **Predictive** (“Ready for next step?”) | Smarter error recovery |

**Advanced Logic (Memory, Safety, Structure, Data):**

| Feature | Current | Upgrade |
|---------|---------|---------|
| **Learning** | Forgets after task ends | **Remembers** successful fixes (Skills DB) |
| **Safety** | Syntax checks only | **Semantics** (Critic loop) |
| **Structure** | Flat step list | **Hierarchical** sub-tasks |
| **Data** | Checked once at start | **Just-in-time** retrieval (dynamic interrupt) |

---

### 1. Critic Loop (Pre-Execution Reflection) — *Easiest*

**Current:** Step 1.7 generates an action; Step 1.8 validates *syntax* only. We assume *intent* is correct and send to the client. Logic errors (e.g. date in “Name” field) waste a full round-trip.

**Improvement:** **Internal monologue / Critic step** after action generation, *before* returning to the client.

- **Trigger:** After generating an action, before client response.
- **Action:** Fast, lightweight prompt (or “Critic” model): *“The plan is ‘Fill Name’. The generated action is `setValue(102, '01/01/1990')`. Does this make sense?”*
- **Flow:** If **Yes** → proceed to client. If **No** → regenerate action on the server, then re-run Critic.

**Deliverable:**

- **Server:** Add optional “Critic” step post–action generation. Reuse existing LLM or a small model. On “No”, regenerate and re-check; do not send to client until “Yes” or max retries.

**Definition of Done:**

- [x] Critic step runs before each client-facing action (or only when enabled).
- [x] Logic errors (wrong field, wrong format) caught server-side; no client round-trip for those cases.

**Evaluation:** Good for **safety**, but **dangerous for latency**.

**⚠️ Risk:** **Latency bloat.** Adding an extra LLM call before every action can **double** response time.

**Advice:** Make the Critic **conditional**. Only trigger it when **Action Confidence** (from the Generator LLM) is below a threshold (e.g. &lt; 0.9), or for **high-risk actions** such as `finish()` or `fail()`.

**Implementation Note (2026-01-28):** Critic triggers for: (1) high-risk actions (finish, fail, setValue), (2) confidence < 0.85, (3) verification failures. Uses gpt-4o-mini for fast evaluation. Fail-open design.

---

### 2. Action Chaining (Speed)

**Current:** One action per request. Form with 5 fields → 5 round-trips.

**Improvement:** **Action batching.** In Step 1.7 (refinement), ask the LLM: *“Can the next few steps be executed safely in sequence without intermediate verification?”* Return a **chain** instead of a single action. Client stops on first failure.

**Deliverable:** Aligns with **Batch & Adapt Task 1**. Optional chain format:

```json
{
  "type": "chain",
  "actions": [
    { "action": "setValue(101, 'Jas')", "description": "Type Name" },
    { "action": "setValue(102, '01/01/1990')", "description": "Type DOB" },
    { "action": "click(205)", "description": "Select Gender" }
  ]
}
```

- **Server:** Return `actions` array when safe; client sends `lastExecutedActionIndex`, `lastActionStatus`, `lastActionError` on partial failure.
- **Client:** Execute sequentially; stop and report on first failure.

**Definition of Done:** See **Batch & Adapt Task 1**.

**References:** `INTERACT_FLOW_WALKTHROUGH.md` § Batch & Adapt Task 1, `THIN_SERVER_ROADMAP.md` Part E Task 19.

---

### 3. Look-Ahead Validation (Goal-Oriented Verification)

**Current:** Verification (Step 3.3) looks *backwards*: “Did the last action work?” It checks *mechanics* (e.g. URL changed), not *progress* toward the goal.

**Improvement:** **Goal-oriented verification.** When generating Action N, predict the **state requirement for Action N+1** (e.g. “I expect to see ‘Submit’ or ‘Step 2 of 3’”). Verification checks that this requirement is met; if not, fail early.

**Deliverable:** Aligns with **Batch & Adapt Task 4**.

- **Server:** Outcome/action step produces `nextGoalDescription` / `nextGoalSelector`. Verification validates (1) previous outcome, (2) next-goal availability.
- **Example:** Action N = “Click Next”; requirement for N+1 = “Submit button or ‘Step 2 of 3’ visible.”

**Definition of Done:** See **Batch & Adapt Task 4**.

**References:** `INTERACT_FLOW_WALKTHROUGH.md` § Batch & Adapt Task 4, `THIN_SERVER_ROADMAP.md` Part E Task 22.

---

### 4. Multi-Source Synthesis (Context)

**Current:** Context Analyzer (Step 1.5) picks *one* source: `MEMORY` OR `PAGE` OR `WEB_SEARCH`. Complex tasks need **mixed** context (e.g. “Address” in MEMORY, “Zip Code” via WEB_SEARCH). Single-source choice causes hallucination or missed data.

**Improvement:** **Multi-source synthesis.**

- **Output:** Change from single `source` to `required_sources` array (e.g. `["MEMORY", "WEB_SEARCH"]`).
- **Logic:** When multiple sources are flagged, run *both* retrieval paths (Tavily + RAG / vector DB) and feed *all* results to the Planner.

**Deliverable:**

- **Server:** `analyzeContext` returns `required_sources: ("MEMORY" | "PAGE" | "WEB_SEARCH" | "ASK_USER")[]`. Orchestrator runs each relevant path (RAG, Tavily, etc.) and merges results into planning prompt.
- **Backward compatibility:** Single-source tasks behave as today when `required_sources.length === 1`.

**Definition of Done:**

- [x] Context analysis supports `required_sources`; multi-source tasks use combined RAG + search.
- [x] No hallucination from forcing a single source when multiple are needed.

**Implementation Note (2026-01-28):** `ContextAnalysisResult` now includes `requiredSources: InformationSource[]`. Backward compatible with single `source` field.

---

### 5. Dynamic Interrupt (Mid-Flight RAG / Ask)

**Current:** Context analysis runs once at start (Step 1.5). If it chooses `PAGE`, the agent commits. Missing info often appears only *at* the form (e.g. “Middle Name” required but not provided).

**Improvement:** **Mid-flight RAG / ask trigger.**

- **Trigger:** During Step 1.7 (refinement), LLM can output `MISSING_INFO: [parameter]`.
- **Action:** Orchestrator pauses DOM action, runs *targeted* WEB_SEARCH or RAG for that parameter, then re-runs action generation with new info. Optionally ask user (ASK_USER) if appropriate.

**Deliverable:**

- **Server:** Parse `MISSING_INFO` in refinement/action output. Pause action response; run targeted retrieval (or return `NeedsUserInput`); re-run action gen with enriched context.
- **Client:** No change to normal flow; may receive `needs_user_input` when ask-user path is taken.

**Definition of Done:**

- [x] `MISSING_INFO` triggers targeted RAG/search or user ask; agent avoids hallucinating form values.

**Implementation Note (2026-01-28):** `lib/agent/dynamic-interrupt.ts` detects MISSING_INFO patterns, classifies as EXTERNAL_KNOWLEDGE vs PRIVATE_DATA, performs targeted search or returns ASK_USER prompt.

---

### 6. Episodic Memory (Skills Library)

**Current:** When self-correction (Step 3.4) fixes a failure (e.g. “Click Patient” → “Click New/Search”), that lesson is **discarded** after the task. The same mistake repeats in future sessions.

**Improvement:** **Skills Library retrieval.**

- **Trigger:** When a `CorrectionRecord` leads to successful verification.
- **Action:** Store triplet `(Goal, Failed_State, Successful_Action)` in a vector DB (e.g. “Goal: Add Patient”, “Fail: Click Patient”, “Success: Click New/Search”).
- **Flow:** Before Step 1.7 (action generation), query Skills Library. **Prompt injection:** e.g. *“Note: In the past, ‘Click Patient’ failed. Use ‘Click New/Search’ instead.”*

**Deliverable:**

- **Server:** Persist correction-success triplets; vector index for retrieval. In Step 1.7, query by goal/context, inject retrieved hints into action prompt.
- **Storage:** New store (e.g. `skills` or `episodic_memory`) or dedicated collection; tenant-scoped.

**Definition of Done:**

- [x] Successful corrections stored and retrieved; action prompts include relevant “skills” hints.
- [x] Repeated tasks benefit from past fixes (fewer redundant retries).

---

### 7. Conditional Planning (Tree of Thoughts)

**Current:** Planner (Step 1.6) produces a linear step list. The web is non-linear (popups, A/B tests, errors). E.g. “Click Patient” → survey popup → “Click New” fails → retry/correct loop.

**Improvement:** **Conditional planning (tree of thoughts).**

- **Output:** Planner anticipates **branching paths**:
  - **Main path:** e.g. “Click Patient” → “Click New”.
  - **Contingency A:** “If survey popup → Click ‘Close’ → resume main path.”
  - **Contingency B:** “If ‘Patient’ missing → Click ‘Menu’ first.”
- **Execution:** Store contingencies. On verification failure, check **contingency map** *before* calling the heavy Correction LLM (Step 3.4). Apply matching contingency if found.

**Deliverable:**

- **Server:** Plan schema extended with optional `contingencies: { condition, actions }[]`. Verification failure triggers contingency lookup; if match, return contingency action (and optionally skip or simplify Correction LLM call).
- **Planner prompt:** Ask for main path + likely contingencies (popups, missing elements, errors).

**Definition of Done:**

- [x] Plans can include contingencies; failure triggers contingency check before full correction.
- [x] Fewer unnecessary Correction LLM calls when a contingency applies.

**Implementation Note (2026-01-28):** `lib/agent/conditional-planning.ts`. Contingency types: POPUP_DETECTED, ELEMENT_MISSING, ERROR_DISPLAYED, FORM_VALIDATION, URL_CHANGED. `checkContingencies()` matches failure state.

---

### 8. Hierarchical Manager–Worker Planning — *Hardest*

**Current:** Planner creates one linear list for the whole task. Long workflows (e.g. “Add patient → schedule visit → print invoice”) clog the context with completed steps and degrade later reasoning.

**Improvement:** **Sub-task decomposition.**

- **Trigger:** Initial plan has &gt; 5 steps or distinct phases.
- **Action:** “Manager” LLM splits the request into **SubTask A**, **SubTask B**, **SubTask C**.
- **Flow:** Run each sub-task as an **isolated** run. After SubTask A, pass **output state** (e.g. Patient ID) to SubTask B. **Clear context window** between sub-tasks.

**Deliverable:**

- **Server:** Manager step before execution: decompose into sub-tasks with input/output contract. Execute sub-tasks sequentially; pass outputs as inputs; reset or trim context between sub-tasks.
- **Client:** No change to per-request contract; sub-task boundaries are server-internal.

**Definition of Done:**

- [x] Complex tasks decomposed into sub-tasks; each run has bounded context.
- [x] Outputs of earlier sub-tasks (e.g. IDs) correctly passed into later ones.

---

### Task Order (by Ease of Implementation)

| Order | Improvement | Effort | Dependencies | Status |
|-------|-------------|--------|--------------|--------|
| **1** | Critic Loop (Pre-Execution Reflection) | Low | Step 1.7, 1.8 | ✅ COMPLETE |
| **2** | Action Chaining | Medium | Batch & Adapt Task 1 | ✅ COMPLETE (Phase 3) |
| **3** | Look-Ahead Validation | Medium | Batch & Adapt Task 4, verification | ✅ COMPLETE (Phase 3) |
| **4** | Multi-Source Synthesis | Medium | Context analyzer, RAG, Tavily | ✅ COMPLETE |
| **5** | Dynamic Interrupt (MISSING_INFO) | Medium | Step 1.7, RAG/search, orchestration | ✅ COMPLETE |
| **6** | Episodic Memory (Skills Library) | Medium–High | MongoDB, correction flow, Step 1.7 | ✅ COMPLETE |
| **7** | Conditional Planning (Tree of Thoughts) | High | Planner, plan schema, verification, Step 3.4 | ✅ COMPLETE |
| **8** | Hierarchical Manager–Worker | High | Planner, execution loop, context management | ✅ COMPLETE |

**References:** `THIN_CLIENT_ROADMAP.md` (roadmap format), `SERVER_SIDE_AGENT_ARCH.md` §4.9.3, Batch & Adapt section above.

---

## Production Hardening: Additional Specifications

This section contains production-ready specifications that strengthen the core architecture with explicit algorithms, schemas, and operational guidance.

### A. Skills Library: Scope, Limits, and Schema

**⚠️ CRITICAL for Episodic Memory (Section 6 above):** Skills must be scoped and bounded.

**Skills Schema (Mongoose):**

```typescript
// lib/models/skill.ts
export interface ISkill extends Document {
  skillId: string                    // UUID
  tenantId: string                   // REQUIRED: tenant isolation
  domain: string                     // e.g., "demo.openemr.io" - domain-specific
  goal: string                       // e.g., "Add a new patient"
  failedState: {
    action: string                   // e.g., "click(68)"
    elementDescription: string       // e.g., "Patient menu button"
    errorType: string                // e.g., "VERIFICATION_FAILED"
  }
  successfulAction: {
    action: string                   // e.g., "click(79)"
    elementDescription: string       // e.g., "New/Search menu item"
    strategy: string                 // e.g., "ALTERNATIVE_SELECTOR"
  }
  successCount: number               // How often this skill led to success
  failureCount: number               // How often this skill was tried but failed
  lastUsed: Date                     // For time-decay ranking
  createdAt: Date
}

// Indexes
SkillSchema.index({ tenantId: 1, domain: 1, goal: 1 })
// TTL index for automatic cleanup (90 days)
SkillSchema.index({ lastUsed: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })
```

**Scope and Limits:**

| Constraint | Value | Reason |
|------------|-------|--------|
| **Tenant isolation** | Skills MUST be tenantId-scoped | Prevent cross-tenant data leakage |
| **Domain scope** | Skills are domain-specific | Different UIs have different patterns |
| **TTL** | 90 days since `lastUsed` | Prevent unbounded growth |
| **Max skills per tenant** | 10,000 | Prevent abuse |
| **Min success rate** | 50% | Don't inject failing skills |

---

### B. Two-Phase SPA Ingestion

**⚠️ CRITICAL for Knowledge Extraction Migration:** SPAs require special handling.

**Problem:** In Single Page Applications (SPAs), "hidden" elements often become visible after user interaction (e.g., clicking a button reveals a form). Stripping hidden elements at ingestion time means RAG misses context.

**Solution: Two-Phase Ingestion**

```typescript
// lib/knowledge-extraction/spa-ingestion.ts

interface IngestionPhase {
  phase: "initial" | "post-interaction"
  url: string
  dom: string
  previousChunks?: string[]
}

/**
 * Phase 1: Initial Load
 * - Capture static content visible on page load
 * - Do NOT aggressively strip hidden elements
 * - Tag chunks with phase: "initial"
 */
async function ingestInitialLoad(url: string, dom: string): Promise<Chunk[]> {
  const cleanedDom = cleanDom(dom, { 
    preserveHidden: true,      // Keep display:none elements
    preserveAriaHidden: false, // Remove aria-hidden (accessibility hidden)
  })
  
  const markdown = turndownService.turndown(cleanedDom)
  const chunks = await chunkMarkdown(markdown)
  
  return chunks.map(c => ({
    ...c,
    metadata: {
      ...c.metadata,
      phase: "initial",
      url,
      ingestedAt: new Date(),
    }
  }))
}

/**
 * Phase 2: Post-Interaction
 * - Capture content after user action (e.g., dropdown opened)
 * - Merge with initial chunks, avoiding duplicates
 * - Tag chunks with phase: "post-interaction" and triggerAction
 */
async function ingestPostInteraction(
  url: string, 
  dom: string, 
  triggerAction: string,
  previousChunks: Chunk[]
): Promise<Chunk[]> {
  const cleanedDom = cleanDom(dom, { preserveHidden: false })
  const markdown = turndownService.turndown(cleanedDom)
  const newChunks = await chunkMarkdown(markdown)
  
  // Deduplicate against previous chunks
  const existingContent = new Set(previousChunks.map(c => c.content))
  const uniqueChunks = newChunks.filter(c => !existingContent.has(c.content))
  
  return uniqueChunks.map(c => ({
    ...c,
    metadata: {
      ...c.metadata,
      phase: "post-interaction",
      triggerAction,
      url,
      ingestedAt: new Date(),
    }
  }))
}
```

**When to Trigger Phase 2:**

| Trigger | Example | Action |
|---------|---------|--------|
| Dropdown opened | `click(68)` on menu | Ingest new DOM |
| Modal appeared | Form submission shows modal | Ingest modal content |
| Tab switched | User clicks "Settings" tab | Ingest tab content |
| Dynamic load | Infinite scroll loaded more | Ingest new items |

**Document Ingestion Scope:**

| Phase | What to Capture | What to Tag |
|-------|-----------------|-------------|
| **Initial** | Static page content, hidden elements | `phase: "initial"` |
| **Post-Interaction** | New content after action | `phase: "post-interaction", triggerAction: "click(68)"` |

---

### C. Feature Flags and Rollback Strategy

**All new features MUST have feature flags for safe rollout and rollback.**

**Feature Flag Schema:**

```typescript
// lib/config/feature-flags.ts
export const FEATURE_FLAGS = {
  // Foundation
  ENABLE_LANGGRAPH: process.env.ENABLE_LANGGRAPH === "true",
  ENABLE_LANGFUSE: process.env.ENABLE_LANGFUSE === "true",
  ENABLE_DUAL_COST_TRACKING: process.env.ENABLE_DUAL_COST_TRACKING === "true",
  
  // Batch & Adapt
  ENABLE_ACTION_CHAINING: process.env.ENABLE_ACTION_CHAINING === "true",
  ENABLE_DYNAMIC_REPLANNING: process.env.ENABLE_DYNAMIC_REPLANNING === "true",
  ENABLE_COMPLEXITY_ROUTING: process.env.ENABLE_COMPLEXITY_ROUTING === "true",
  ENABLE_LOOKAHEAD_VERIFICATION: process.env.ENABLE_LOOKAHEAD_VERIFICATION === "true",
  
  // Advanced Logic
  ENABLE_CRITIC_LOOP: process.env.ENABLE_CRITIC_LOOP === "true",
  ENABLE_SKILLS_LIBRARY: process.env.ENABLE_SKILLS_LIBRARY === "true",
  ENABLE_CONDITIONAL_PLANNING: process.env.ENABLE_CONDITIONAL_PLANNING === "true",
  ENABLE_HIERARCHICAL_PLANNING: process.env.ENABLE_HIERARCHICAL_PLANNING === "true",
  
  // Knowledge Extraction
  ENABLE_LOCAL_INGESTION: process.env.ENABLE_LOCAL_INGESTION === "true",
  ENABLE_TWO_PHASE_INGESTION: process.env.ENABLE_TWO_PHASE_INGESTION === "true",
} as const
```

**Rollback Checklist:**

| Feature | Rollback Steps | Data Migration |
|---------|----------------|----------------|
| **LangGraph** | Set `ENABLE_LANGGRAPH=false`; falls back to current flow | None (state compatible) |
| **Action Chaining** | Set `ENABLE_ACTION_CHAINING=false`; returns single actions | None |
| **Skills Library** | Set `ENABLE_SKILLS_LIBRARY=false`; skills not queried | Skills collection remains (TTL cleanup) |
| **Complexity Routing** | Set `ENABLE_COMPLEXITY_ROUTING=false`; all tasks use COMPLEX path | None |

---

### D. Metrics and KPIs

**Production metrics to track for each major feature:**

| Feature | Metric | Target | Alert Threshold |
|---------|--------|--------|-----------------|
| **Overall** | Task completion rate | ≥ 85% | < 75% |
| **Overall** | p95 latency | < 7s | > 10s |
| **Complexity Routing** | SIMPLE task latency | < 2s | > 4s |
| **Complexity Routing** | Classification accuracy | ≥ 90% | < 80% |
| **Action Chaining** | Chain success rate | ≥ 80% | < 60% |
| **Action Chaining** | Round-trip reduction | ≥ 50% | < 30% |
| **Dynamic Re-Planning** | Re-plan frequency | < 20% | > 40% |
| **Skills Library** | Skill hit rate | ≥ 10% | N/A |
| **Skills Library** | Skill effectiveness | ≥ 60% | < 40% |
| **Verification** | Verification success rate | ≥ 90% | < 80% |
| **Self-Correction** | Correction success rate | ≥ 70% | < 50% |

**Dashboard Requirements:**

1. **Real-time:** Task completion rate, active tasks, error rate
2. **Hourly:** Latency distribution, token usage, feature flag status
3. **Daily:** Skills created/used, re-planning frequency, classification accuracy
4. **Weekly:** Cost trends, success rate trends, feature effectiveness

---

### E. Testing Requirements

**Each feature MUST have:**

| Test Type | Coverage | Notes |
|-----------|----------|-------|
| **Unit Tests** | Core algorithms (DOM similarity, time-decay ranking, complexity classification) | Vitest |
| **Integration Tests** | LangGraph nodes, LangFuse integration, skill retrieval | Vitest + mocks |
| **E2E Tests** | Full interact flow with feature flags on/off | Playwright |
| **Load Tests** | Throughput under expected load (100 req/min) | k6 or similar |

**Test Scenarios for Action Chaining:**

```typescript
describe("Action Chaining", () => {
  it("should chain 5 form fields into single response", async () => { /* ... */ })
  it("should report partial failure at index N", async () => { /* ... */ })
  it("should recover from partial failure and continue", async () => { /* ... */ })
  it("should fall back to single actions when flag disabled", async () => { /* ... */ })
  it("should NOT chain when actions are not safe to chain", async () => { /* ... */ })
})
```

---

### F. Operational Runbook

**Incident Response for Common Issues:**

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| **High latency** | p95 > 10s | Check LLM provider status; enable complexity routing; reduce chain size |
| **Low completion rate** | < 75% tasks complete | Review verification failures; check skill effectiveness; review prompts |
| **Skills explosion** | > 8000 skills for tenant | Review TTL; check for duplicate skills; reduce skill creation rate |
| **LangFuse down** | No traces in UI | Verify `ENABLE_LANGFUSE=true`; check API key; LangFuse continues to DB |
| **Action chain failures** | > 40% partial failures | Reduce chain size; tighten safety criteria; review DOM similarity |

**Deployment Checklist:**

- [ ] Feature flags set correctly for environment
- [ ] LangFuse API key configured
- [ ] MongoDB indexes created (skills, TTL)
- [ ] Alerting configured for KPIs
- [ ] Rollback tested in staging
- [ ] Load test passed at expected capacity

---

### G. Implementation Priority Matrix

**Recommended implementation order with effort/impact:**

| Priority | Task | Status | Effort | Impact | Dependencies |
|----------|------|--------|--------|--------|--------------|
| **P0** | LangGraph + Complexity Routing | ✅ **DONE** | High | High | None (new foundation) |
| **P0** | LangFuse + Sentry Separation | ✅ **DONE** | Medium | High | None |
| **P0** | Hybrid Cost Tracking | ✅ **DONE** | Medium | High | LangFuse ✅ |
| **P1** | Action Chaining | ✅ **DONE** | High | Very High | Foundation complete |
| **P1** | DOM Similarity Algorithm | 🔲 Planned | Low | Medium | None |
| **P1** | Dynamic Re-Planning | 🔲 Planned | Medium | Medium | DOM Similarity |
| **P2** | Skills Library (with limits) | 🔲 Planned | High | High | Foundation complete |
| **P2** | Two-Phase SPA Ingestion | 🔲 Planned | Medium | Medium | Knowledge migration |
| **P3** | Critic Loop | 🔲 Planned | Low | Medium | None |
| **P3** | Conditional Planning | 🔲 Planned | High | Medium | Planning engine |
| **P4** | Hierarchical Planning | 🔲 Planned | Very High | Medium | All above |

**Critical Path:** ~~LangGraph~~ → ~~LangFuse~~ → ~~Cost Tracking~~ → ~~Action Chaining~~ → Skills Library

---

## References

| Document | Purpose |
|----------|---------|
| `SERVER_SIDE_AGENT_ARCH.md` | Complete server architecture specification |
| `THIN_SERVER_ROADMAP.md` | Server implementation tasks |
| `THIN_CLIENT_ROADMAP.md` | Client implementation tasks and format reference |
| `ARCHITECTURE.md` | Database, tenancy, and system design |
| `app/api/agent/interact/route.ts` | Current implementation |
| `lib/agent/*.ts` | Agent engine implementations |
