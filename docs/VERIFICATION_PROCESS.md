# Verification Process: Step-by-Step Walkthrough

**Purpose:** Explain how the verification system determines whether an action succeeded after the Chrome extension executes it. This document is the **canonical** flow description and **implementation roadmap** for the verification process. **Many errors originate here** — keep this doc in sync with code and use it as the single source of truth.

**Example flow:** Extension executes `click(169)` → sends updated DOM/URL → backend verifies if the click achieved its goal → if **goalAchieved** is true, task completes with `finish()` (no word-based parsing).

---

## Critical: Deterministic Task Complete (goalAchieved)

**Do not** decide "task complete" by parsing the verification **reason** text (e.g. looking for "successful", "completed", "aligns with the user's goal"). Wording changes break routing.

**Contract:**

1. **Semantic LLM** returns JSON: `{ "match": true|false, "confidence": 0.0-1.0, "reason": "..." }`.
   - **`match`** = true **only** when the user's goal was achieved (e.g. they asked to go to overview and the page now shows overview). The system uses **`match`** deterministically to decide task complete.
   - **`reason`** is for logs and UI only; routing must **not** depend on its wording.

2. **Verification engine** sets **`goalAchieved`** on the result:
   - `goalAchieved = success && (semanticResult.match === true) && (confidence >= 0.85)`.
   - So: verification passed (confidence ≥ 0.70), LLM said **match = true**, and confidence ≥ 0.85.

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

## High-Level Loop

Verification is **observation-based only**. The client sends DOM on every call; we save **beforeState** (url, domHash, and optionally semanticSkeleton) when we generate an action. On the next request we compare that state to the current state and ask the LLM if the observed changes match the user's goal.

1. **Extension** executes action (e.g., `click(169)`) on the page.
2. **Extension** captures new state: DOM snapshot, current URL. **(DOM on every call is required.)**
3. **Extension** sends `POST /api/agent/interact` with `{ dom, url, taskId }` (and optionally `clientObservations`).
4. **Backend** loads task context: previous action and **beforeState** (url, domHash, optional semanticSkeleton from when that action was generated).
5. **Verification Engine** compares beforeState vs current (url, domHash, and when available semantic skeleton), builds an **observation list**, then asks the LLM for a **semantic verdict** (on observations only — no full DOM).
6. **Router** decides based on result:
   - **goalAchieved === true** (set by engine when success && LLM `match` === true && confidence ≥ 0.85) → Route to **goal_achieved** node → sets `actionResult = finish()` → **finalize** → status **completed** (task ends; no more actions).
   - Success but goalAchieved !== true → Generate next action (planning → step_refinement / action_generation).
   - Failure (confidence < 70%) → Route to correction node.

### Visual Flow

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
    │                            │    { success, confidence, reason, goalAchieved }
    │                            │    (goalAchieved = success && match && confidence≥0.85)
    │                            │                                  │
    │                            │  5. Route: goal_achieved (if goalAchieved) else
    │                            │     next action or correct
    │ ◀──────────────────────────│
    │    { action, thought }     │
```

---

## Multi-Action Task: Full Flow with Database Objects

Example: user goal **"Go to overview, then open the Settings tab"** — two actions in sequence. The client sends **DOM on every call**; the server saves **beforeState** when it generates each action, then verifies using observation-based comparison on the next request.

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
  - Integrate `clientObservations` (network, DOM mutate, URL change).
  - If **no change at all** (URL same, domHash same, no client observations) → fail without LLM.
  - Else → LLM semantic verdict on observation list only → success if confidence ≥ 0.70.
  - **goalAchieved** = success && (LLM returned **match** = true) && (confidence ≥ 0.85). Set on VerificationResult; router uses **only** this (no parsing of reason text).
- **If goalAchieved === true:** Route to **goal_achieved** → set actionResult to `finish()` → finalize → status **completed** (task ends).
- **Else:** Generate next action (e.g. "Settings" tab) and save new TaskAction with new beforeState.

**Server responds:** `{ taskId, action, thought }` or finish if task complete (goalAchieved was true).

---

### Request 3 — After second action

Same pattern: load last action and beforeState, run observation-based verification, then either generate next action, finish, or correct.

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

### Step 5 — Run Verification (Observation-Based Only)

**Where:** Verification node → `verifyActionWithObservations` in verification engine.

**Inputs:** beforeState (url, domHash, optional semanticSkeleton), currentDom, currentUrl, action, userGoal, clientObservations, context.

**Logic:**

1. **Compute after state:** `afterDomHash = computeDomHash(currentDom)`.
2. **Build observation list:** `buildObservationList(beforeState, currentUrl, afterDomHash, afterActiveElement?, clientObservations?, currentDom?)`
   - **URL:** If beforeState.url ≠ currentUrl → "Navigation occurred: URL changed from … to …". Else → "URL did not change".
   - **Page content:**
     - If `beforeState.semanticSkeleton` and `currentDom` are both present:
       - Extract current skeleton from currentDom (`extractSemanticSkeleton`).
       - Diff before vs current skeleton with microdiff (`getGranularObservation`).
       - If diff returns items → add those as observations (e.g. "Element 'id' changed 'text' from 'Save' to 'Saved'", "New message/alert appeared: …").
       - If diff is empty but domHash changed → "Page content updated (DOM changed; no interactive element changes detected)".
       - If diff is empty and domHash same → "Page content did not change (no interactive element or alert changes)".
       - On any skeleton/diff error → fall back to hash-only.
     - **Hash-only path:** If beforeState.domHash ≠ afterDomHash → "Page content updated (DOM changed)". Else → "Page content did not change (DOM hash identical)".
   - **Focus:** If activeElement changed, add observation.
   - **Client witness:** If clientObservations.didNetworkOccur → add "Background network activity detected"; if didDomMutate → "DOM was mutated"; if didUrlChange defined → "Extension reported URL changed: true/false".
3. **No change at all:** If URL did not change, domHash is identical, and no client observation (no network, no DOM mutate) → **return failure without calling the LLM** (confidence 0.2, reason includes observation list). Do **not** set goalAchieved.
4. **Semantic verdict:** Call LLM with **only** user goal, action, and observation list (no full DOM). LLM returns **match** (boolean), confidence, reason. **Contract (see Semantic Verification LLM below):** `match` = true only when the user's goal was achieved; the system uses `match` deterministically — do not rely on wording in `reason`.
5. **Result:** success = (confidence ≥ 0.70). Set **goalAchieved** = success && (semanticResult.match === true) && (confidence ≥ 0.85). Return VerificationResult with success, confidence, reason, comparison.semanticMatch, and **goalAchieved**.
6. **Graph router (verification node):** Uses **only** `verificationResult.goalAchieved === true` to route to **goal_achieved**. No parsing of `reason` (no word-based signals). If goalAchieved → goal_achieved node → sets actionResult = { action: "finish()", thought: "..." } → finalize → status **completed**.

---

## Semantic Verification LLM Contract

**Where:** `lib/agent/verification/semantic-verification.ts` — `performSemanticVerificationOnObservations`.

**Input:** User goal, action executed, observation list (URL change, element appeared/disappeared, clientObservations, etc.). No full DOM.

**Output (JSON only):** `{ "match": true|false, "confidence": 0.0-1.0, "reason": "Brief explanation" }`.

**Contract (must be reflected in the prompt):**

- **`match`**: Set to **true** only when the observed changes indicate that the **user's goal was achieved** (e.g. user asked "go to overview" and the page now shows overview content or URL changed to overview). Set to **false** otherwise.
- The system uses **`match`** deterministically to decide task complete (goalAchieved). Do **not** rely on wording in **`reason`** for routing — if the LLM says "completed" or "successful" in reason but returns match=false, the task will not complete; if match=true, the task completes regardless of reason text.
- **`reason`**: User-friendly explanation for logs and UI only. Avoid changing routing logic based on reason strings (e.g. no scanning for "successful" vs "completed").

**Guidelines in prompt:** URL changed + navigation goal → match true; page content updated + goal to see new content → match true; no changes → match false. Be decisive; high confidence when observations clearly support success or failure.

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

**Where:** `lib/utils/dom-helpers.ts`. Used by the **prediction-based** verification path (`verifyAction`), not by the observation-based path.

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

When we generate an action, we optionally predict expected outcome (description + domChanges). For dropdown/navigation we use fixed templates; for generic we use LLM. LLM often guesses wrong selectors; that’s why verification is observation-based (compare before/after state, not prediction vs DOM).

---

## Correction Loop

**Where:** `lib/agent/graph/nodes/correction.ts`.

When observation-based verification fails (confidence < 70%), the correction node gets the failure reason and DOM and suggests a recovery strategy (e.g. RETRY_WITH_DELAY, ALTERNATIVE_SELECTOR, SCROLL_INTO_VIEW, REFRESH_PAGE, FAIL after max retries). Strategy is converted to a retry action (e.g. `wait(0.5)`, new selector, `fail()`).

---

## Data Structures (Logical)

- **beforeState (TaskAction):** `{ url, domHash, activeElement?, semanticSkeleton? }`. Captured when the action is generated. Verification compares this to current url/dom/skeleton.
- **VerificationResult (engine):** success (confidence ≥ 0.70), confidence, reason, expectedState, actualState, comparison (domChecks, semanticMatch, overallMatch, nextGoalCheck), **goalAchieved**, **semanticSummary**. **goalAchieved** = success && (semanticResult.match === true) && (confidence ≥ 0.85). **semanticSummary** = first 300 chars of semantic verdict reason (for display only). Set by engine only; graph uses goalAchieved only to route; goal_achieved node uses semanticSummary for description (no parsing of reason).
- **VerificationResult (graph state):** Same shape; goalAchieved and semanticSummary passed through from engine. Router checks **only** `verificationResult.goalAchieved === true`.
- **ClientObservations (request):** Optional `{ didNetworkOccur?, didDomMutate?, didUrlChange? }` from the extension.
- **ExpectedOutcome:** Used for correction and prediction-based path; includes description, domChanges (elementShouldExist, urlShouldChange, attributeChanges, elementsToAppear), nextGoal.

---

## Goal_Achieved Node and Task Complete Flow

**Where:** `lib/agent/graph/nodes/goal-achieved.ts`, `lib/agent/graph/interact-graph.ts`.

**When:** Router sees `verificationResult.goalAchieved === true` after the verification node.

**What:** goal_achieved node sets:
- **actionResult** = `{ thought: "Task complete. ...", action: "finish()" }`.
- **expectedOutcome** = description from **verificationResult.semanticSummary** (set by engine); fallback to reason substring if semanticSummary missing. Do not parse reason text (e.g. "Semantic verdict: ...") for display.
- Then graph edges: goal_achieved → **finalize**. Finalize node sees actionResult.action.startsWith("finish(") and sets status to **completed**.

**Why:** Stops the "multiple time" loop: without this, after verification passed the graph always went to planning → action_generation and produced another click (e.g. click(169) again). With goalAchieved and the goal_achieved node, we complete the task once when the semantic LLM says match=true with high confidence.

**Critical:** Do not replace this with word-based checks on reason (e.g. "successful", "completed"). Use only the **goalAchieved** flag set by the engine from the LLM's **match** field.

---

## Common Errors and Pitfalls

1. **Parsing `reason` to decide task complete:** Do not scan for words like "successful", "completed", "aligns with the user's goal" in verificationResult.reason. The LLM may use different wording; routing must use only **goalAchieved** (which is set from the LLM's **match** boolean and confidence).
2. **Relying on LLM wording in `reason`:** The prompt must state that **match** is the contract for "goal achieved". If the prompt does not make this clear, the LLM might set match=false but write "task completed" in reason — routing would then fail to complete the task.
3. **Missing goalAchieved on error path:** If verification throws, the catch block returns a synthetic success (e.g. confidence 0.5). Do **not** set goalAchieved in that path (leave undefined) so we don't complete the task on error.
4. **Skipping verification when beforeState is missing:** If lastAction exists but beforeState is missing, we skip verification and continue (log warning). In that case verificationResult is undefined; goalAchieved is not set; router goes to planning. Document this so future changes don't assume verificationResult is always present after verification node.
5. **Changing confidence threshold without doc:** goalAchieved uses confidence ≥ 0.85. If this threshold is changed in code, update this doc and the "Configuration" section.
6. **Parsing critic or replanning text for routing:** Critic approval must come only from `<Approved>YES|NO</Approved>`. Replanning modify vs regenerate must use `minorModificationsOnly` only (set when building PlanValidationResult); do not re-parse suggestedChanges strings in determineReplanAction.

---

## Configuration

- **VERIFICATION_MODEL:** Model for semantic verification (default e.g. gpt-4o-mini).
- **Success threshold:** 0.70 (confidence ≥ 0.70 → success).
- **Goal-achieved threshold:** 0.85 (goalAchieved = success && match && confidence ≥ 0.85). Used only for routing to goal_achieved; do not confuse with success threshold.
- Observation-based path: no change (URL same, hash same, no client observations) → fail without LLM.

---

## Changelog (Summary)

- **v3.0.3:** **Broader deterministic patterns:** (1) **Critic:** approved set only from `<Approved>YES|NO</Approved>` (no free-text fallback). (2) **Replanning:** `PlanValidationResult.minorModificationsOnly` set when building result; `determineReplanAction` uses only this for modify vs regenerate (no parsing of suggestedChanges text). (3) **Verification display:** `VerificationResult.semanticSummary` set by engine; goal_achieved node uses semanticSummary for description (no parsing of reason for "Semantic verdict: ...").
- **v3.0.2:** **Deterministic task complete:** VerificationResult has **goalAchieved** (set by engine when success && LLM **match** === true && confidence ≥ 0.85). Graph router uses **only** goalAchieved to route to **goal_achieved** node; no parsing of reason text. **goal_achieved** node sets actionResult = finish() → finalize → status completed. Semantic verification prompt updated: contract that **match** = true only when user's goal achieved; system uses match deterministically. Stops "multiple time" loop (repeated click(169)/click(170)). See "Critical: Deterministic Task Complete" and "Common Errors and Pitfalls".
- **v3.0.1:** Verification node uses **only** observation-based verification (`verifyActionWithObservations`). If beforeState is missing, verification is skipped (log warning). Client must send DOM on every call.
- **v3.0:** beforeState (url, domHash, optional semanticSkeleton), clientObservations, buildObservationList, semantic verdict on observations only, verifyActionWithObservations; no full DOM in observation path.
- **v2.1.1:** URL change handling fixes, action type for `<a>` as navigation, "Not Found" penalty exception when URL changed.
- **v2.1:** clientVerification, Not Found penalty cap, client verification weight.
- **v2.0:** urlAtAction, smart previousUrl, regex DOM checks, smart DOM context, confidence tuning.

---

*Document maintained by Engineering. For implementation details, see `lib/agent/verification-engine.ts`, `lib/agent/verification/` (including `semantic-verification.ts` for LLM contract), `lib/agent/graph/nodes/verification.ts` (router), `lib/agent/graph/nodes/goal-achieved.ts`, and `lib/agent/observation/diff-engine.ts`. This doc is the single source of truth for verification and task-complete logic; keep it in sync to avoid errors.*
