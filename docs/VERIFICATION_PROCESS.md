# Verification Process: Step-by-Step Walkthrough

**Purpose:** Explain how the verification system determines whether an action succeeded after the Chrome extension executes it. This document is the **canonical** flow description and **implementation roadmap** for the verification process. **Many errors originate here** — keep this doc in sync with code and use it as the single source of truth.

**Example flow:** Extension executes `click(169)` → sends updated DOM/URL → backend verifies if the click achieved its goal → if **goalAchieved** is true, task completes with `finish()` (no word-based parsing).

**Focus:** Verification is **DOM-based only** (DOM snapshot, URL, optional semantic skeleton). Screenshot-, vision-, or image-based verification is **out of scope** for now.

---

## Critical: Deterministic Task Complete (goalAchieved)

**Do not** decide "task complete" by parsing the verification **reason** text (e.g. looking for "successful", "completed", "aligns with the user's goal"). Wording changes break routing.

**Contract:**

1. **Semantic LLM** returns JSON: `{ "match": true|false, "confidence": 0.0-1.0, "reason": "..." }`.
   - **`match`** = true **only** when the user's goal was achieved (e.g. they asked to go to overview and the page now shows overview). The system uses **`match`** deterministically to decide task complete.
   - **`reason`** is for logs and UI only; routing must **not** depend on its wording.

2. **Verification engine** sets **`goalAchieved`** on the result (Task 2: low-confidence completion band):
   - `goalAchieved = task_completed && confidence >= 0.70` (via `computeGoalAchieved()`). When goalAchieved is true and confidence < 0.85 we log "Low confidence completion" for observability; routing is unchanged (goal_achieved → finish).
   - So: LLM said **task_completed = true** and confidence ≥ 0.70 → goalAchieved = true (single finish); confidence in [0.70, 0.85) is logged as low-confidence completion.

3. **Graph router** uses **only** `verificationResult.goalAchieved === true` to route to **goal_achieved** (task complete). No parsing of `reason`.

**Files:** `lib/agent/verification-engine.ts` (sets goalAchieved), `lib/agent/verification/semantic-verification.ts` (LLM contract), `lib/agent/graph/nodes/verification.ts` (router checks goalAchieved only), `lib/agent/graph/nodes/goal-achieved.ts` (sets actionResult to finish()).

**Other deterministic patterns (do not parse reason text for routing):**

- **Replanning:** Router uses **only** `replanningResult.planRegenerated === true` to route to planning after a regenerated plan (not `reason.includes("regenerated")`). Modify vs regenerate uses **only** `validationResult.minorModificationsOnly === true` (set when building PlanValidationResult from suggestedChanges); no parsing of change text in `determineReplanAction`. See `lib/agent/replanning-engine.ts` (PlanValidationResult.minorModificationsOnly, determineReplanAction).
- **Semantic verification fallback:** When the LLM returns invalid JSON, we default to `match: false` (not inferred from free text) so we never treat a malformed response as goal achieved. See `lib/agent/verification/semantic-verification.ts` (catch block).
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

### Step 2 — Extension Captures New State

After execution: DOM snapshot (`document.documentElement.outerHTML`), current URL, and optionally previous URL and **clientObservations** (didNetworkOccur, didDomMutate, didUrlChange).

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

**For Step 5 (Run Verification), Semantic Verification LLM contract, Semantic Skeleton Diff, DOM-Based Checks, Confidence calculation, Action Type, Outcome Prediction, Correction, Data Structures, Goal_Achieved node, Common Errors, Configuration, and Changelog** see **[VERIFICATION_PROCESS_DETAILS.md](./VERIFICATION_PROCESS_DETAILS.md)**. Each doc is kept under 500 lines.

---

*Document maintained by Engineering. For implementation details, see `lib/agent/verification-engine.ts`, `lib/agent/verification/` (including `semantic-verification.ts` for LLM contract), `lib/agent/graph/nodes/verification.ts` (router), `lib/agent/graph/nodes/goal-achieved.ts`, and `lib/agent/observation/diff-engine.ts`. This doc is the single source of truth for verification and task-complete logic; keep it in sync to avoid errors.*

