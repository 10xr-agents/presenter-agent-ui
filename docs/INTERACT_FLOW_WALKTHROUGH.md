# Interact Flow: Step-by-Step Walkthrough

**Purpose:** Explain how the backend processes a command from the Chrome extension from first request to completion. This document is the **canonical** flow description and **implementation roadmap** for the interact flow.  
**Example prompt:** *"Add a new patient with name 'Jas'"*

**Focus:** Primary mode is **DOM-based**. Visual support via **Hybrid Vision + Skeleton** mode is available for spatial/visual queries — see § Hybrid Vision + Skeleton Mode. Other visual features (OCR, Session Replay screenshot scrubber) remain **deferred** — see § Deferred: Visual / Non-DOM Features.

**Related docs (canonical details):**

- **Verification:** Observation-based verification only (no prediction-based in main flow), goalAchieved, action_succeeded vs task_completed, step-level vs task-level, sub-task verification, client contract, troubleshooting → **`docs/VERIFICATION_PROCESS.md`**.
- **Planner:** Planning engine, step refinement, re-planning, verification outcome in context, conditional and hierarchical planning (wired in graph), implementation tasks → **`docs/PLANNER_PROCESS.md`**.

**Roadmap format:** When adding or updating implementation roadmap sections, follow the structure and best practices in `THIN_CLIENT_ROADMAP.md` (Objectives, Deliverables, Definition of Done, References, task ordering).

---

## Production Readiness Status

| Component | Status | Phase | Notes |
|-----------|--------|-------|-------|
| **Core Interact Loop** | ✅ Implemented | — | `app/api/agent/interact/route.ts` (now uses LangGraph) |
| **4-Step Reasoning Pipeline** | ✅ Implemented | — | Context analysis, web search, ASK_USER |
| **Planning Engine** | ✅ Implemented | — | `lib/agent/planning-engine.ts`. See **PLANNER_PROCESS.md** for flow and roadmap. |
| **Verification Engine** | ✅ Implemented | — | `lib/agent/verification-engine.ts`. See **VERIFICATION_PROCESS.md** for flow and roadmap. |
| **Self-Correction Engine** | ✅ Implemented | — | `lib/agent/self-correction-engine.ts` |
| **Outcome Prediction** | ✅ Implemented | — | `lib/agent/outcome-prediction-engine.ts` |
| **Step Refinement** | ✅ Implemented | — | `lib/agent/step-refinement-engine.ts` |
| **LangGraph.js + Complexity Routing** | ✅ **DEFAULT** | 1 | `lib/agent/graph/` - Always enabled, no flag needed |
| **LangFuse + Sentry Separation** | ✅ **COMPLETE** | 1 | `lib/observability/` - Enable when LangFuse keys are set |
| **Hybrid Cost Tracking** | ✅ **COMPLETE** | 1 | `lib/cost/` - Dual-write to MongoDB + LangFuse |
| **Action Chaining** | ✅ **COMPLETE** | 2 | `lib/agent/chaining/` - Chain safety analysis + partial failure recovery |
| **Knowledge Extraction Pipeline** | ✅ **COMPLETE** | 2 | `lib/knowledge/` - Multi-format doc ingestion + web crawling |
| **Two-Phase SPA Ingestion** | 🔲 Planned | 3 | Required for Knowledge Extraction |
| **DOM Similarity Algorithm** | ✅ **COMPLETE** | 3 | `lib/agent/dom-similarity.ts` - Jaccard similarity on element signatures |
| **Dynamic Re-Planning** | ✅ **COMPLETE** | 3 | `lib/agent/replanning-engine.ts`. See **PLANNER_PROCESS.md**. |
| **Look-Ahead Verification** | ✅ **COMPLETE** | 3 | `nextGoal` in ExpectedOutcome + verification engine. See **VERIFICATION_PROCESS.md**. |
| **Critic Loop** | ✅ **COMPLETE** | 4 | `lib/agent/critic-engine.ts` - Pre-execution reflection |
| **Multi-Source Synthesis** | ✅ **COMPLETE** | 4 | `requiredSources` array in context analysis |
| **Dynamic Interrupt** | ✅ **COMPLETE** | 4 | `lib/agent/dynamic-interrupt.ts` - Mid-flight MISSING_INFO handling |
| **Skills Library** | ✅ **COMPLETE** | 4 | `lib/models/skill.ts` + `lib/agent/skills-service.ts` - Tenant/domain scoped |
| **Conditional Planning** | ✅ **COMPLETE** | 4 | `lib/agent/conditional-planning.ts`. See **PLANNER_PROCESS.md**. |
| **Hierarchical Planning** | ✅ **COMPLETE** | 4 | `lib/agent/hierarchical-planning.ts`. **Wired in graph (Tasks 8 + 9):** planning node calls decomposePlan; hierarchicalPlan in state and persisted; verification node uses sub_task_completed to advance/fail sub-task. See **PLANNER_PROCESS.md** and **VERIFICATION_PROCESS.md** Task 5. |
| **Tiered Verification** | ✅ **COMPLETE** | 5 | `lib/agent/verification/tiered-verification.ts`. **Token efficiency optimization:** Tier 1 (deterministic, 0 tokens), Tier 2 (lightweight LLM, ~100 tokens), Tier 3 (full LLM). Intermediate steps use Tier 1; final steps use Tier 2/3. See **VERIFICATION_PROCESS.md** Phase 5. |
| **V3 Semantic Extraction** | ✅ **SCHEMA READY** | 5 | `lib/agent/schemas.ts`. **PRIMARY DOM mode:** 99%+ token reduction with minified JSON (`interactiveTree`). V3 Advanced fields: `recentEvents`, `hasErrors`, `scrollableContainers`. See **DOM_EXTRACTION_ARCHITECTURE.md**. |
| **Sentinel Verification** | ✅ **SCHEMA READY** | 5 | `lib/agent/schemas.ts`. **Client-side verification:** `verification_passed`, `errors_detected`, `success_messages`. See **VERIFICATION_PROCESS.md** § V3 Advanced. |

**Legend:** ✅ = Complete/Default | 🔄 = In Progress | 🔲 Planned

**Critical Path:** ~~LangGraph + Complexity Routing~~ → ~~LangFuse~~ → ~~Cost Tracking~~ → ~~Action Chaining~~ → ~~Skills Library~~ → ✅ Phase 4 Complete

**Implementation notes (regular improvements):**

- **Verification:** The interact flow uses **observation-based verification only** (`verifyActionWithObservations`). We compare **beforeState** (url, domHash, optional semanticSkeleton) to current DOM/URL, build an observation list, and ask the semantic LLM for a verdict. **Prediction-based verification** (expectedOutcome + DOM checks via `verifyAction`) is **not** used for the primary verification path; it exists only for correction/legacy support. **Phase 5 Tiered Verification:** For token efficiency, verification now uses a 3-tier approach: Tier 1 (deterministic heuristics, 0 tokens) for intermediate steps; Tier 2 (lightweight LLM, ~100 tokens) for simple final steps; Tier 3 (full LLM) for complex cases. Results include `verificationTier` and `tokensSaved` for observability. See **VERIFICATION_PROCESS.md** for goalAchieved, action_succeeded vs task_completed, step-level vs task-level, sub-task verification, and Phase 5 tiered verification.
- **Planner:** Verification outcome (action_succeeded, task_completed) is passed into planning and step_refinement; hierarchical planning is wired in the graph with sub-task-level verification. See **PLANNER_PROCESS.md** for planning engine, step refinement, replanning, conditional and hierarchical planning.

**Logical improvements (process hardening):**

| Area | Vulnerability | Fix | Status |
|------|---------------|-----|--------|
| **Planning** | Semantic loops (e.g. paging forever) | **Velocity check:** After 5 consecutive successful verifications without task_completed, route to finalize with reflection message. | ✅ Implemented (`consecutiveSuccessWithoutTaskComplete`, verification router, Task model) |
| **Ops** | Zombie tasks (tab closed, no follow-up request) | **Lazy expiration:** When listing/loading active tasks, mark tasks untouched for >30 minutes as `interrupted`. | ✅ Implemented (GET `/api/session/[sessionId]/task/active` expires stale tasks) |
| **Context** | Token overflow on long tasks | **Rolling summarization:** Keep only last 10 raw `previousActions`; prepend summary (e.g. "N earlier steps completed.") for step_refinement. | ✅ Implemented (`loadTaskContext` trim, `previousActionsSummary`, step-refinement engine) |
| **RAG** | Conflicting chunks (Phase 1 vs Phase 2 UI state) | **Freshness bias:** At Phase 2 ingestion, soft-delete or down-rank overlapping Phase 1 chunks; at retrieval prefer fresh chunks. | 🔲 Spec only (see § Two-phase SPA ingestion → RAG Freshness) |

---

## High-Level Loop

1. **Extension** sends `POST /api/agent/interact` with:
   - **V3 Semantic (PRIMARY):** `{ url, query, dom, domMode: "semantic_v3", interactiveTree, viewport, pageTitle, taskId?, sessionId? }`
   - **Legacy/Fallback:** `{ url, query, dom, domMode?, skeletonDom?, screenshot?, taskId?, sessionId? }`
2. **Backend** authenticates, fetches RAG, runs reasoning/planning, calls LLM (or step refinement), predicts outcome, stores the action, returns `{ thought, action, actionDetails, taskId, sessionId, ... }`. All LLM calls that expect JSON (verification verdict, action thought+action) use **structured output** (Gemini `responseJsonSchema`) so responses are valid JSON only — see `docs/GEMINI_USAGE.md` § Structured outputs.
3. **Extension** executes the action (e.g. `click("14")`, `setValue("14", "Jas")`) on the page using element ID from `interactiveTree`, then sends the **next** request with **updated state** and **the same `taskId`** from the response.
4. **Backend** verifies the **previous** action against the new state, then produces the **next** action. Repeat until `finish()` or `fail()` or max steps/retries.

### Client contract and troubleshooting (verification continuation)

**Required:** First request — no `taskId`. After executing an action — send **`taskId`** from the previous response and **updated `dom`** (and `url` if changed). Without `taskId`, every request is treated as a new task and the same step repeats. **Troubleshooting** (same step repeats with taskId): see **VERIFICATION_PROCESS.md** § Client contract and troubleshooting.

---

## Client Contract: State Persistence & Stability

This section defines **mandatory client-side behaviors** to prevent common process failures. These are NOT suggestions — ignoring them causes flaky, hard-to-debug agent loops. It also serves as the **Chrome extension requirements** reference (formerly a separate doc); checklist and implementation alignment are below.

**Chrome extension checklist:**

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Persist `taskId` in `chrome.storage.local` (keyed by tabId) | ✅ Implemented | `src/helpers/taskPersistence.ts` — see § 1 and § 4 Implementation alignment. |
| 2 | Use task recovery endpoint when taskId is missing | ✅ Implemented | `api/client.ts`: `getActiveTask`; `currentTask.ts` uses it when no taskId. |
| 3 | Wait for stability before capturing DOM (min 500ms) | ✅ Implemented | `domWaiting.ts`: `waitForDOMChangesAfterAction`; `currentTask.ts` calls it after action. |
| 4 | Send `clientObservations` (didNetworkOccur, didDomMutate, didUrlChange) | ✅ Implemented | `currentTask.ts`: builds from `lastDOMChanges` + content script RPC; sent in `agentInteract`. |
| 5 | Send `taskId` on every request after the first (continuation) | ✅ Implemented | Without it, every request is treated as a new task. |
| 6 | Send updated `dom` and `url` after executing an action | ✅ Implemented | Required for verification. |

### 1. taskId Persistence (Prevents "Lost Task" Loop)

**Problem:** If the client loses `taskId` (page refresh, extension restart, background script killed), the next request has no `taskId` and the server treats it as a **new task**. The agent loops on Step 1 forever.

**Solution:** The extension MUST persist `taskId` in durable storage, not memory.

**Required client behavior:**

```typescript
// ✅ CORRECT: Store taskId in chrome.storage.local keyed by tabId
async function onInteractResponse(tabId: number, response: InteractResponse) {
  await chrome.storage.local.set({
    [`task_${tabId}`]: {
      taskId: response.taskId,
      sessionId: response.sessionId,
      url: response.url,
      timestamp: Date.now(),
    },
  })
}

// ✅ CORRECT: Recover taskId before sending request
async function getTaskIdForTab(tabId: number): Promise<string | undefined> {
  const result = await chrome.storage.local.get(`task_${tabId}`)
  const stored = result[`task_${tabId}`]
  // Expire after 30 minutes of inactivity
  if (stored && Date.now() - stored.timestamp < 30 * 60 * 1000) {
    return stored.taskId
  }
  return undefined
}

// ❌ WRONG: Storing taskId in memory variable
let currentTaskId: string // Lost on page refresh or extension restart
```

**Server-side recovery fallback:**

If `chrome.storage.local` fails, the extension can call the recovery endpoint:

```
GET /api/session/{sessionId}/task/active?url={currentTabUrl}
```

Response (200):
```json
{
  "taskId": "abc-123",
  "query": "add a new patient",
  "status": "executing",
  "currentStepIndex": 2,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:31:00Z"
}
```

Response (404): No active task — start fresh (new task flow).

**Important:** This endpoint is a **safety net**, not primary storage. The client should always try `chrome.storage.local` first.

### 2. Stability Wait (Prevents "Snapshot Race" Condition)

**Problem:** After executing an action (e.g., `click(Save)`), if the client captures the DOM **immediately**, it may capture a transitional state (spinner, no changes yet). The server compares this snapshot to `beforeState`, sees no difference, marks verification as failed, and triggers unnecessary correction.

**Timeline of the race:**
```
T0.0ms  : click(Save) executed
T0.1ms  : ❌ Client captures DOM (too early - no visible change yet)
T50ms   : Spinner appears
T500ms  : API response returns
T600ms  : ✅ "Success" message appears
T700ms  : DOM settles
```

**Solution:** The extension MUST wait for **DOM stability** before capturing the snapshot.

**Required client behavior:**

```typescript
// ✅ CORRECT: Wait for stability before capturing DOM
async function executeActionAndCapture(action: string): Promise<DomSnapshot> {
  // 1. Execute the action
  await executeAction(action)
  
  // 2. Wait for stability (ALL conditions should be met)
  await waitForStability({
    // a. Network idle: no pending fetch/XHR for 500ms
    networkIdleMs: 500,
    // b. DOM settled: no MutationObserver events for 300ms
    domSettledMs: 300,
    // c. Minimum wait: always wait at least 500ms
    minimumWaitMs: 500,
    // d. Maximum wait: don't wait forever
    maximumWaitMs: 5000,
  })
  
  // 3. NOW capture the DOM snapshot
  const dom = document.documentElement.outerHTML
  const url = window.location.href
  
  return { dom, url }
}

// ❌ WRONG: Immediate capture after action
async function executeActionAndCapture(action: string) {
  await executeAction(action)
  return document.documentElement.outerHTML // Too fast!
}
```

**Stability detection heuristics:**

| Signal | How to detect | Weight |
|--------|---------------|--------|
| Network idle | `PerformanceObserver` or `fetch` wrapper, no pending requests for 500ms | High |
| DOM settled | `MutationObserver`, no mutations for 300ms | High |
| URL stable | `popstate` / `hashchange` events settled | Medium |
| Animation done | `requestAnimationFrame` loop shows no visual changes | Low |

**Minimum implementation:**

At minimum, wait 500ms after action execution before capturing. Better implementations use all signals above.

```typescript
// Minimum viable stability wait
async function waitForStability(options: StabilityOptions): Promise<void> {
  const { minimumWaitMs = 500, maximumWaitMs = 5000 } = options
  
  const startTime = Date.now()
  
  // Always wait minimum time
  await sleep(minimumWaitMs)
  
  // Then wait for network + DOM to settle (with timeout)
  while (Date.now() - startTime < maximumWaitMs) {
    const [networkIdle, domSettled] = await Promise.all([
      isNetworkIdle(500),
      isDomSettled(300),
    ])
    
    if (networkIdle && domSettled) {
      return // Stable!
    }
    
    await sleep(100) // Check again
  }
  
  // Timeout reached, proceed anyway (better than hanging)
  console.warn('Stability wait timeout, proceeding with capture')
}
```

### 3. clientObservations Contract

The extension MUST report what it witnessed during/after action execution:

```typescript
interface ClientObservations {
  /** Did any network request occur after action? */
  didNetworkOccur?: boolean
  /** Did DOM mutations occur after action? */
  didDomMutate?: boolean  
  /** Did URL change after action? */
  didUrlChange?: boolean
}
```

These observations are used by the server for verification. Report them accurately:

```typescript
// Instrument during action execution
let networkOccurred = false
let domMutated = false
const originalUrl = window.location.href

const fetchObserver = new PerformanceObserver((list) => {
  if (list.getEntries().some(e => e.entryType === 'resource')) {
    networkOccurred = true
  }
})
fetchObserver.observe({ entryTypes: ['resource'] })

const mutationObserver = new MutationObserver(() => {
  domMutated = true
})
mutationObserver.observe(document.body, { childList: true, subtree: true })

// Execute action
await executeAction(action)
await waitForStability()

// Report observations
const clientObservations = {
  didNetworkOccur: networkOccurred,
  didDomMutate: domMutated,
  didUrlChange: window.location.href !== originalUrl,
}

// Cleanup
fetchObserver.disconnect()
mutationObserver.disconnect()
```

### 4. Client implementation alignment (Chrome extension)

The Chrome extension implements the contract above. Mapping of server/doc requirements to extension code:

| Server / doc requirement | Extension implementation | Location (extension repo) |
|--------------------------|--------------------------|---------------------------|
| **1. taskId persistence** | | |
| Store `task_${tabId}` with `taskId`, `sessionId`, `url`, `timestamp` | Implemented | `src/helpers/taskPersistence.ts`: `persistTaskState(tabId, { taskId, sessionId, url, timestamp })` → `chrome.storage.local.set({ [\`task_${tabId}\`]: { ... } })` |
| Recover taskId before sending request; expire after 30 min | Implemented | `taskPersistence.ts`: `getTaskIdForTab(tabId)` reads storage, returns `undefined` if `Date.now() - stored.timestamp > 30 * 60 * 1000` |
| On interact response, persist taskId | Implemented | `currentTask.ts`: after storing `taskIdFromResponse` in state, calls `persistTaskState(tabId, { taskId, sessionId, url, timestamp })` |
| Fallback: `GET /api/session/{sessionId}/task/active?url={currentTabUrl}` | Implemented | `api/client.ts`: `getActiveTask(sessionId, currentTabUrl)` → `GET /api/session/${sessionId}/task/active?url=...`; `currentTask.ts` uses it when `!currentTaskId && currentSessionId && currentUrl` |
| **2. Stability wait** | | |
| Wait before capturing DOM: networkIdle 500ms, domSettled 300ms, minimumWait 500ms, max 5000ms | Implemented | `domWaiting.ts`: `waitForDOMChangesAfterAction` uses `minWait: 500`, `stabilityThreshold: 300`, `maxWait: 5000` (10000 for default config); `currentTask.ts` uses `minWait: 500`, `stabilityThreshold: 300`, `maxWait: 5000` (dropdown: 1000/500/8000) |
| Call stability wait after execute action, then capture DOM | Implemented | `currentTask.ts`: after `callDOMAction` / `executeAction`, calls `waitForDOMChangesAfterAction(beforeSnapshot, waitConfig)`; next loop iteration does `getSimplifiedDom()` (capture) |
| **3. clientObservations** | | |
| Report `didNetworkOccur`, `didDomMutate`, `didUrlChange` | Implemented | `currentTask.ts`: builds `clientObservations` from `lastDOMChanges` with `didUrlChange`, `didDomMutate` (addedCount + removedCount > 0), `didNetworkOccur` (from content script mark/since-mark RPC); sent in `apiClient.agentInteract(..., clientObservations)` |

**Summary:**

- **Lost task (Vulnerability #1):** Extension persists taskId in `chrome.storage.local` under `task_${tabId}` with 30 min expiry and recovers it before each interact request. If recovery from storage fails, it calls `GET /api/session/{sessionId}/task/active?url={currentTabUrl}` and uses the returned `taskId` when present.
- **Snapshot race (Vulnerability #3):** Extension waits for stability (min 500ms, DOM settled 300ms, network idle) via `waitForDOMChangesAfterAction` after each action; the next request uses the DOM captured in the following loop iteration.
- **clientObservations:** Extension sends `didNetworkOccur`, `didDomMutate`, and `didUrlChange` in the interact request body so the server can use them for verification.

The client-side behavior required for the server-side recovery endpoint and the documented contract is implemented and wired up in the extension.

### 5. Request shape (recap)

**First request (new task):**

- `POST /api/agent/interact` with `url`, `query`, `dom`. Optionally `sessionId`. **No** `taskId`.

**After executing an action:**

- `POST /api/agent/interact` with:
  - **taskId** from the previous response (or from recovery endpoint).
  - **sessionId** (same as before).
  - **url** — current tab URL (may have changed).
  - **dom** — DOM snapshot taken **after** the stability wait.
  - **query** — can repeat the same or omit; server has context.
  - **clientObservations** — as in § 3.

Without `taskId`, the server starts a **new task** and you get Step 1 again.

### 6. No additional extension changes for recent backend work

The following backend changes **do not** require any new extension behavior:

- **Velocity check (semantic loop prevention):** Server-side. When the agent does 5+ steps without completing the goal, the server returns a failure message. Extension just displays it.
- **Zombie task expiration:** Server-side. Tasks untouched for >30 minutes are marked interrupted when someone calls the task/active endpoint. No extension change.
- **Rolling summarization:** Server-side. Context is trimmed on the server. No extension change.
- **RAG freshness:** Spec only; implementation is in the knowledge pipeline. No extension change.

No new contract or API fields were added for the extension in the recent logical-improvements work.

---

## V3 Semantic Extraction (PRIMARY Mode)

**Status:** ✅ Schema Ready (February 2026)

V3 Semantic Extraction is now the **PRIMARY** DOM extraction mode, providing 99%+ token reduction compared to full DOM. The extension sends a minified JSON array of interactive elements instead of HTML.

### Why V3?

| Problem | V3 Solution |
|---------|-------------|
| Full DOM is 50-200KB (~15-20k tokens) | V3 JSON is 100-300 bytes (~25-75 tokens) |
| Element IDs drift on re-renders | Stable `data-llm-id` persists across renders |
| Need to parse complex HTML | Clean JSON with semantic roles |
| Expensive LLM calls for simple actions | Deterministic element lookup by ID |

### V3 Request Fields

| Field | Type | Description |
|-------|------|-------------|
| `domMode` | `"semantic_v3"` | Indicates V3 ultra-light format (PRIMARY) |
| `interactiveTree` | `SemanticNodeV3[]` | Minified JSON array with viewport pruning |
| `viewport` | `{ width, height }` | Viewport dimensions for coordinate actions |
| `pageTitle` | `string` | Page title for context |

### V3 Advanced Fields (Production-Grade)

| Field | Type | Description |
|-------|------|-------------|
| `scrollPosition` | `string` | Scroll depth (e.g., "50%") |
| `scrollableContainers` | `array` | Virtual list containers for infinite scroll |
| `recentEvents` | `string[]` | Mutation stream for ghost state detection |
| `hasErrors` / `hasSuccess` | `boolean` | Error/success message detection |
| `verification_passed` | `boolean` | Sentinel verification result |
| `errors_detected` | `string[]` | Errors caught by Sentinel |

### V3 Minified Keys Legend

```
- i: element ID (use this in click(i) or setValue(i, text))
- r: role (btn=button, inp=input, link=link, chk=checkbox, sel=select)
- n: name/label visible to user
- v: current value (for inputs)
- s: state (disabled, checked, expanded)
- xy: [x, y] coordinates on screen
- f: frame ID (0 = main frame, omitted if 0)
- box: [x, y, w, h] bounding box (V3 Advanced)
- scr: { depth, h } scrollable container info (V3 Advanced)
- occ: true if element is occluded by modal (V3 Advanced)
```

### Example V3 Payload

```json
{
  "domMode": "semantic_v3",
  "pageTitle": "Google",
  "viewport": { "width": 1280, "height": 800 },
  "interactiveTree": [
    { "i": "12", "r": "link", "n": "Gmail", "xy": [900, 20] },
    { "i": "14", "r": "inp", "n": "Search", "v": "", "xy": [400, 300] },
    { "i": "15", "r": "btn", "n": "Google Search", "xy": [400, 350] }
  ]
}
```

### Mode Priority (Fallback Chain)

| Priority | Mode | Tokens | When Used |
|----------|------|--------|-----------|
| **1** | `semantic_v3` | 25-75 | DEFAULT - viewport pruning + minified keys |
| 2 | `semantic` | 50-125 | V3 fails or empty |
| 3 | `skeleton` | 500-1500 | Semantic fails |
| 4 | `hybrid` | 2000-3000 | Visual/spatial query detected |
| **5** | `full` | 10k-50k | **ONLY on explicit backend `needs_full_dom` request** |

**Key Principle:** Full DOM should NEVER be sent proactively. Only send it when the backend explicitly requests it via a `needs_full_dom` response.

### Server Behavior with V3

1. **Parse `interactiveTree`**: Extract element info directly from JSON (no HTML parsing needed).
2. **Step Refinement**: Use element IDs (`i` field) directly in actions: `click("14")`, `setValue("14", "text")`.
3. **Coordinate Actions**: Use `xy` for coordinate-based clicks when element targeting fails.
4. **Respect Occlusion**: Don't target elements with `occ: true` (behind modals).
5. **Sentinel Integration**: Use `verification_passed`, `errors_detected` for faster verification.

**Reference:** See `docs/DOM_EXTRACTION_ARCHITECTURE.md` for the complete V3 specification and `docs/SPECS_AND_CONTRACTS.md` § Semantic JSON Protocol.

---

## Hybrid Vision + Skeleton Mode (Legacy/Fallback)

The hybrid vision + skeleton mode reduces token usage by ~80% while improving accuracy for visual/spatial tasks. This is used when **V3 Semantic extraction fails** or for **visual/spatial queries**.

1. **Visual Stream (Screenshot)**: JPEG screenshot for layout/spatial context (~1k tokens)
2. **Action Stream (Skeleton DOM)**: Hyper-compressed DOM with only interactive elements (~1-2k tokens)

### Request Fields

| Field | Type | Description |
|-------|------|-------------|
| `screenshot` | `string \| null` | Base64-encoded JPEG screenshot (1024px width, 0.7 quality). `null` if unchanged. |
| `domMode` | `"skeleton" \| "full" \| "hybrid"` | Processing mode hint for server. |
| `skeletonDom` | `string` | Skeleton DOM with only interactive elements. Server can extract if not provided. |
| `screenshotHash` | `string` | Perceptual hash for deduplication. |

### Mode Selection (When NOT using V3)

| Mode | When Used | Token Cost |
|------|-----------|------------|
| `skeleton` | Simple text-based actions ("click Search button") | ~500-1.5k |
| `hybrid` | Visual/spatial queries ("click the gear icon", "what's the price") | ~2-3k |
| `full` | Fallback when skeleton is insufficient | ~15-20k |

Visual queries are detected by keywords like: "icon", "image", "looks like", "top", "bottom", "left", "right", "corner", "next to".

### Server Behavior

1. **Mode Router** (`lib/agent/mode-router.ts`): Analyzes query to recommend mode.
2. **DOM Skeleton** (`lib/agent/dom-skeleton.ts`): Server-side extraction if client doesn't send `skeletonDom`.
3. **Multimodal LLM** (`lib/llm/gemini-client.ts`): Accepts text + images for hybrid mode.
4. **Fallback**: If skeleton is insufficient, server can request full DOM retry.

### Extension Specification

See `docs/DOM_EXTRACTION_ARCHITECTURE.md` and `docs/SPECS_AND_CONTRACTS.md` for:
- V3 Semantic extraction (PRIMARY)
- Screenshot capture implementation
- Skeleton DOM extraction algorithm
- Payload contract details

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

**4. Create task (Provisional ID Pattern)**

- **Provisional ID:** A `taskId` (UUID) is generated **at the start** of `runInteractGraph` for all new tasks. This ID is used for logging throughout the entire graph execution, ensuring full traceability from the first log line.
- **Conditional persistence:** The task is only **persisted to the database** after successful action generation (not for `ASK_USER` or failures). This prevents orphan tasks while maintaining observability.
- Create **Task** with the provisional `taskId`, `tenantId`, `userId`, `url`, `query`, `status: "active"`, optional `webSearchResult`.
- Set `currentStepIndex = 0`.

> **Why provisional IDs?** Previously, logs for new tasks showed `[task:]` (empty) until the task was persisted at the end. This made debugging failed requests difficult. Now all logs show `[task:UUID]` from the start, whether or not the task gets persisted.

### Step 1.6 — Planning (after reasoning)

Planning runs only after reasoning and task creation. If no plan exists, we generate and store it; `currentStepIndex` points at the next step. **Flow, triggers, and implementation roadmap:** **`docs/PLANNER_PROCESS.md`**.

### Step 1.7 — Step refinement or LLM action

If the plan exists and the current step is refinable, we call `refineStep(...)` to produce a DOM action; otherwise we build the action prompt and call the LLM. When available (e.g. after verification → replanning → step_refinement in the same run), `refineStep` receives an optional **verification summary** (action_succeeded, task_completed) so the prompt can say "Previous action succeeded; full goal not yet achieved" (Task 6 — see **`docs/PLANNER_PROCESS.md`** § Optional verification summary). Special handling: `googleSearch` → Tavily; `verifySuccess` / `finish()` retry logic. **Details and roadmap:** **`docs/PLANNER_PROCESS.md`** (Step Refinement, Action Generation).

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

We load the last TaskAction and **beforeState** (url, domHash, optional semanticSkeleton from when the action was generated). We run **observation-based verification only**: `verifyActionWithObservations(beforeState, currentDom, currentUrl, action, userGoal, clientObservations)` — compare before vs after, build observation list, semantic LLM verdict; set **goalAchieved** from `task_completed && confidence ≥ 0.70`. No prediction-based verification in the main flow. On failure → self-correction. **Flow, goalAchieved, step-level vs task-level, and troubleshooting:** **`docs/VERIFICATION_PROCESS.md`**.

### Step 3.4 — Self-correction (Task 8) when verification fails

We enforce retry/consecutive-failure limits; if under limit, call `generateCorrection(...)`, store CorrectionRecord, update plan, and return the retry action immediately (no new TaskAction). **Flow, triggers, and implementation:** **`docs/VERIFICATION_PROCESS.md`** (Self-correction).

### Step 3.5 — Max steps check

- If `currentStepIndex >= MAX_STEPS_PER_TASK` (e.g. 50): mark task **failed**, return **400** `MAX_STEPS_EXCEEDED`.

### Step 3.6 — Next action (same as Phase 1)

- **Planning**: reuse existing plan; **currentStepIndex** set from `previousActions.length` at graph input (see **PLANNER_PROCESS.md**). Refine current step or fall back to LLM action. Outcome prediction, store TaskAction, return NextActionResponse (including verification for previous action).

---

## Phase 4: Loop until done

- Extension **repeats**: execute action → send `{ url, dom, taskId, ... }` → backend verifies previous action, optionally corrects, then returns next action.
- Loop ends when:
  - **`finish()`**: task **completed**, session status updated.
  - **`fail(reason)`**: task **failed**.
  - **Max steps** or **max retries / consecutive failures**: task **failed**, **400** with corresponding code.

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

**Recommendation:** Use the Node stack for HTML/web; use **Gotenberg → HTML → Turndown** for complex PDFs when needed. **Focus:** DOM-based extraction only for now; **OCR/visual PDF parsing** (Marker-style) is **deferred** — see § Deferred: Visual / Non-DOM Features at end of roadmap.

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

**References:** § Planned Open-Source Stack (LangGraph.js), `ARCHITECTURE.md` §4, § Batch & Adapt Task 3 (Complexity Routing).

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
| `lib/agent/llm-client.ts` | Uses Gemini client for LLM calls |
| `lib/agent/graph/route-integration.ts` | Full trace integration for interact flow |
| `env.mjs` | LangFuse env var validation |
| `.env.example` | LangFuse configuration section |

**How to Enable:**

```bash
# In .env.local
# LangFuse enabled when keys are set (one trace per interact for cost calculation)
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

**References:** § Planned Open-Source Stack (LangFuse), `ARCHITECTURE.md` §4, existing Sentry integration in `sentry.*.config.ts`.

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
   | `provider` | `GOOGLE` |
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
| Pricing Module | `lib/cost/pricing.ts` | Centralized pricing for Google Gemini |
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
  provider: "google",
  model: "gemini-3-flash-preview",
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

**References:** § Planned Open-Source Stack (LangFuse), `lib/cost/tracker`, `ARCHITECTURE.md` §4.

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
- LLM calls use Google Gemini; traces recorded via application instrumentation
- Full interact flow traced: complexity → context → plan → action → verify → correct
- Verification/correction scores recorded for evaluation
- Enable when LangFuse keys are set (LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY)

**Task 3 Completion Notes (2026-01-28):**
- Hybrid cost tracking with dual-write strategy complete
- **TokenUsageLog model:** MongoDB collection for immutable billing records (`lib/models/token-usage-log.ts`)
- **Pricing module:** Centralized pricing for Google Gemini models (`lib/cost/pricing.ts`)
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

**References:** § Planned Open-Source Stack (Smart Ingestion, Zep), § Production Hardening: Section B (Two-Phase SPA Ingestion), `ARCHITECTURE.md` §5, `ARCHITECTURE.md` Task 2, `BROWSER_AUTOMATION_RESOLVE_SCHEMA.md`.

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

**Rollback:** Post-launch, a feature flag can be added to disable chaining and return single actions if needed.

**References:** `ARCHITECTURE.md` §4.9.3, `ARCHITECTURE.md` Part E Task 19.

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

Re-evaluate plan validity on URL change or DOM similarity < 70%; run Plan Validator, adapt or regenerate plan. **Algorithm, triggers, DoD, and metrics:** **`docs/PLANNER_PROCESS.md`** (Re-planning).

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

**References:** `ARCHITECTURE.md` §4.9.3, `ARCHITECTURE.md` Part E Task 22.

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

**Conditional Planning (Task 7):** See **`docs/PLANNER_PROCESS.md`** (Conditional Planning).

**Hierarchical Planning (Task 8):** See **`docs/PLANNER_PROCESS.md`** (Hierarchical Planning).


**New LLMActionTypes added to token-usage-log:**
- CRITIC, MULTI_SOURCE_SYNTHESIS, DYNAMIC_INTERRUPT, SKILLS_RETRIEVAL, CONTINGENCY_CHECK, HIERARCHICAL_PLANNING

**Test Summary:** 40 tests passing (21 DOM similarity + 9 critic + 10 dynamic interrupt)

**References:** `THIN_CLIENT_ROADMAP.md` (roadmap format and best practices), `ARCHITECTURE.md` Part E (server-side task breakdown), `ARCHITECTURE.md` §4.9.3.

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

**References:** `INTERACT_FLOW_WALKTHROUGH.md` § Batch & Adapt Task 1, `ARCHITECTURE.md` Part E Task 19.

---

### 3. Look-Ahead Validation (Goal-Oriented Verification)

**Current:** Verification (Step 3.3) looks *backwards*: “Did the last action work?” It checks *mechanics* (e.g. URL changed), not *progress* toward the goal.

**Improvement:** **Goal-oriented verification.** When generating Action N, predict the **state requirement for Action N+1** (e.g. “I expect to see ‘Submit’ or ‘Step 2 of 3’”). Verification checks that this requirement is met; if not, fail early.

**Deliverable:** Aligns with **Batch & Adapt Task 4**.

- **Server:** Outcome/action step produces `nextGoalDescription` / `nextGoalSelector`. Verification validates (1) previous outcome, (2) next-goal availability.
- **Example:** Action N = “Click Next”; requirement for N+1 = “Submit button or ‘Step 2 of 3’ visible.”

**Definition of Done:** See **Batch & Adapt Task 4**.

**References:** `INTERACT_FLOW_WALKTHROUGH.md` § Batch & Adapt Task 4, `ARCHITECTURE.md` Part E Task 22.

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

Planner produces main path + contingencies; verification failure triggers contingency check before Correction LLM. **Full spec and DoD:** **`docs/PLANNER_PROCESS.md`** (Conditional Planning).


### 8. Hierarchical Manager–Worker Planning — *Hardest*

Complex tasks decomposed into sub-tasks with input/output contract; context reset between sub-tasks. **Full spec and DoD:** **`docs/PLANNER_PROCESS.md`** (Hierarchical Planning).


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

**References:** `THIN_CLIENT_ROADMAP.md` (roadmap format), `ARCHITECTURE.md` §4.9.3, Batch & Adapt section above.

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

**RAG Freshness (Conflicting Truth Prevention):**

When Phase 2 chunks are ingested, the same UI area may have changed (e.g. Phase 1: "Status: Pending", Phase 2: "Status: Approved"). Both chunks can exist in the vector DB; at query time RAG may retrieve conflicting chunks and confuse the LLM.

**Logical fix: Visual Area Invalidation / Freshness Bias**

1. **At ingestion (Phase 2):** When ingesting post-interaction chunks, detect spatial or semantic overlap with Phase 1 chunks (e.g. same main content container, same selector scope). For overlapping Phase 1 chunks: **soft-delete** (mark as superseded) or **down-rank** (metadata flag `supersededBy: chunkId`).
2. **At retrieval:** Prefer "fresh" chunks over "stale": in the RAG sort/score step, apply a **freshness bias** (e.g. prefer `phase: "post-interaction"` over `phase: "initial"` when both match the query; or exclude soft-deleted chunks from results).
3. **Implementation options:** (a) Store `phase` and `ingestedAt` on chunks; at query time filter or boost by freshness. (b) When storing Phase 2 chunks, write a pass that finds Phase 1 chunks from the same URL/container and sets `supersededBy` or status; retrieval excludes superseded chunks.

See knowledge extraction pipeline and RAG resolve/query for where to wire this. **Status:** Spec only; implementation is in the knowledge/RAG layer.

---

### C. Pre-launch: No Feature Flags

Pre-launch, all agent features are always on (LangGraph, complexity routing, critic, skills, conditional/hierarchical planning, action chaining, replanning, etc.). Feature flags will be introduced after launch for safe rollout and rollback.

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
2. **Hourly:** Latency distribution, token usage
3. **Daily:** Skills created/used, re-planning frequency, classification accuracy
4. **Weekly:** Cost trends, success rate trends, feature effectiveness

---

### E. Testing Requirements

**Each feature MUST have:**

| Test Type | Coverage | Notes |
|-----------|----------|-------|
| **Unit Tests** | Core algorithms (DOM similarity, time-decay ranking, complexity classification) | Vitest |
| **Integration Tests** | LangGraph nodes, LangFuse integration, skill retrieval | Vitest + mocks |
| **E2E Tests** | Full interact flow | Playwright |
| **Load Tests** | Throughput under expected load (100 req/min) | k6 or similar |

**Test Scenarios for Action Chaining:**

```typescript
describe("Action Chaining", () => {
  it("should chain 5 form fields into single response", async () => { /* ... */ })
  it("should report partial failure at index N", async () => { /* ... */ })
  it("should recover from partial failure and continue", async () => { /* ... */ })
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
| **LangFuse down** | No traces in UI | Verify LangFuse keys are set; check API key; LangFuse continues to DB |
| **Action chain failures** | > 40% partial failures | Reduce chain size; tighten safety criteria; review DOM similarity |

**Deployment Checklist:**

- [ ] LangFuse API key configured (optional; set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY for tracing)
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
| **P1** | DOM Similarity Algorithm | ✅ **DONE** | Low | Medium | None |
| **P1** | Dynamic Re-Planning | ✅ **DONE** | Medium | Medium | DOM Similarity ✅ |
| **P2** | Skills Library (with limits) | ✅ **DONE** | High | High | Foundation complete |
| **P2** | Two-Phase SPA Ingestion | 🔲 Planned | Medium | Medium | Knowledge migration |
| **P3** | Critic Loop | ✅ **DONE** | Low | Medium | None |
| **P3** | Conditional Planning | ✅ **DONE** | High | Medium | Planning engine ✅ |
| **P4** | Hierarchical Planning | ✅ **DONE** | Very High | Medium | All above ✅ |

**Critical Path:** ~~LangGraph~~ → ~~LangFuse~~ → ~~Cost Tracking~~ → ~~Action Chaining~~ → ~~Skills Library~~ → ✅ Phase 4 Complete

### Deferred: Visual / Non-DOM Features (End of Roadmap)

**Focus:** We are **DOM-based only** for now. The following are **visual/non-DOM** and moved to the **end of the roadmap**.

| Item | Status | Notes |
|------|--------|-------|
| **PDF OCR/visual parsing** (Marker-style layout/OCR) | 🔲 Deferred | Use text-only or Gotenberg → HTML (DOM-based) for PDFs; OCR/vision-based extraction out of scope for now |
| **Screenshot-based verification** | 🔲 Deferred | Verification is DOM-based only (DOM snapshot, URL, semantic skeleton); no image/screenshot comparison |
| **Vision/image-based planning or action** | 🔲 Deferred | Planning and actions use DOM (element IDs, structure); no vision-model inputs |

---

## References

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | System architecture, intelligence layer, implementation roadmap summary, database, tenancy |
| `THIN_CLIENT_ROADMAP.md` | Client implementation tasks and format reference |
| `app/api/agent/interact/route.ts` | Current implementation |
| `lib/agent/*.ts` | Agent engine implementations |
