# Verification Process: Step-by-Step Walkthrough

**Purpose:** Explain how the verification system determines whether an action succeeded after the Chrome extension executes it. This document is the **canonical** flow description and **implementation roadmap** for the verification process. **Many errors originate here** — keep this doc in sync with code and use it as the single source of truth.

**Example flow:** Extension executes `click(169)` → sends updated DOM/URL → backend verifies if the click achieved its goal → if **goalAchieved** is true, task completes with `finish()` (no word-based parsing).

**Focus:** Verification is **DOM-based only** (DOM snapshot, URL, optional semantic skeleton). Screenshot-, vision-, or image-based verification is **out of scope** for now.

---

## Critical: Deterministic Task Complete (goalAchieved)

**Do not** decide "task complete" by parsing the verification **reason** text (e.g. looking for "successful", "completed", "aligns with the user's goal"). Wording changes break routing.

**Contract:**

1. **Semantic LLM** returns JSON only, via **structured output** (Gemini `responseMimeType: "application/json"` + `responseJsonSchema`). Schema: `action_succeeded`, `task_completed`, `confidence`, `reason`, optional `sub_task_completed`. No free text or markdown — the model cannot return thought+answer mix, so parsing is a single `JSON.parse(response.text)`. **`match`** (for backward compat) = task_completed; **`task_completed`** = true **only** when the user's goal was achieved. **`reason`** is for logs and UI only; routing must **not** depend on its wording. See `lib/llm/response-schemas.ts` (VERIFICATION_RESPONSE_SCHEMA) and `docs/GEMINI_USAGE.md` § Structured outputs.

2. **Verification engine** sets **`goalAchieved`** on the result (Task 2: low-confidence completion band):
   - `goalAchieved = task_completed && confidence >= 0.70` (via `computeGoalAchieved()`). When goalAchieved is true and confidence < 0.85 we log "Low confidence completion" for observability; routing is unchanged (goal_achieved → finish).
   - So: LLM said **task_completed = true** and confidence ≥ 0.70 → goalAchieved = true (single finish); confidence in [0.70, 0.85) is logged as low-confidence completion.

3. **Graph router** uses **only** `verificationResult.goalAchieved === true` to route to **goal_achieved** (task complete). No parsing of `reason`.

**Files:** `lib/agent/verification-engine.ts` (sets goalAchieved), `lib/agent/verification/semantic-verification.ts` (LLM contract), `lib/agent/graph/nodes/verification.ts` (router checks goalAchieved only), `lib/agent/graph/nodes/goal-achieved.ts` (sets actionResult to finish()).

**Grounding with Google Search:** Semantic verification LLM calls use **Grounding with Google Search** (`useGoogleSearchGrounding: true`) so the model can cite current facts when judging whether an action succeeded. For explicit web-search flows (e.g. from context analysis), **Tavily** is used when domain-specific search is needed or when confidence from Google Search grounding is lower. See [Gemini Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search) and `docs/GEMINI_USAGE.md` § Grounding with Google Search vs Tavily.

**Thinking:** Semantic verification uses **thinking level high** (`thinkingLevel: "high"`) so the model can reason through step-level vs task-level and multi-step goals. See `docs/GEMINI_USAGE.md` § Thinking.

**Other deterministic patterns (do not parse reason text for routing):**

- **Replanning:** Router uses **only** `replanningResult.planRegenerated === true` to route to planning after a regenerated plan (not `reason.includes("regenerated")`). Modify vs regenerate uses **only** `validationResult.minorModificationsOnly === true` (set when building PlanValidationResult from suggestedChanges); no parsing of change text in `determineReplanAction`. See `lib/agent/replanning-engine.ts` (PlanValidationResult.minorModificationsOnly, determineReplanAction).
- **Semantic verification fallback:** With structured output, the model returns valid JSON only; if parse still fails (e.g. API error), we default to `match: false` so we never treat a malformed response as goal achieved. See `lib/agent/verification/semantic-verification.ts` (catch block).
- **Critic approval:** Approved is set **only** from `<Approved>YES</Approved>` or `<Approved>NO</Approved>` (regex capture). No fallback to free-text (e.g. "APPROVED>YES"). See `lib/agent/critic-engine.ts` (parseCriticResponse).
- **Goal_achieved display:** Description for expectedOutcome uses **semanticSummary** (set by engine from semantic verdict); do not parse `reason` (e.g. "Semantic verdict: ...") for display. See `lib/agent/verification/types.ts` (semanticSummary), `lib/agent/graph/nodes/goal-achieved.ts`.

---

## Production Readiness Status

| Component | Status | Phase | Notes |
|-----------|--------|-------|-------|
| **Verification Engine** | ✅ Implemented | — | `lib/agent/verification-engine.ts` (and `lib/agent/verification/`) |
| **Outcome Prediction** | ✅ Implemented | — | Used for expectedOutcome/correction; verification does not use it |
| **Action Type Classifier** | ✅ Implemented | — | `lib/agent/action-type.ts` (for outcome prediction templates) |
| **DOM Helpers** | ✅ Implemented | — | `lib/utils/dom-helpers.ts` |
| **Verification Node** | ✅ Implemented | — | `lib/agent/graph/nodes/verification.ts` |
| **Correction Node** | ✅ Implemented | — | `lib/agent/graph/nodes/correction.ts` |
| **URL Tracking (urlAtAction)** | ✅ Implemented | 2.0 | Stores URL when action generated |
| **Smart DOM Context** | ✅ Implemented | 2.0 | 8000-char windowing for LLM |
| **Action Type Templates** | ✅ Implemented | 2.1 | Fixed templates for navigation/dropdown |
| **Client Verification Schema** | ✅ Implemented | 2.1 | `clientVerification` in request body |
| **Observation-Based Verification** | ✅ Implemented | 3.0 | DOM diff + observation list + semantic verdict |
| **beforeState on TaskAction** | ✅ Implemented | 3.0 | URL + domHash (+ optional semanticSkeleton) when action generated |
| **clientObservations in request** | ✅ Implemented | 3.0 | Extension witnessed: didNetworkOccur, didDomMutate, didUrlChange |
| **goalAchieved (deterministic)** | ✅ Implemented | 3.0.2 | Set from LLM `match` + confidence; router uses only this (no reason parsing) |
| **goal_achieved node** | ✅ Implemented | 3.0.2 | When goalAchieved=true → sets actionResult=finish() → finalize → status completed |

**Legend:** ✅ = Complete | 🔄 = In Progress | 🔲 = Planned

**Critical Path:** ~~Verification Engine~~ → ~~URL Tracking~~ → ~~Action Type Templates~~ → ~~Observation-Based Verification (v3.0)~~

---

## Implementation Tasks (by priority)

Tasks below are ordered by importance (1 = highest). Same status legend: ✅ = Complete | 🔄 = In Progress | 🔲 = Planned.

| Priority | Task | Status | Phase | Notes |
|----------|------|--------|-------|-------|
| **1** | **Split semantic verification: action_succeeded vs task_completed** | ✅ Complete | 3.0.4 | **action_succeeded** (did this action do something useful?) and **task_completed** (is the **entire** user goal done?). Router: goalAchieved = task_completed && confidence ≥ 0.70 (Task 2); goal_achieved when goalAchieved; success = action_succeeded && confidence ≥ 0.7 → next action; else → correction. **Files:** `lib/agent/verification/semantic-verification.ts`, `lib/agent/verification-engine.ts`, `lib/agent/graph/nodes/verification.ts`, `lib/agent/verification/types.ts`, `lib/agent/graph/types.ts`. |
| **2** | **Low-confidence completion handling** | ✅ Complete | 3.0.4 | When task_completed === true and confidence in [0.70, 0.85): set goalAchieved = true (single finish) and log "Low confidence completion". Implemented via `computeGoalAchieved()`; threshold 0.70 for goal achieved, log when confidence < 0.85. **Files:** `lib/agent/verification-engine.ts`, `lib/agent/__tests__/verification-engine.test.ts`. |
| **3** | **State drift: skeleton-primary diff, client witness override** | ✅ Complete | 3.0.4 | **Skeleton-primary:** `buildObservationList` returns `meaningfulContentChange` (true only when skeleton diff had items or, without skeleton, domHash changed). When skeleton diff empty but hash changed → no meaningful change (avoid false positive from tickers). **Client witness override:** `clientSawSomething` includes `didUrlChange`; when extension reports change we proceed with LLM even if server sees no change; log "Client witness override". **Files:** `lib/agent/verification/observation-builder.ts`, `lib/agent/verification-engine.ts`, `lib/agent/verification/__tests__/observation-builder.test.ts`. |
| **4** | **Explicit step-level vs task-level in prompt** | ✅ Complete | 3.0.4 | Semantic verification prompts (full-DOM and observation) now include explicit "Step-level vs task-level (Task 4)" block: task_completed = true ONLY when entire user request is done; for multi-step tasks set task_completed = false until final step. Example: "Add a patient named Jas" → form open = action_succeeded true, task_completed false. **Files:** `lib/agent/verification/semantic-verification.ts` (STEP_TASK_LEVEL_CONTRACT, STEP_TASK_LEVEL_EXAMPLE), `lib/agent/__tests__/semantic-verification.test.ts`. |
| **5** | **Sub-task-level verification (when hierarchical in graph)** | ✅ Complete | 4.x | When hierarchicalPlan is present: verification engine accepts optional **subTaskObjective** (current sub-task objective); semantic verification returns **sub_task_completed**; verification node advances sub-task (completeSubTask) when sub_task_completed && confidence ≥ 0.7, fails sub-task when sub_task_completed === false && !success; goalAchieved when all sub-tasks complete (isHierarchicalPlanComplete). **Files:** `lib/agent/verification/types.ts` (sub_task_completed), `lib/agent/verification/semantic-verification.ts`, `lib/agent/verification-engine.ts`, `lib/agent/graph/nodes/verification.ts`, `lib/agent/hierarchical-planning.ts`. |
| **6** | **Extension beforeDomHash (optional)** | 🔲 Planned | 3.x | Extension captures domHash (or skeleton) **immediately before** executing the action and sends in request; server compares client-before vs client-after to reduce state drift from tickers/ads. Protocol/extension change. **Files:** API schema, extension, verification engine (optional beforeDomHash in request). |
| **7** | **Planner / step_refinement: pass verification outcome into context (optional)** | ✅ Complete | 3.0.4 | Pass `action_succeeded` and `task_completed` into planning and step_refinement so the prompt can say "Previous action succeeded; full goal not yet achieved." **Files:** `lib/agent/verification/types.ts` (VerificationSummary), `lib/agent/planning-engine.ts` (PlanningContext.verificationSummary), `lib/agent/step-refinement-engine.ts` (verificationSummary param), `lib/agent/graph/nodes/step-refinement.ts` (pass from state.verificationResult), `lib/agent/graph/nodes/replanning.ts` (pass verificationSummary to generatePlan). |

**Progress (Verification + Planner):** Task 7 implemented. `VerificationSummary` type added; step-refinement and planning engines accept it and inject the continuation sentence into the LLM prompt when `action_succeeded === true` and `task_completed === false`. Step-refinement and replanning nodes pass summary from `state.verificationResult`. Tests: `lib/agent/__tests__/step-refinement-engine.test.ts`, `lib/agent/__tests__/planning-engine.test.ts`. See PLANNER_PROCESS.md Changelog.
**Progress (Task 9 — Sub-task-level verification):** When hierarchicalPlan is present, verification node passes current sub-task objective (subTaskObjective) to verifyActionWithObservations. Semantic verification prompt and parser support sub_task_completed; engine returns sub_task_completed when subTaskObjective was provided. Verification node advances sub-task (completeSubTask with success: true) when sub_task_completed && confidence ≥ 0.7, fails sub-task (completeSubTask with success: false) when sub_task_completed === false && !success; goalAchieved set when all sub-tasks complete (isHierarchicalPlanComplete). Files: verification/types.ts, semantic-verification.ts, verification-engine.ts, graph/nodes/verification.ts.

---

## Unified Task Order (Verification + Planner)

Verification and planner are **dependent**: verification produces outcomes that the planner consumes, and (later) planner hierarchical state requires sub-task-level verification. Use this **single ordered sequence** so both flows stay in sync.

| Order | Flow | Task | Depends on | Notes |
|-------|------|------|------------|-------|
| **1** | Verification | Split semantic: **action_succeeded** vs **task_completed** | — | **Do first.** Establishes the contract (action_succeeded, task_completed) that the planner will consume. Router: goalAchieved = task_completed && confidence ≥ 0.70 (Task 2) → goal_achieved; action_succeeded → next action; else → correction. |
| **2** | Verification | Low-confidence completion handling | 1 | ✅ Complete. goalAchieved = task_completed && confidence ≥ 0.70; log "Low confidence completion" when confidence < 0.85. |
| **3** | Verification | State drift: skeleton-primary diff, client witness override | — | ✅ Complete. meaningfulContentChange from buildObservationList; client witness (didDomMutate, didUrlChange) overrides; log "Client witness override" when proceeding only due to extension. |
| **4** | Verification | Explicit step-level vs task-level in prompt | 1 | ✅ Complete. Prompts include STEP_TASK_LEVEL_CONTRACT and STEP_TASK_LEVEL_EXAMPLE ("Add a patient" multi-step example). |
| **5** | Verification + Planner | **Pass verification outcome into planning / step_refinement** | 1 | **Verification Task 7 + Planner Task 1** — do together. Pass action_succeeded and task_completed (or goalAchieved) into planning/step_refinement so the next step prompt has "Previous action succeeded; full goal not yet achieved." |
| **6** | Planner | **Optional verification summary in plan context** | 5 | ✅ Complete. Planner Task 3. VerificationSummary in generatePlan/refineStep context; continuation sentence when action_succeeded && !task_completed. See PLANNER_PROCESS.md § Optional verification summary (Task 6). |
| **7** | Verification | Extension beforeDomHash (optional) | — | Verification Task 6; protocol/extension change. Independent of 1–6. |
| **8** | Planner | **Wire hierarchical planning into interact graph** | — | ✅ Complete. hierarchicalPlan in graph state; planning node calls decomposePlan; persisted with task. |
| **9** | Verification | **Sub-task-level verification** (when hierarchical in graph) | 8 | ✅ Complete. subTaskObjective passed to verification; sub_task_completed returned; verification node advances/fails sub-task; goalAchieved when all sub-tasks complete. |

**Summary:** Do **Verification 1 → 2, 3, 4** (verification contract and robustness), then **5 + 6** (wire verification outcome to planner), then **7** (optional extension), then **8 → 9** (hierarchical: planner first, then verification sub-task support). See **PLANNER_PROCESS.md** § Unified Task Order for the same table and planner-side details.

---

## High-Level Loop

Verification is **observation-based only**. The client sends DOM on every call; we save **beforeState** (url, domHash, and optionally semanticSkeleton) when we generate an action. On the next request we compare that state to the current state and ask the LLM if the observed changes match the user's goal.

1. **Extension** executes action (e.g., `click(169)`) on the page.
2. **Extension** captures new state: DOM snapshot, current URL. **(DOM on every call is required.)**
3. **Extension** sends `POST /api/agent/interact` with `{ dom, url, taskId }` (and optionally `clientObservations`).
4. **Backend** loads task context: previous action and **beforeState** (url, domHash, optional semanticSkeleton from when that action was generated).
5. **Verification Engine** compares beforeState vs current (url, domHash, and when available semantic skeleton), builds an **observation list**, then asks the LLM for a **semantic verdict** (on observations only — no full DOM).
6. **Router** decides based on result:
   - **goalAchieved === true** (set by engine when LLM `task_completed` === true && confidence ≥ 0.70; when confidence < 0.85 we log "Low confidence completion") → Route to **goal_achieved** node → sets `actionResult = finish()` → **finalize** → status **completed** (task ends; no more actions).
   - **success === true** (action_succeeded && confidence ≥ 0.7) but goalAchieved !== true → Generate next action (planning → step_refinement / action_generation).
   - Else (action failed or low confidence) → Route to correction node.

### Sequence Flow (DOM-based)

```
Extension                      Server                       Verification Engine
    │                            │                                  │
    │  1. Execute click(169)     │                                  │
    │──────────────────────────▶ │                                  │
    │                            │                                  │
    │  2. POST /interact          │                                  │
    │     { dom, url, taskId }   │  (DOM required on every call)    │
    │──────────────────────────▶ │                                  │
    │                            │  3. Load: lastAction=click(169)  │
    │                            │     Load: lastActionBeforeState  │
    │                            │       { url, domHash [, semanticSkeleton ] }
    │                            │                                  │
    │                            │  4. verifyActionWithObservations │
    │                            │──────────────────────────────────▶
    │                            │     Compare beforeState vs now   │
    │                            │     Build observation list       │
    │                            │     LLM verdict on observations  │
    │                            │                                  │
    │                            │ ◀──────────────────────────────────
    │                            │    { success, action_succeeded, task_completed, goalAchieved }
    │                            │    (goalAchieved = task_completed && confidence≥0.70; log "Low confidence completion" when confidence < 0.85; success = action_succeeded && confidence≥0.7)
    │                            │                                  │
    │                            │  5. Route: goal_achieved (if goalAchieved) else
    │                            │     next action or correct
    │ ◀──────────────────────────│
    │    { action, thought }     │
```

---

## Multi-Action Task: Full Flow with Database Objects

Example: user goal **"Go to overview, then open the Settings tab"** — two actions in sequence. The client sends **DOM on every call**; the server saves **beforeState** when it generates each action, then verifies using observation-based comparison on the **next** request. **For N-step tasks we verify after every step;** see [Multi-Step Tasks: Verify Every Step](#multi-step-tasks-verify-every-step).

### Request 1 — New task (no taskId)

**Client sends:** `url`, `query`, `dom` (no `taskId`).

**Server logic:**
- Create **Task** and **TaskAction** (step 0).
- Generate first action: e.g. `click(169)` ("Overview" link).
- Save **beforeState** from current request: `url`, `domHash`, and when available `semanticSkeleton` from `extractSemanticSkeleton(dom)`.

**Database after Request 1:** Task with status `executing`; TaskAction step 0 with `action`, `urlAtAction`, `beforeState: { url, domHash [, semanticSkeleton ] }`.

**Server responds:** `{ taskId, action, thought }`.

---

### Request 2 — After first action (client executed click(169))

**Client sends:** `url`, `query`, `dom`, `taskId` (and optionally `clientObservations`).

**Server logic:**
- Load task context: `lastAction`, `lastActionBeforeState` (url, domHash [, semanticSkeleton ]).
- **Verification:** Compare beforeState vs current:
  - URL changed? → observation: "Navigation occurred" or "URL did not change".
  - Page content: if `beforeState.semanticSkeleton` and current DOM exist → build current skeleton, diff with microdiff → **granular observations** (e.g. "Element 'X' changed 'text' from 'Save' to 'Saved'"). Else → compare domHash → "Page content updated" or "Page content did not change".
  - Integrate `clientObservations` (network, DOM mutate, URL change). Task 3: **no change at all** = URL same, no meaningful content change (skeleton-primary; skeleton diff empty but hash changed does not count), and no client witness (didNetworkOccur, didDomMutate, didUrlChange). If no change → fail without LLM; client witness overrides (proceed with LLM when extension reports change).
  - Else → LLM semantic verdict on observation list only → success if confidence ≥ 0.70.
  - **goalAchieved** = task_completed && confidence ≥ 0.70 (Task 2: low-confidence band); when confidence < 0.85 we log "Low confidence completion". Set on VerificationResult via `computeGoalAchieved()`; router uses **only** goalAchieved (no parsing of reason text).
- **If goalAchieved === true:** Route to **goal_achieved** → set actionResult to `finish()` → finalize → status **completed** (task ends).
- **Else:** Generate next action (e.g. "Settings" tab) and save new TaskAction with new beforeState.

**Server responds:** `{ taskId, action, thought }` or finish if task complete (goalAchieved was true).

---

### Request 3 — After second action

Same pattern: load last action and beforeState, run observation-based verification, then either generate next action, finish, or correct.

---

## Multi-Step Tasks: Verify Every Step

**When the user gives a task that requires N steps** (e.g. "Go to overview, then open Settings, then change the theme"), the system **verifies after every step**, not only at the end.

### How It Works

| Aspect | Behavior |
|--------|----------|
| **Verification point** | After **every** action (every request that has a previous action). Request 1 → no verification (first action). Request 2 → verify step 1. Request 3 → verify step 2. … Request N+1 → verify step N. |
| **Scope per verification** | Each verification answers: (1) Did the **last action** succeed? (2) Is the **entire user goal** achieved? The same observation-based flow runs each time: beforeState vs current → observation list → semantic LLM → success, goalAchieved, reason. |
| **goalAchieved** | Set **only** when the LLM says the **whole** user request is done (e.g. after the last of N steps). After step 1 of 3, goalAchieved is typically **false** (task not complete); we continue to planning and generate step 2. After the final step, goalAchieved may be **true** → route to goal_achieved → finish(). |
| **Progress vs completion** | Today we use a single **match** for "goal achieved." To avoid premature finish (e.g. "form opened" being treated as "task done"), the prompt must define **match** strictly as **entire goal achieved**. Planned: split into **action_succeeded** (step worked) and **task_completed** (whole goal done) for clearer routing. See "Implementation Tasks" below. |

### Example: "Add a patient named Jas" (3 steps)

1. **Step 1:** Action = click("New Patient"). Verify: action succeeded (form appeared)? Yes. Entire goal (patient added)? No → goalAchieved = false → generate next action.
2. **Step 2:** Action = setValue(nameField, "Jas"). Verify: action succeeded? Yes. Entire goal? No → goalAchieved = false → next action.
3. **Step 3:** Action = click("Save"). Verify: action succeeded? Yes. Entire goal (patient added)? Yes → goalAchieved = true → goal_achieved → finish().

If verification fails at any step (e.g. form did not appear), the router sends the flow to **correction**, not to the next step.

### Summary

- **N steps ⇒ N verifications** (one after each action).
- **goalAchieved** is only true when the **full** user goal is satisfied; intermediate steps must not set goalAchieved.
- Implementation tasks below (action_succeeded vs task_completed, low-confidence handling, state drift) make this behavior robust and explicit.

### Planner and step refinement: when do they need to change?

| Scenario | Planner / step_refinement change? | Notes |
|----------|-----------------------------------|-------|
| **Verify every step (current flow)** | **No.** | Step advancement is done at **invocation**: `currentStepIndex = previousActions.length` when building graph input (`run-graph.ts`). Planning node reuses existing plan and current step; step_refinement refines `plan.steps[currentStepIndex]`. No change to planning engine or step_refinement engine required for N-step verify-every-step to work. |
| **Task 1: action_succeeded vs task_completed** | **Optional but recommended.** | Router and verification engine change; planner logic does not. To make the **next** step more reliable, pass verification outcome (e.g. `action_succeeded`, `task_completed` or `goalAchieved`) into **planning** or **step_refinement** context so the prompt can say: "Previous action succeeded; full goal not yet achieved — generate next step." Reduces risk of repeating the same step or emitting "we're done" too early. |
| **Task 5: Sub-task-level verification (hierarchical)** | **Yes.** | When hierarchical planning is in the graph, the planner (or hierarchical manager) must consume **sub_task_completed** and advance to the next sub-task (or fail the sub-task). So planner/manager changes are **required** for sub-task-level verification. |

---

### Summary: Chrome extension — required vs optional

**Required (verification works with only these):**

| Requirement | Purpose |
|-------------|---------|
| Send **dom** on every `POST /api/agent/interact` | Server has "after" state and can save **beforeState** for the next action. |
| Send **url** on every call | Current URL is part of before/after comparison. |
| Send **taskId** on every call after the first | Server loads last action and **beforeState** to run observation-based verification. |

Without DOM on every call, the server cannot save **beforeState** and cannot run observation-based verification.

**Optional (improve accuracy; no new extension code required for basic flow):**

| Optional field | Purpose |
|----------------|---------|
| **previousUrl** | URL before the action; server can infer from `beforeState.url` when present, so not strictly needed. |
| **clientObservations** | `{ didNetworkOccur?, didDomMutate?, didUrlChange? }` — e.g. after "Save", API call but no DOM change; helps avoid false "no change" failures. |
| **clientVerification** | `{ elementFound, selector?, urlChanged? }` from `document.querySelector(expectedSelector)` — much more accurate than server-side regex when sent. |

**Recommendation:** If the extension already sends **dom**, **url**, and **taskId** on every call, no further implementation is needed for verification to work. Adding **clientObservations** and **clientVerification** when feasible will improve accuracy.

### Client contract: why the same step can repeat

If the extension **does not send `taskId`** on the request that follows an executed action, the backend treats every request as a **new task**. That causes:

- Each request: "go to overview" with **no taskId** → backend returns the **first** step again (e.g. `click(169)`).
- The same message is effectively processed many times and the user sees "1 step processed" repeatedly.

**Required behavior:**

- **First request (new task):** Send `{ url, query, dom, sessionId? }` — no `taskId`.
- **After executing an action:** Send the **next** request with **`taskId`** from the previous response (required for continuation), **updated `dom`** (and `url` if it changed), and **`sessionId`** unchanged. Optionally the same `query` or omit it; the backend will verify and return the next step or `finish()`.

If the extension stores the response's `taskId` and sends it (with updated dom) on the next call, the loop advances: verification → next action or completion — and the same step will not repeat.

**taskId persistence (critical):**

The extension **must** persist `taskId` in `chrome.storage.local` (keyed by tabId), **not** in memory. Memory storage is lost on page refresh or extension restart, causing the "Lost Task" loop. If `chrome.storage.local` fails, use the server-side recovery endpoint as a fallback:

```
GET /api/session/{sessionId}/task/active?url={currentTabUrl}
```

Returns the most recent active task for the session (or 404 if none — start fresh).

**See:** `INTERACT_FLOW_WALKTHROUGH.md` § Client Contract: State Persistence & Stability for full implementation guidance including code examples.

**Troubleshooting: same step repeats even when client sends taskId**

The backend persists each returned action as a **TaskAction** so the next request can load `previousActions` and route to **verification** (not direct_action). If the same step keeps repeating with `hasTaskId: true` in logs, check:

1. **After first request:** `[RouteIntegration] saveGraphResults: creating TaskAction taskId=..., stepIndex=0, action=click(169)` — confirms the action was persisted. If `TaskAction.create` failed, inspect the error (e.g. validation, duplicate key).
2. **On follow-up request:** `[RouteIntegration] loadTaskContext: taskId=..., previousActions.length=1, hasLastAction=true, lastAction=click(169)` — confirms the task had one previous action and `lastAction` is set. If `previousActions.length=0` or `hasLastAction=false`, the follow-up is not seeing the persisted action (wrong `taskId`, wrong tenant, or TaskAction not created).
3. **Router:** `[Graph:router] Routing to verification (existing task)` — confirms the graph is going to verification. If you still see `Routing to direct_action (SIMPLE task)` on the follow-up, the state had `previousActions.length === 0` (see step 2).

Ensure the client sends the **exact `taskId`** from the previous response (`data.taskId`) and that the same tenant/user is used.

---

## Verification Logic (No Raw Code)

### Step 1 — Extension Executes Action

The extension runs the action returned by the previous request (e.g. `click(169)`).

### Step 2 — Extension Captures New State (with Stability Wait)

**Critical:** The extension must wait for **DOM stability** before capturing the snapshot. Capturing immediately after action execution (e.g., `click(Save)`) often captures a transitional state (spinner, unchanged DOM) causing false verification failures.

**Stability Wait requirement:**

1. Execute the action (e.g., `click(Save)`)
2. **Wait for stability:**
   - Network idle: no pending fetch/XHR for 500ms
   - DOM settled: no MutationObserver events for 300ms
   - Minimum wait: always wait at least 500ms
   - Maximum wait: 5000ms timeout
3. **Then** capture: DOM snapshot (`document.documentElement.outerHTML`), current URL, and optionally previous URL and **clientObservations** (didNetworkOccur, didDomMutate, didUrlChange).

**See:** `INTERACT_FLOW_WALKTHROUGH.md` § Client Contract: State Persistence & Stability for full implementation guidance including code examples.

### Step 3 — Extension Sends Request

`POST /api/agent/interact` with at least: `url`, `dom`, `query`, `taskId`. Optional: `previousUrl`, `clientObservations`.

### Step 4 — Server Loads Task Context

**Where:** `lib/agent/graph/route-integration` (context loading).

**Logic:**
- Load Task by `taskId` and `tenantId`.
- If `sessionId` present: load Messages and TaskActions; previous actions come from TaskActions when taskId is set, else from Messages.
- Load **last** TaskAction (by stepIndex descending) to get `lastAction` and `lastActionBeforeState`.
- beforeState shape: `{ url, domHash, activeElement?, semanticSkeleton? }`.
- Count correction attempts for current step; read consecutiveFailures from Task.

If `lastAction` exists but `beforeState` is missing (e.g. migration), verification is skipped and the flow continues (log warning).

---

## Step 5 — Run Verification (Observation-Based Only)

**Where:** Verification node → `verifyActionWithObservations` in verification engine.

**Inputs:** beforeState (url, domHash, optional semanticSkeleton), currentDom, currentUrl, action, userGoal, clientObservations, context.

**Logic:**

1. **Compute after state:** `afterDomHash = computeDomHash(currentDom)`.
2. **Build observation list:** `buildObservationList(...)` returns `{ observations, meaningfulContentChange }` (Task 3: state drift).
   - **URL:** If beforeState.url ≠ currentUrl → "Navigation occurred: URL changed from … to …". Else → "URL did not change".
   - **Page content (skeleton-primary):**
     - If `beforeState.semanticSkeleton` and `currentDom` are both present:
       - Extract current skeleton from currentDom (`extractSemanticSkeleton`).
       - Diff before vs current skeleton with microdiff (`getGranularObservation`).
       - If diff returns items → add those as observations; **meaningfulContentChange = true**.
       - If diff is empty but domHash changed → "Page content updated (DOM changed; no interactive element changes detected)"; **meaningfulContentChange = false** (Task 3: avoid false positive from tickers/ads).
       - If diff is empty and domHash same → "Page content did not change (no interactive element or alert changes)".
       - On any skeleton/diff error → fall back to hash-only; meaningfulContentChange = (domHash changed).
     - **Hash-only path:** If beforeState.domHash ≠ afterDomHash → "Page content updated (DOM changed)", meaningfulContentChange = true. Else → "Page content did not change (DOM hash identical)".
   - **Focus:** If activeElement changed, add observation.
   - **Client witness:** If clientObservations.didNetworkOccur → add "Background network activity detected"; if didDomMutate → "DOM was mutated"; if didUrlChange defined → "Extension reported URL changed: true/false".
3. **No change at all (Task 3):** somethingChanged = urlChanged OR meaningfulContentChange OR clientSawSomething, where clientSawSomething = didNetworkOccur OR didDomMutate OR didUrlChange. If **!somethingChanged** → **return failure without calling the LLM** (confidence 0.2, reason includes observation list). Do **not** set goalAchieved. When clientSawSomething is true but !urlChanged && !meaningfulContentChange, log "Client witness override: proceeding with LLM (extension reported change)".
4. **Semantic verdict:** Call LLM with **only** user goal, action, and observation list (no full DOM). LLM returns **match** (boolean), confidence, reason. **Contract (see Semantic Verification LLM below):** `match` = true only when the user's goal was achieved; the system uses `match` deterministically — do not rely on wording in `reason`.
5. **Result:** success = (confidence ≥ 0.70). Set **goalAchieved** via `computeGoalAchieved(task_completed, confidence)`: goalAchieved = task_completed && confidence ≥ 0.70; when goalAchieved && confidence < 0.85 log "Low confidence completion". Return VerificationResult with success, confidence, reason, comparison.semanticMatch, and **goalAchieved**.
6. **Graph router (verification node):** Uses **only** `verificationResult.goalAchieved === true` to route to **goal_achieved**. No parsing of `reason` (no word-based signals). If goalAchieved → goal_achieved node → sets actionResult = { action: "finish()", thought: "..." } → finalize → status **completed**.

**Logging:** All verification logs use `logger.child({ process: "Verification", sessionId: context?.sessionId, taskId: context?.taskId ?? "" })` so every log line is attributable to a specific chat thread (sessionId) and message/task (taskId).

---

## Semantic Verification LLM Contract

**Where:** `lib/agent/verification/semantic-verification.ts` — `performSemanticVerificationOnObservations`.

**Input:** User goal, action executed, observation list (URL change, element appeared/disappeared, clientObservations, etc.). No full DOM.

**Output (JSON only):** `{ "match": true|false, "confidence": 0.0-1.0, "reason": "Brief explanation" }`.

**Contract (must be reflected in the prompt):**

- **`match`** (legacy) / **`task_completed`**: Set to **true** only when the **entire** user goal was achieved. Set to **false** for intermediate steps (Task 4: step-level vs task-level).
- **`action_succeeded`**: true when this action did something useful (e.g. form opened); false when nothing useful happened.
- The system uses **task_completed** and **action_succeeded** deterministically for routing. Do **not** rely on wording in **`reason`**.
- **`reason`**: User-friendly explanation for logs and UI only.

**Step-level vs task-level (Task 4):** The prompt explicitly states: task_completed = true ONLY when the entire user request is done; for multi-step tasks, set task_completed = false until the final step is done. Example in prompt: "Add a patient named Jas" → form open = action_succeeded true, task_completed false; final step (Save clicked, success) = action_succeeded true, task_completed true. Implemented via `STEP_TASK_LEVEL_CONTRACT` and `STEP_TASK_LEVEL_EXAMPLE` in `lib/agent/verification/semantic-verification.ts`.

**Guidelines in prompt:** URL changed + navigation goal → action_succeeded true; task_completed true only if that was the full goal. Page content updated but more steps needed → action_succeeded true, task_completed false. No changes → action_succeeded false, task_completed false. Be decisive; high confidence when observations clearly support success or failure.

---

## Semantic Skeleton Diff (Granular Observations)

**Where:** `lib/agent/observation/diff-engine.ts` (Cheerio + microdiff).

**Goal:** Move from binary "something changed / nothing changed" (hash) to **what** changed, so the LLM can judge success accurately (e.g. "Save" → "Saved", new toast "Successfully updated").

**Logic (high level):**

1. **Extract semantic skeleton from HTML**
   - Parse HTML with Cheerio.
   - **Interactive elements:** For each `button`, `a`, `input`, `select`, `textarea`, and elements with `role="button"`, `role="link"`, `role="menuitem"`: key by id/name or index; store a small descriptor: tag, text (trimmed, first 50 chars), value, disabled, ariaExpanded, href, role.
   - **Alerts/messages:** For `[role="alert"]`, `.toast`, `.error`, `.success`, `.alert`, `[data-toast]`: key by index; store trimmed text.
   - Result: a JSON map (skeleton) of meaningful UI state.

2. **Diff before vs after skeleton**
   - Use microdiff(beforeSkeleton, afterSkeleton).
   - Map diff items to human-readable lines:
     - CREATE → "New element appeared: …" or "New message/alert appeared: …".
     - REMOVE → "Element disappeared: …".
     - CHANGE → "Element 'id' changed 'attribute' from 'oldValue' to 'newValue'".

3. **When used**
   - When saving an action: we optionally call `extractSemanticSkeleton(dom)` and store in `beforeState.semanticSkeleton`. On extraction error we keep only url + domHash.
   - When verifying: if `beforeState.semanticSkeleton` and currentDom exist, we use the diff result as the "page content" observations; otherwise we use hash-only.

**Benefits:** Fewer false positives (timers/ads change hash but not skeleton); LLM sees concrete changes (e.g. button text, new alert) instead of "Page content updated".

---

## DOM-Based Checks (Supporting Paths)

**Where:** `lib/utils/dom-helpers.ts`. Used by the **prediction-based** verification path (`verifyAction`), not the observation-based path.

| Check | Purpose |
|-------|---------|
| Element exists | Regex-based: id, class, data-testid, or text. |
| Element NOT exists | Inverse of above. |
| Element has text | Find element, check text content. |
| URL changed | Compare path + query (significant change). |
| Aria expanded | Check aria-expanded="true". |
| Roles exist | Check for role="menuitem", etc. |

---

## Confidence Calculation (Prediction-Based Path)

Used when we run `verifyAction` (expectedOutcome + DOM checks + full-DOM semantic verification), e.g. for correction or legacy paths. **Not** used for observation-based verification, which uses the LLM confidence directly.

**Weights / rules (conceptual):**
- Client verification (element found) → strong positive (e.g. +40%); element not found → cap confidence at 60%.
- Expected element not found in DOM → cap 60% (except when URL changed as expected for navigation).
- DOM check score → average of element/URL/attribute/elementsAppeared checks.
- URL changed as expected → boost (e.g. 75% minimum for navigation).
- Semantic confidence > 0.85 → allow LLM to override DOM failures (still respect cap).
- Default: weighted mix of DOM score and semantic confidence; then apply cap.

Success threshold: confidence ≥ 0.70.

---

## Action Type Classification

**Where:** `lib/agent/action-type.ts`. Used for outcome prediction templates and for prediction-based verification.

**Logic (short):**
- `navigate()` or `goBack()` → navigation.
- `click(id)` → resolve element in DOM: if `aria-haspopup` → dropdown; if `<a>`, `href`, or `role="link"` → navigation; else generic.
- Otherwise → generic.

Navigation/dropdown use **fixed** expected-outcome templates (no LLM prediction for what should appear). Generic uses LLM outcome prediction (can be wrong on selectors).

---

## Outcome Prediction

**Where:** `lib/agent/outcome-prediction-engine.ts`. Used for **correction** and logging, **not** for observation-based verification.

When we generate an action, we optionally predict expected outcome (description + domChanges). For dropdown/navigation we use fixed templates; for generic we use LLM. LLM often guesses wrong selectors; that's why verification is observation-based (compare before/after state, not prediction vs DOM).

---

## Correction Loop

**Where:** `lib/agent/graph/nodes/correction.ts`.

When observation-based verification fails (confidence < 70%), the correction node gets the failure reason and DOM and suggests a recovery strategy (e.g. RETRY_WITH_DELAY, ALTERNATIVE_SELECTOR, SCROLL_INTO_VIEW, REFRESH_PAGE, FAIL after max retries). Strategy is converted to a retry action (e.g. `wait(0.5)`, new selector, `fail()`).

---

## Data Structures (Logical)

- **beforeState (TaskAction):** `{ url, domHash, activeElement?, semanticSkeleton? }`. Captured when the action is generated. Verification compares this to current url/dom/skeleton.
- **VerificationResult (engine):** success (confidence ≥ 0.70), confidence, reason, expectedState, actualState, comparison (domChecks, semanticMatch, overallMatch, nextGoalCheck), **goalAchieved**, **semanticSummary**. **goalAchieved** = task_completed && confidence ≥ 0.70 (Task 2: low-confidence band); when confidence < 0.85 we log "Low confidence completion". **semanticSummary** = first 300 chars of semantic verdict reason (for display only). Set by engine only; graph uses goalAchieved only to route; goal_achieved node uses semanticSummary for description (no parsing of reason).
- **VerificationResult (graph state):** Same shape; goalAchieved and semanticSummary passed through from engine. Router checks **only** `verificationResult.goalAchieved === true`.
- **ClientObservations (request):** Optional `{ didNetworkOccur?, didDomMutate?, didUrlChange? }` from the extension. Task 3: all three are used for "something happened" (client witness override).
- **ObservationListResult (Task 3):** `buildObservationList` returns `{ observations: string[], meaningfulContentChange: boolean }`. meaningfulContentChange is true only when skeleton diff had items or (no skeleton) domHash changed; skeleton diff empty but hash changed → false (avoids ticker/ads false positive).
- **ExpectedOutcome:** Used for correction and prediction-based path; includes description, domChanges (elementShouldExist, urlShouldChange, attributeChanges, elementsToAppear), nextGoal.

---

## Goal_Achieved Node and Task Complete Flow

**Where:** `lib/agent/graph/nodes/goal-achieved.ts`, `lib/agent/graph/interact-graph.ts`.

**When:** Router sees `verificationResult.goalAchieved === true` after the verification node.

**What:** goal_achieved node sets:
- **actionResult** = `{ thought: "Task complete. ...", action: "finish()" }`.
- **expectedOutcome** = description from **verificationResult.semanticSummary** (set by engine); fallback to reason substring if semanticSummary missing. Do not parse reason text (e.g. "Semantic verdict: ...") for display.
- Then graph edges: goal_achieved → **finalize**. Finalize node sees actionResult.action.startsWith("finish(") and sets status to **completed**.

**Why:** Stops the "multiple time" loop: without this, after verification passed the graph always went to planning → action_generation and produced another click (e.g. click(169) again). With goalAchieved and the goal_achieved node, we complete the task once when the semantic LLM says task_completed=true with confidence ≥ 0.70 (Task 2: includes low-confidence band).

**Critical:** Do not replace this with word-based checks on reason (e.g. "successful", "completed"). Use only the **goalAchieved** flag set by the engine from the LLM's **task_completed** field.

---

## Common Errors and Pitfalls

1. **Parsing `reason` to decide task complete:** Do not scan for words like "successful", "completed", "aligns with the user's goal" in verificationResult.reason. Routing must use only **goalAchieved** (set from LLM **task_completed** and confidence) and **success** (set from **action_succeeded** and confidence).
2. **Relying on LLM wording in `reason`:** The prompt must state that **action_succeeded** and **task_completed** are the contract. If the prompt does not make this clear, the LLM might set task_completed=false but write "task completed" in reason — routing would then fail to complete the task.
3. **Missing goalAchieved on error path:** If verification throws, the catch block returns a synthetic success (e.g. confidence 0.5). Do **not** set goalAchieved in that path (leave undefined) so we don't complete the task on error.
4. **Skipping verification when beforeState is missing:** If lastAction exists but beforeState is missing, we skip verification and continue (log warning). In that case verificationResult is undefined; goalAchieved is not set; router goes to planning. Document this so future changes don't assume verificationResult is always present after verification node.
5. **Changing confidence threshold without doc:** goalAchieved uses confidence ≥ 0.70 (Task 2: low-confidence completion band); we log "Low confidence completion" when confidence < 0.85. If these thresholds are changed in code, update this doc and the "Configuration" section.
6. **Parsing critic or replanning text for routing:** Critic approval must come only from `<Approved>YES|NO</Approved>`. Replanning modify vs regenerate must use `minorModificationsOnly` only (set when building PlanValidationResult); do not re-parse suggestedChanges strings in determineReplanAction.
7. **Changing state-drift logic without doc (Task 3):** meaningfulContentChange and clientSawSomething (including didUrlChange) determine "something changed". If buildObservationList or verification-engine logic for skeleton-primary or client witness is changed, update this doc and Step 5.

---

## Configuration

- **Model:** Semantic verification uses the default Gemini model (`DEFAULT_PLANNING_MODEL`).
- **Grounding with Google Search:** Verification LLM calls use **Grounding with Google Search** (`useGoogleSearchGrounding: true`) so the model can cite current facts when judging whether an action succeeded. See [Gemini Grounding with Google Search](https://ai.google.dev/gemini-api/docs/google-search).
- **Tavily:** For explicit web-search flows (e.g. from context analysis), we use **Tavily** when domain-specific search is needed or when confidence from Google Search grounding is lower.
- **Success threshold:** 0.70 (success = action_succeeded && confidence ≥ 0.70 → route to next action; else correction).
- **Goal-achieved threshold:** 0.70 (goalAchieved = task_completed && confidence ≥ 0.70). When task_completed is true we allow finish in the [0.70, 0.85) band (Task 2: low-confidence completion); single finish, no correction.
- **Low-confidence completion:** When goalAchieved is true and confidence < 0.85 we log "Low confidence completion" for observability; routing is unchanged (goal_achieved → finish).
- Observation-based path (Task 3): no change = !urlChanged && !meaningfulContentChange && !clientSawSomething (clientSawSomething = didNetworkOccur || didDomMutate || didUrlChange). When no change → fail without LLM. Client witness overrides: if extension reports change we proceed with LLM.

---

## Changelog (Summary)

- **v3.0.9 (impl):** **Task 4 — Explicit step-level vs task-level in prompt.** Semantic verification prompts (full-DOM and observation) now include a dedicated "Step-level vs task-level (Task 4)" block using `STEP_TASK_LEVEL_CONTRACT` and `STEP_TASK_LEVEL_EXAMPLE`. Contract: task_completed = true ONLY when entire user request is done; for multi-step tasks set task_completed = false until final step. Example: "Add a patient named Jas" → form open = action_succeeded true, task_completed false. **Progress:** Files: `lib/agent/verification/semantic-verification.ts`. Tests: `lib/agent/__tests__/semantic-verification.test.ts` (2 new tests for prompt contract constants; 10 tests total, all pass). Next: Task 5 (Verification + Planner — pass verification outcome into planning/step_refinement).
- **v3.0.8 (impl):** **Task 3 — State drift: skeleton-primary diff, client witness override.** `buildObservationList` now returns `{ observations, meaningfulContentChange }`. meaningfulContentChange is true only when skeleton diff had items or (no skeleton) domHash changed; when skeleton diff empty but hash changed (e.g. tickers/ads) → false. Engine uses somethingChanged = urlChanged || meaningfulContentChange || clientSawSomething; clientSawSomething includes didUrlChange. When proceeding only due to client report, log "Client witness override". **Progress:** Files: `lib/agent/verification/observation-builder.ts`, `lib/agent/verification-engine.ts`, `lib/agent/verification/index.ts`, `lib/agent/verification/__tests__/observation-builder.test.ts`. Tests: 5 new observation-builder tests + 5 verification-engine tests, all pass. Next: Task 4 (explicit step-level vs task-level in prompt).
- **v3.0.7 (impl):** **Task 2 — Low-confidence completion handling.** When task_completed === true and confidence in [0.70, 0.85) we set goalAchieved = true (single finish) and log "Low confidence completion". Prevents routing to correction or generating another action when the LLM said the goal is done but confidence is medium. Implemented via `computeGoalAchieved(task_completed, confidence)` in `lib/agent/verification-engine.ts`; used in both observation and prediction paths. **Progress:** Files changed: `lib/agent/verification-engine.ts`. Tests: `lib/agent/__tests__/verification-engine.test.ts` (5 tests, all pass). Next: Task 3 (state drift).
- **v3.0.6 (impl):** **Task 1 — Split semantic verification: action_succeeded vs task_completed.** LLM now returns **action_succeeded** (did this action do something useful?) and **task_completed** (is the entire user goal done?). Engine sets goalAchieved = task_completed && confidence ≥ 0.70 (Task 2 band); success = action_succeeded && confidence ≥ 0.7. Router: goalAchieved → goal_achieved; success → planning; else → correction. Prevents premature finish when only one step of N succeeded. **Progress:** Files changed: `lib/agent/verification/semantic-verification.ts` (prompts + parsing + `parseSemanticVerificationResponse`), `lib/agent/verification-engine.ts`, `lib/agent/verification/types.ts`, `lib/agent/graph/types.ts`, `lib/agent/graph/nodes/verification.ts`, `lib/agent/verification/index.ts`. Tests: `lib/agent/__tests__/semantic-verification.test.ts` (8 tests, all pass). Next: Task 2 (low-confidence completion handling).
- **v3.0.5 (doc):** **Client contract and troubleshooting:** Added subsection "Client contract: why the same step can repeat" and "Troubleshooting: same step repeats even when client sends taskId" (taskId required for continuation; check TaskAction persisted, previousActions.length, router). Content consolidated from INTERACT_FLOW_WALKTHROUGH.md; that doc now references this and PLANNER_PROCESS.md.
- **v3.0.4 (doc):** **Multi-step verification and implementation roadmap:** (1) New section **Multi-Step Tasks: Verify Every Step** — N steps ⇒ N verifications (one after each action); goalAchieved only when entire user goal is done; example "Add a patient named Jas" (3 steps). (2) New section **Implementation Tasks (by priority)** — six tasks in order of importance: split action_succeeded vs task_completed, low-confidence completion, state drift (skeleton-primary + client witness), explicit step-level vs task-level in prompt, sub-task-level verification (when hierarchical in graph), extension beforeDomHash (optional).
- **v3.0.3:** **Broader deterministic patterns:** (1) **Critic:** approved set only from `<Approved>YES|NO</Approved>` (no free-text fallback). (2) **Replanning:** `PlanValidationResult.minorModificationsOnly` set when building result; `determineReplanAction` uses only this for modify vs regenerate (no parsing of suggestedChanges text). (3) **Verification display:** `VerificationResult.semanticSummary` set by engine; goal_achieved node uses semanticSummary for description (no parsing of reason for "Semantic verdict: ...").
- **v3.0.2:** **Deterministic task complete:** VerificationResult has **goalAchieved** (set by engine when success && LLM **match** === true && confidence ≥ 0.85). Graph router uses **only** goalAchieved to route to **goal_achieved** node; no parsing of reason text. **goal_achieved** node sets actionResult = finish() → finalize → status completed. Semantic verification prompt updated: contract that **match** = true only when user's goal achieved; system uses match deterministically. Stops "multiple time" loop (repeated click(169)/click(170)). See "Critical: Deterministic Task Complete" and "Common Errors and Pitfalls".
- **v3.0.1:** Verification node uses **only** observation-based verification (`verifyActionWithObservations`). If beforeState is missing, verification is skipped (log warning). Client must send DOM on every call.
- **v3.0:** beforeState (url, domHash, optional semanticSkeleton), clientObservations, buildObservationList, semantic verdict on observations only, verifyActionWithObservations; no full DOM in observation path.
- **v2.1.1:** URL change handling fixes, action type for `<a>` as navigation, "Not Found" penalty exception when URL changed.
- **v2.1:** clientVerification, Not Found penalty cap, client verification weight.
- **v2.0:** urlAtAction, smart previousUrl, regex DOM checks, smart DOM context, confidence tuning.

---

## Progress (Task 3 — State drift)

**What was implemented:** Skeleton-primary: `buildObservationList` returns `meaningfulContentChange` (true only when skeleton diff had items or, without skeleton, domHash changed). When skeleton diff empty but hash changed → no meaningful change (avoids false positive from tickers/ads). Client witness override: `clientSawSomething` includes `didDomMutate` and `didUrlChange`; when extension reports change we proceed with LLM even if server sees no change; log "Client witness override: proceeding with LLM (extension reported change)".

**Files changed:** `lib/agent/verification/observation-builder.ts` (ObservationListResult, meaningfulContentChange), `lib/agent/verification-engine.ts` (use meaningfulContentChange and clientSawSomething with didUrlChange), `lib/agent/verification/index.ts` (export ObservationListResult), `lib/agent/verification/__tests__/observation-builder.test.ts` (new; 5 tests), `docs/VERIFICATION_PROCESS.md`.

**Test summary:** `lib/agent/verification/__tests__/observation-builder.test.ts` — 5 tests, all pass. `lib/agent/__tests__/verification-engine.test.ts` — 5 tests, all pass. Build passes.

**Next steps:** Task 5 (Verification + Planner): Pass verification outcome into planning/step_refinement. See Unified Task Order in VERIFICATION_PROCESS.md.

---

## Progress (Task 4 — Explicit step-level vs task-level in prompt)

**What was implemented:** Both semantic verification prompts (full-DOM and observation-only) now include an explicit "Step-level vs task-level (Task 4)" block. Contract: task_completed = true ONLY when the entire user request is done; for multi-step tasks set task_completed = false until the final step is done. Example: "Add a patient named Jas" → form open = action_succeeded true, task_completed false; final step (Save clicked, success) = action_succeeded true, task_completed true. Implemented via exported constants `STEP_TASK_LEVEL_CONTRACT` and `STEP_TASK_LEVEL_EXAMPLE` in `lib/agent/verification/semantic-verification.ts`.

**Files changed:** `lib/agent/verification/semantic-verification.ts`, `lib/agent/__tests__/semantic-verification.test.ts`, `docs/VERIFICATION_PROCESS.md`.

**Test summary:** `lib/agent/__tests__/semantic-verification.test.ts` — 10 tests (8 existing + 2 new for Task 4 prompt contract), all pass. Build passes.

**Next steps:** Task 5 (Verification + Planner): Pass verification outcome into planning/step_refinement. See Unified Task Order in VERIFICATION_PROCESS.md.

---

## Progress (Task 2 — Low-confidence completion)

**What was implemented:** goalAchieved = task_completed && confidence ≥ 0.70 (single finish); when confidence in [0.70, 0.85) we log "Low confidence completion". No change to routing (goal_achieved → finish). Helper `computeGoalAchieved(task_completed, confidence)` in `lib/agent/verification-engine.ts`; used in both observation and prediction paths.

**Files changed:** `lib/agent/verification-engine.ts`, `lib/agent/__tests__/verification-engine.test.ts`, `docs/VERIFICATION_PROCESS.md`.

**Test summary:** `lib/agent/__tests__/verification-engine.test.ts` — 5 tests, all pass (computeGoalAchieved boundaries and low-confidence band). Build passes.

---

*Document maintained by Engineering. For implementation details, see `lib/agent/verification-engine.ts`, `lib/agent/verification/` (including `semantic-verification.ts` for LLM contract), `lib/agent/graph/nodes/verification.ts` (router), `lib/agent/graph/nodes/goal-achieved.ts`, and `lib/agent/observation/diff-engine.ts`. This doc is the single source of truth for verification and task-complete logic; keep it in sync to avoid errors.*

